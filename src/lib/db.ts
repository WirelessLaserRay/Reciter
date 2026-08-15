import type { Card, CardState, DailyStats, Deck, ReviewLog } from "@/types";
import type { SQLBackend } from "@/lib/sql/backend";
import { TauriBackend } from "@/lib/sql/tauri-backend";
import { SqlJsBackend } from "@/lib/sql/sqljs-backend";
import { isTauri } from "@/lib/env";
import { runMigrations } from "@/lib/migrations";

export interface UpsertResult {
  cardId: number;
  created: boolean;
}

/** 学习队列行（cards JOIN card_states 扁平化） */
export interface StudyCardRow {
  card_id: number;
  deck_id: number;
  front: string;
  back: string;
  markdown_content: string;
  tags: string;
  is_key: number;
  state: number;
  stability: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  desired_retention: number;
  algorithm_version: string;
}

export interface ReviewLogInsert {
  card_id: number;
  grade: 1 | 2 | 3 | 4;
  response_time_ms?: number | null;
  source?: "review" | "quiz" | "ai_test";
  ai_question?: string | null;
  ai_answer?: string | null;
}

/** 词库掌握度分布（Phase 6C 掌握度全景；四类互斥，合计 = total） */
export interface MasteryDistribution {
  mastered: number;  // 已掌握：stability >= 15 且 lapses < 4
  learning: number;  // 学习中：0 < stability < 15 且 lapses < 4
  weak: number;      // 弱词：lapses >= 4
  unlearned: number; // 未学习：state = 0 且 lapses < 4
  total: number;
}

/** 词库 TOP 弱词（掌握度全景用） */
export interface DeckWeakWord {
  front: string;
  lapses: number;
  stability: number;
}

/**
 * SQLite 数据库封装（tauri-plugin-sql）
 * - 迁移由 Rust 侧插件自动执行（src-tauri/migrations/001_init.sql）
 * - 表结构见 PLAN.md：decks / cards / card_states / review_logs / settings / daily_stats
 */
/** 当前时间 ISO-8601 UTC（所有时间写入统一格式） */
function nowIso(): string {
  return new Date().toISOString();
}

/** 标签过滤 SQL 片段（tags 为 JSON 数组字符串，精确匹配引号包裹的标签） */
function tagWhere(tag?: string): string {
  return tag ? " AND c.tags LIKE ?" : "";
}
function tagParam(tag?: string): string[] {
  return tag ? ['%"' + tag + '"%'] : [];
}

class ReciterDB {
  private backend: SQLBackend | null = null;
  private readyPromise: Promise<void> | null = null;

