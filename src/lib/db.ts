import Database from "@tauri-apps/plugin-sql";
import type { Card, CardState, DailyStats, Deck, ReviewLog } from "@/types";

export interface UpsertResult {
  cardId: number;
  created: boolean;
}

export interface ReviewLogInsert {
  card_id: number;
  grade: 1 | 2 | 3 | 4;
  response_time_ms?: number | null;
  source?: "review" | "ai_test";
  ai_question?: string | null;
  ai_answer?: string | null;
}

/**
 * SQLite 数据库封装（tauri-plugin-sql）
 * - 迁移由 Rust 侧插件自动执行（src-tauri/migrations/001_init.sql）
 * - 表结构见 PLAN.md：decks / cards / card_states / review_logs / settings / daily_stats
 */
class ReciterDB {
  private db: Database | null = null;
  private readyPromise: Promise<void> | null = null;

  /** 加载数据库（幂等，可重复调用） */
  init(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        this.db = await Database.load("sqlite:reciter.db");
      })();
    }
    return this.readyPromise;
  }

  private requireDb(): Database {
    if (!this.db) throw new Error("数据库未初始化，请先调用 db.init()");
    return this.db;
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

  /** 创建词库；已存在同名则直接返回其 id */
  async createDeck(name: string, description = ""): Promise<number> {
    const db = this.requireDb();
    await db.execute(
      "INSERT OR IGNORE INTO decks (name, description, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
      [name, description]
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
    sets.push("updated_at = datetime('now')");
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
      sourceType?: "markdown" | "csv" | "manual";
      tags?: string[];
    },
    knownExisting?: Set<string>
  ): Promise<UpsertResult> {
    const db = this.requireDb();
    const wasKnown = knownExisting ? knownExisting.has(opts.front) : false;
    const tags = JSON.stringify(opts.tags ?? []);
    const rows = await db.select<{ id: number }[]>(
      `INSERT INTO cards (deck_id, front, back, markdown_content, source_type, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(deck_id, front) DO UPDATE SET
         back = excluded.back,
         markdown_content = excluded.markdown_content,
         source_type = excluded.source_type,
         tags = excluded.tags,
         updated_at = datetime('now')
       RETURNING id`,
      [opts.deckId, opts.front, opts.back, opts.markdown ?? "", opts.sourceType ?? "manual", tags]
    );
    const cardId = rows[0].id;
    if (knownExisting && !wasKnown) knownExisting.add(opts.front);
    // 新卡片初始化 FSRS 记忆状态（保留进度关键）
    if (!wasKnown) {
      await db.execute("INSERT OR IGNORE INTO card_states (card_id) VALUES (?)", [cardId]);
    }
    return { cardId, created: !wasKnown };
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
       VALUES (?, ?, datetime('now'), ?, ?, ?, ?)`,
      [
        log.card_id,
        log.grade,
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

  // ==================== DailyStats ====================

  /** 累加式更新日报（date: 'YYYY-MM-DD'） */
  async updateDailyStats(
    date: string,
    delta: Partial<Pick<DailyStats, "new_count" | "review_count" | "again_count" | "total_time_ms">>
  ): Promise<void> {
    const cols: string[] = [];
    const params: (string | number)[] = [];
    (["new_count", "review_count", "again_count", "total_time_ms"] as const).forEach((col) => {
      const v = delta[col];
      if (v !== undefined && v !== 0) {
        cols.push(`${col} = ${col} + ?`);
        params.push(v);
      }
    });
    if (cols.length === 0) return;
    params.push(date);
    await this.requireDb().execute(
      `INSERT INTO daily_stats (date) VALUES (?)
       ON CONFLICT(date) DO UPDATE SET ${cols.join(", ")}`,
      params
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