  /**
   * 加载数据库（幂等）：Tauri 环境用 tauri-plugin-sql；Web/PWA 用 sql.js（WASM SQLite + IndexedDB）。
   * 两种后端跑完全相同的 SQL，Windows 端行为与之前完全一致。
   */
  init(backend?: SQLBackend): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        const b: SQLBackend = backend ?? (isTauri() ? new TauriBackend() : new SqlJsBackend());
        await b.init();
        if (b.kind === "sqljs") {
          // Web 端无 Rust 迁移，手动执行镜像迁移（幂等）
          await runMigrations(b);
        }
        this.backend = b;
      })();
    }
    return this.readyPromise;
  }


  /** 强制重新初始化（测试用） */
  async reinit(): Promise<void> {
    this.readyPromise = null;
    this.backend = null;
    await this.init();
  }

  /** 数据库二进制快照（原子导入回滚用；Tauri 端返回 null 表示无需回滚） */
  snapshot(): Uint8Array | null {
    if (this.backend?.kind === "sqljs") {
      return (this.backend as import("@/lib/sql/sqljs-backend").SqlJsBackend).exportSnapshot();
    }
    return null;
  }

  /** 从快照恢复 */
  async restoreSnapshot(bytes: Uint8Array): Promise<void> {
    if (this.backend?.kind === "sqljs") {
      await (this.backend as import("@/lib/sql/sqljs-backend").SqlJsBackend).restoreSnapshot(bytes);
    }
  }

  /** 立即持久化（sql.js 防抖保存的强刷；Tauri 端无操作） */
  async flush(): Promise<void> {
    if (this.backend?.kind === "sqljs") {
      await (this.backend as import("@/lib/sql/sqljs-backend").SqlJsBackend).flush();
    }
  }

  private requireDb(): SQLBackend {
    if (!this.backend) throw new Error("数据库未初始化，请先调用 db.init()");
    return this.backend;
  }

  // ==================== Decks ====================

  async getDecks(): Promise<Deck[]> {
    return this.requireDb().select<Deck[]>("SELECT * FROM decks ORDER BY created_at DESC, id DESC");
  }

  async getDeck(id: number): Promise<Deck | null> {
    const rows = await this.requireDb().select<Deck[]>("SELECT * FROM decks WHERE id = ?", [id]);
    return rows[0] ?? null;
  }

  async getDeckIdByName(name: string): Promise<number | null> {
    const rows = await this.requireDb().select<{ id: number }[]>("SELECT id FROM decks WHERE name = ?", [name]);
    return rows[0]?.id ?? null;
  }

  /** 创建词库；已存在同名则直接返回其 id；新建时应用全局默认每日新卡配额设置 */
  async createDeck(name: string, description = "", newPerDay?: number): Promise<number> {
    const db = this.requireDb();
    let quota = newPerDay;
    if (quota === undefined) {
      const raw = await this.getSetting("default_new_per_day");
      const parsed = raw ? parseInt(raw, 10) : NaN;
      quota = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
    }
    await db.execute(
      "INSERT OR IGNORE INTO decks (name, description, new_cards_per_day, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [name, description, quota, nowIso(), nowIso()]
    );
    const rows = await db.select<{ id: number }[]>("SELECT id FROM decks WHERE name = ?", [name]);
    return rows[0].id;
  }

  async updateDeck(
    id: number,
    data: Partial<Pick<Deck, "name" | "description" | "new_cards_per_day">>
  ): Promise<void> {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (data.name !== undefined) { sets.push("name = ?"); params.push(data.name); }
    if (data.description !== undefined) { sets.push("description = ?"); params.push(data.description); }
    if (data.new_cards_per_day !== undefined) { sets.push("new_cards_per_day = ?"); params.push(data.new_cards_per_day); }
    if (sets.length === 0) return;
    params.push(nowIso());
    sets.push("updated_at = ?");
    params.push(id);
    await this.requireDb().execute(`UPDATE decks SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async deleteDeck(id: number): Promise<void> {
    await this.requireDb().execute("DELETE FROM decks WHERE id = ?", [id]);
  }

  /** 各词库卡片数 { deck_id: count } */
  async getDeckCardCounts(): Promise<Record<number, number>> {
    const rows = await this.requireDb().select<{ deck_id: number; cnt: number }[]>(
      "SELECT deck_id, COUNT(*) AS cnt FROM cards GROUP BY deck_id"
    );
    const map: Record<number, number> = {};
    for (const r of rows) map[r.deck_id] = r.cnt;
    return map;
  }

  async getTotalCardCount(): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>("SELECT COUNT(*) AS cnt FROM cards");
    return rows[0]?.cnt ?? 0;
  }

  // ==================== Cards ====================

  async getCardsByDeck(deckId: number): Promise<Card[]> {
    return this.requireDb().select<Card[]>(
      "SELECT * FROM cards WHERE deck_id = ? ORDER BY id ASC",
      [deckId]
    );
  }

  async getCard(id: number): Promise<Card | null> {
    const rows = await this.requireDb().select<Card[]>("SELECT * FROM cards WHERE id = ?", [id]);
    return rows[0] ?? null;
  }

  /** 词库内全部标签（去重，用于按标签筛选学习） */
  async getDeckTags(deckId: number): Promise<string[]> {
    const rows = await this.requireDb().select<{ tags: string }[]>(
      "SELECT tags FROM cards WHERE deck_id = ? AND tags != '[]'",
      [deckId]
    );
    const set = new Set<string>();
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.tags);
        if (Array.isArray(arr)) arr.forEach((t) => set.add(String(t)));
      } catch {
        // 忽略损坏标签
      }
    }
    return [...set].sort();
  }

  /** 词库内各标签卡片数（按标签学习入口用） */
  async getDeckTagsWithCount(deckId: number): Promise<{ tag: string; count: number }[]> {
    const rows = await this.requireDb().select<{ tags: string }[]>(
      "SELECT tags FROM cards WHERE deck_id = ? AND tags != '[]'",
      [deckId]
    );
    const map = new Map<string, number>();
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.tags);
        if (Array.isArray(arr)) for (const t of arr) map.set(String(t), (map.get(String(t)) ?? 0) + 1);
      } catch {
        // 忽略损坏标签
      }
    }
    return [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag, "zh-CN"));
  }

  /** 词库内重点词数量 */
  async getDeckKeyCount(deckId: number): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM cards WHERE deck_id = ? AND is_key = 1",
      [deckId]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 词库掌握度分布（Phase 6C）：四类互斥，合计 = total */
  async getDeckMasteryDistribution(deckId: number): Promise<MasteryDistribution> {
    const rows = await this.requireDb().select<MasteryDistribution[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN cs.lapses >= 4 THEN 1 ELSE 0 END), 0) AS weak,
         COALESCE(SUM(CASE WHEN cs.lapses < 4 AND cs.state = 0 THEN 1 ELSE 0 END), 0) AS unlearned,
         COALESCE(SUM(CASE WHEN cs.lapses < 4 AND cs.state != 0 AND cs.stability >= 15 THEN 1 ELSE 0 END), 0) AS mastered,
         COALESCE(SUM(CASE WHEN cs.lapses < 4 AND cs.state != 0 AND cs.stability < 15 THEN 1 ELSE 0 END), 0) AS learning,
         COUNT(*) AS total
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ?`,
      [deckId]
    );
    const r = rows[0];
    return r ?? { mastered: 0, learning: 0, weak: 0, unlearned: 0, total: 0 };
  }

  /** 词库 TOP N 弱词（按遗忘次数降序、稳定性升序） */
  async getDeckTopWeakWords(deckId: number, limit = 5): Promise<DeckWeakWord[]> {
    return this.requireDb().select<DeckWeakWord[]>(
      `SELECT c.front, cs.lapses, cs.stability
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.lapses >= 4
       ORDER BY cs.lapses DESC, cs.stability ASC
       LIMIT ?`,
      [deckId, limit]
    );
  }

  /** 词库内已存在的 front 集合（冲突检测用，一次查询） */
  async getExistingFronts(deckId: number): Promise<Set<string>> {
    const rows = await this.requireDb().select<{ front: string }[]>(
      "SELECT front FROM cards WHERE deck_id = ?",
      [deckId]
    );
    return new Set(rows.map((r) => r.front));
  }

  /**
   * 卡片 upsert：按 (deck_id, front) UNIQUE 匹配，存在则更新、不存在则新建（保留复习进度）
   * @param knownExisting 预览阶段缓存的 front 集合，避免逐行查询（可选）
   */
  async upsertCard(
    opts: {
      deckId: number;
      front: string;
      back: string;
      markdown?: string;
      sourceType?: "markdown" | "csv" | "json" | "manual";
      tags?: string[];
      isKey?: number;
    },
    knownExisting?: Set<string>
  ): Promise<UpsertResult> {
    const db = this.requireDb();
    const wasKnown = knownExisting ? knownExisting.has(opts.front) : false;
    const tags = JSON.stringify(opts.tags ?? []);
    const rows = await db.select<{ id: number }[]>(
      `INSERT INTO cards (deck_id, front, back, markdown_content, source_type, tags, is_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(deck_id, front) DO UPDATE SET
         back = excluded.back,
         markdown_content = excluded.markdown_content,
         source_type = excluded.source_type,
         tags = excluded.tags,
         is_key = excluded.is_key,
         updated_at = excluded.updated_at
       RETURNING id`,
      [opts.deckId, opts.front, opts.back, opts.markdown ?? "", opts.sourceType ?? "manual", tags, opts.isKey ?? 0, nowIso(), nowIso()]
    );
    const cardId = rows[0].id;
    if (knownExisting && !wasKnown) knownExisting.add(opts.front);
    // 新卡片初始化 FSRS 记忆状态（保留进度关键）
    if (!wasKnown) {
      await db.execute("INSERT OR IGNORE INTO card_states (card_id) VALUES (?)", [cardId]);
    }
    return { cardId, created: !wasKnown };
  }

  /** 编辑卡片（front/back/tags） */
  async updateCard(
    id: number,
    data: Partial<Pick<Card, "front" | "back" | "tags" | "markdown_content" | "is_key">>
  ): Promise<void> {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (data.front !== undefined) { sets.push("front = ?"); params.push(data.front); }
    if (data.back !== undefined) { sets.push("back = ?"); params.push(data.back); }
    if (data.tags !== undefined) { sets.push("tags = ?"); params.push(data.tags); }
    if (data.markdown_content !== undefined) { sets.push("markdown_content = ?"); params.push(data.markdown_content); }
    if (data.is_key !== undefined) { sets.push("is_key = ?"); params.push(data.is_key); }
    if (sets.length === 0) return;
    params.push(nowIso());
    sets.push("updated_at = ?");
    params.push(id);
    await this.requireDb().execute(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async deleteCard(id: number): Promise<void> {
    await this.requireDb().execute("DELETE FROM cards WHERE id = ?", [id]);
  }

  // ==================== CardStates ====================

  async initCardState(cardId: number): Promise<void> {
    await this.requireDb().execute("INSERT OR IGNORE INTO card_states (card_id) VALUES (?)", [cardId]);
  }

  async getCardState(cardId: number): Promise<CardState | null> {
    const rows = await this.requireDb().select<CardState[]>(
      "SELECT * FROM card_states WHERE card_id = ?",
      [cardId]
    );
    return rows[0] ?? null;
  }

  /** 词库内已学习（reps > 0）与待复习（due <= now）卡片数 */
  async getDeckProgress(deckId: number): Promise<{ learned: number; due: number }> {
    const db = this.requireDb();
    const now = new Date().toISOString();
    const learned = await db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM card_states cs JOIN cards c ON c.id = cs.card_id WHERE c.deck_id = ? AND cs.reps > 0",
      [deckId]
    );
    const due = await db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM card_states cs JOIN cards c ON c.id = cs.card_id WHERE c.deck_id = ? AND cs.due <= ? AND cs.reps > 0",
      [deckId, now]
    );
    return { learned: learned[0]?.cnt ?? 0, due: due[0]?.cnt ?? 0 };
  }

  async updateCardState(cardId: number, state: Partial<CardState>): Promise<void> {
    const db = this.requireDb();
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    const allowed = [
      "state", "stability", "difficulty", "due", "last_review",
      "elapsed_days", "scheduled_days", "reps", "lapses", "desired_retention", "algorithm_version",
    ] as const;
    for (const key of allowed) {
      const v = (state as Record<string, unknown>)[key];
      if (v !== undefined) { sets.push(`${key} = ?`); params.push(v as string | number | null); }
    }
    if (sets.length === 0) return;
    params.push(cardId);
    await db.execute(`UPDATE card_states SET ${sets.join(", ")} WHERE card_id = ?`, params);
  }

  // ==================== ReviewLogs ====================

  async addReviewLog(log: ReviewLogInsert): Promise<void> {
    await this.requireDb().execute(
      `INSERT INTO review_logs (card_id, grade, reviewed_at, response_time_ms, source, ai_question, ai_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        log.card_id,
        log.grade,
        nowIso(),
        log.response_time_ms ?? null,
        log.source ?? "review",
        log.ai_question ?? null,
        log.ai_answer ?? null,
      ]
    );
  }

  async getReviewLogs(cardId?: number): Promise<ReviewLog[]> {
    if (cardId !== undefined) {
      return this.requireDb().select<ReviewLog[]>(
        "SELECT * FROM review_logs WHERE card_id = ? ORDER BY reviewed_at DESC",
        [cardId]
      );
    }
    return this.requireDb().select<ReviewLog[]>("SELECT * FROM review_logs ORDER BY reviewed_at DESC");
  }

  // ==================== 弱词追踪（Phase 6B） ====================

  /** 获取弱词列表（lapses >= threshold，按 lapses 降序、stability 升序；默认阈值 4，P1-⑤） */
  async getWeakCards(deckId: number, threshold = 4, limit = 50): Promise<(Card & CardState)[]> {
    return this.requireDb().select(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.source_type, c.tags, c.is_key,
              c.created_at, c.updated_at,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.lapses >= ?
       ORDER BY cs.lapses DESC, cs.stability ASC
       LIMIT ?`,
      [deckId, threshold, limit]
    );
  }

  /** 全局弱词计数（默认阈值 4） */
  async getGlobalWeakCount(threshold = 4): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM card_states WHERE lapses >= ?",
      [threshold]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 获取指定卡片最近 N 次评分（按时间倒序） */
  async getRecentGrades(cardId: number, n = 3): Promise<number[]> {
    const rows = await this.requireDb().select<{ grade: number }[]>(
      "SELECT grade FROM review_logs WHERE card_id = ? ORDER BY reviewed_at DESC LIMIT ?",
      [cardId, n]
    );
    return rows.map((r) => r.grade);
  }

  // ==================== Settings (KV) ====================

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.requireDb().select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = ?",
      [key]
    );
    return rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.requireDb().execute(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value]
    );
  }


  // ==================== 学习队列查询（Phase 3） ====================

  /** 今日到期卡片（state != 0 且 due <= before，含 Learning/Review/Relearning），按 due 升序；可按标签过滤 */
  async getDueCards(deckId: number, before: string, tag?: string, keyOnly = false, limit?: number): Promise<StudyCardRow[]> {
    const params: (string | number)[] = [deckId, before, ...tagParam(tag), keyOnly ? 1 : 0, keyOnly ? 1 : 0];
    const limitSql = limit !== undefined ? " LIMIT ?" : "";
    if (limit !== undefined) params.push(limit);
    return this.requireDb().select<StudyCardRow[]>(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.tags, c.is_key,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.state != 0 AND cs.due <= ? AND (? = 0 OR c.is_key = ?)${tagWhere(tag)}
       ORDER BY
          CASE WHEN cs.state IN (1, 3) THEN 0 ELSE 1 END,
          cs.due ASC, c.id ASC${limitSql}`,
      params
    );
  }

  /** 新卡片（state = 0），按 id 升序取 limit 张；可按标签过滤 */
  async getNewCards(deckId: number, limit: number, tag?: string, keyOnly = false): Promise<StudyCardRow[]> {
    const params: (string | number)[] = [deckId, ...tagParam(tag), keyOnly ? 1 : 0, keyOnly ? 1 : 0, limit];
    return this.requireDb().select<StudyCardRow[]>(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.tags, c.is_key,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.state = 0 AND (? = 0 OR c.is_key = ?)${tagWhere(tag)}
       ORDER BY c.id ASC
       LIMIT ?`,
      params
    );
  }

  /** 今日已学习的新卡数（卡片首次复习发生在 dayStart 之后） */
  async countNewLearnedToday(deckId: number, dayStart: string): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM cards c
       WHERE c.deck_id = ?
         AND EXISTS (SELECT 1 FROM review_logs r WHERE r.card_id = c.id AND r.reviewed_at >= ?)
         AND NOT EXISTS (SELECT 1 FROM review_logs r2 WHERE r2.card_id = c.id AND r2.reviewed_at < ?)`,
      [deckId, dayStart, dayStart]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 全局今日已复习数（日报复习预算） */
  async countReviewsToday(dayStart: string): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM review_logs WHERE reviewed_at >= ?",
      [dayStart]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 全局今日待复习数（due < dayEnd 且已学过） */
  async getGlobalDueCount(before: string): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM card_states WHERE reps > 0 AND due < ?",
      [before]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 全局新卡片数（state = 0） */
  async getGlobalNewCount(): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM card_states WHERE state = 0"
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 各词库今日待复习数 */
  async getDeckDueCounts(before: string): Promise<Record<number, number>> {
    const rows = await this.requireDb().select<{ deck_id: number; cnt: number }[]>(
      `SELECT c.deck_id, COUNT(*) AS cnt FROM cards c
       JOIN card_states cs ON cs.card_id = c.id
       WHERE cs.reps > 0 AND cs.due < ?
       GROUP BY c.deck_id`,
      [before]
    );
    const map: Record<number, number> = {};
    for (const r of rows) map[r.deck_id] = r.cnt;
    return map;
  }

  /** 单个词库今日待复习数 */
  async getDueCountByDeck(deckId: number, before?: string): Promise<number> {
    const b = before ?? new Date().toISOString();
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM cards c
       JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.reps > 0 AND cs.due < ?`,
      [deckId, b]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 区间内到期卡片（用于未来复习量预测） */
  async getDueDatesBetween(from: string, to: string): Promise<string[]> {
    const rows = await this.requireDb().select<{ due: string }[]>(
      "SELECT due FROM card_states WHERE due >= ? AND due < ? AND reps > 0",
      [from, to]
    );
    return rows.map((r) => r.due);
  }


  // ==================== 备份 / 恢复（Phase 5） ====================

  /** 导出：全部卡片（含 FSRS 状态） */
  async getAllCardsWithState(): Promise<(Card & CardState)[]> {
    return this.requireDb().select(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.source_type, c.tags, c.is_key,
              c.created_at, c.updated_at,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       ORDER BY c.id ASC`
    );
  }

  async getAllSettings(): Promise<{ key: string; value: string }[]> {
    return this.requireDb().select("SELECT key, value FROM settings ORDER BY key");
  }

  async getAllDailyStats(): Promise<DailyStats[]> {
    return this.requireDb().select("SELECT * FROM daily_stats ORDER BY date");
  }

  /** 清空全部业务数据（恢复前调用，注意外键顺序） */
  async clearAllData(): Promise<void> {
    const db = this.requireDb();
    await db.execute("DELETE FROM review_logs");
    await db.execute("DELETE FROM card_states");
    await db.execute("DELETE FROM cards");
    await db.execute("DELETE FROM decks");
    await db.execute("DELETE FROM daily_stats");
    await db.execute("DELETE FROM settings");
  }

  /** 危险区：重置学习进度（保留词库与卡片，清空 FSRS 状态 / 复习记录 / 日报） */
  async resetLearningProgress(): Promise<void> {
    const db = this.requireDb();
    await db.execute(
      `UPDATE card_states SET
         state = 0, stability = 0, difficulty = 0, due = ?,
         last_review = NULL, elapsed_days = 0, scheduled_days = 0,
         learning_steps = 0, reps = 0, lapses = 0`,
      [nowIso()]
    );
    await db.execute("DELETE FROM review_logs");
    await db.execute("DELETE FROM daily_stats");
  }

  /** 危险区：仅重置统计数据（清空复习记录与日报，保留 FSRS 记忆进度） */
  async resetStatistics(): Promise<void> {
    const db = this.requireDb();
    await db.execute("DELETE FROM review_logs");
    await db.execute("DELETE FROM daily_stats");
  }

  async restoreDeck(d: Deck): Promise<void> {
    await this.requireDb().execute(
      "INSERT INTO decks (id, name, description, new_cards_per_day, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [d.id, d.name, d.description ?? "", d.new_cards_per_day, d.created_at, d.updated_at]
    );
  }

  /**
   * 恢复卡片（含 FSRS 状态）。
   * 注意：导出行主键字段为 card_id（SELECT c.id AS card_id），读取时须用 card_id。
   */
  async restoreCard(c: Card & CardState): Promise<void> {
    const cardId = (c as { card_id?: number }).card_id ?? (c as { id: number }).id;
    if (cardId === undefined) throw new Error("备份卡片缺少 card_id 字段");
    await this.requireDb().execute(
      `INSERT INTO cards (id, deck_id, front, back, markdown_content, source_type, tags, is_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cardId, c.deck_id, c.front, c.back, c.markdown_content ?? "", c.source_type, c.tags, c.is_key ?? 0, c.created_at, c.updated_at]
    );
    await this.requireDb().execute(
      `INSERT INTO card_states (card_id, state, stability, difficulty, due, last_review, elapsed_days,
              scheduled_days, learning_steps, reps, lapses, desired_retention, algorithm_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cardId, c.state, c.stability, c.difficulty, c.due, c.last_review, c.elapsed_days,
        c.scheduled_days, c.learning_steps, c.reps, c.lapses, c.desired_retention, c.algorithm_version,
      ]
    );
  }

  async restoreReviewLog(l: ReviewLog): Promise<void> {
    await this.requireDb().execute(
      `INSERT INTO review_logs (id, card_id, grade, reviewed_at, response_time_ms, source, ai_question, ai_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [l.id, l.card_id, l.grade, l.reviewed_at, l.response_time_ms, l.source, l.ai_question, l.ai_answer]
    );
  }

  async restoreSetting(key: string, value: string): Promise<void> {
    await this.requireDb().execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }

  async restoreDailyStat(s: DailyStats): Promise<void> {
    await this.requireDb().execute(
      `INSERT OR IGNORE INTO daily_stats (date, new_count, review_count, again_count, total_time_ms, retention_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.date, s.new_count, s.review_count, s.again_count, s.total_time_ms, s.retention_rate]
    );
  }

  // ==================== DailyStats ====================

  /** 累加式更新日报（date: 'YYYY-MM-DD'）；新行直接写入增量，已有行累加（excluded 模式） */
  async updateDailyStats(
    date: string,
    delta: Partial<Pick<DailyStats, "new_count" | "review_count" | "again_count" | "total_time_ms">>
  ): Promise<void> {
    const v = {
      new_count: delta.new_count ?? 0,
      review_count: delta.review_count ?? 0,
      again_count: delta.again_count ?? 0,
      total_time_ms: delta.total_time_ms ?? 0,
    };
    await this.requireDb().execute(
      `INSERT INTO daily_stats (date, new_count, review_count, again_count, total_time_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         new_count = daily_stats.new_count + excluded.new_count,
         review_count = daily_stats.review_count + excluded.review_count,
         again_count = daily_stats.again_count + excluded.again_count,
         total_time_ms = daily_stats.total_time_ms + excluded.total_time_ms`,
      [date, v.new_count, v.review_count, v.again_count, v.total_time_ms]
    );
  }

  async getDailyStatsRange(from: string, to: string): Promise<DailyStats[]> {
    return this.requireDb().select<DailyStats[]>(
      "SELECT * FROM daily_stats WHERE date BETWEEN ? AND ? ORDER BY date ASC",
      [from, to]
    );
  }
}

/** 全局单例 */
export const db = new ReciterDB();
