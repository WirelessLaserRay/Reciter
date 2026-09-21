import type { Card, CardState } from "@/types";
import { DeckRepository } from "./deck-repo";
import { nowIso, ignoredTagsWhere, ignoredTagsParams } from "./helpers";
import { extractPhoneticFromText } from "@/lib/phonetic";
import type {
  UpsertResult,
  MasteryDistribution,
  MultiDeckMasteryStats,
  DeckWeakWord,
  GlobalSearchResult,
  SearchCardsOptions,
} from "./types";

export class CardRepository extends DeckRepository {
  async getCardsByDeck(deckId: number): Promise<Card[]> {
    return this.requireDb().select<Card[]>(
      "SELECT * FROM cards WHERE deck_id = ? ORDER BY id ASC",
      [deckId]
    );
  }

  /** 随机取样干扰项（避免全量词库载入内存，不足或跨词库时从全局取样） */
  async getRandomDistractors(
    deckId: number,
    excludeCardId: number,
    limit = 50
  ): Promise<{ front: string; back: string; meaning_primary?: string; meaning_secondary?: string }[]> {
    const db = this.requireDb();
    if (deckId > 0) {
      const rows = await db.select<{ front: string; back: string; meaning_primary?: string; meaning_secondary?: string }[]>(
        "SELECT front, back, meaning_primary, meaning_secondary FROM cards WHERE deck_id = ? AND id != ? ORDER BY RANDOM() LIMIT ?",
        [deckId, excludeCardId, limit]
      );
      if (rows.length >= 10) return rows;
    }
    return db.select(
      "SELECT front, back, meaning_primary, meaning_secondary FROM cards WHERE id != ? ORDER BY RANDOM() LIMIT ?",
      [excludeCardId, limit]
    );
  }

  async getCard(id: number): Promise<Card | null> {
    const rows = await this.requireDb().select<Card[]>("SELECT * FROM cards WHERE id = ?", [id]);
    return rows[0] ?? null;
  }

  /** 词库内全部标签（去重，用于按标签筛选学习；使用 json_each 精确解析，自动排除例句标签） */
  async getDeckTags(deckId: number): Promise<string[]> {
    const rows = await this.requireDb().select<{ tag: string }[]>(
      `SELECT DISTINCT j.value AS tag FROM cards c, json_each(c.tags) j
       WHERE c.deck_id = ? AND j.value NOT LIKE 'ex:%' AND j.value NOT LIKE '例句:%' ORDER BY tag`,
      [deckId]
    );
    return rows.map((r) => r.tag).filter(Boolean);
  }

  /** 词库内各标签卡片数（按标签学习入口用；使用 json_each 精确解析，自动排除例句标签） */
  async getDeckTagsWithCount(deckId: number): Promise<{ tag: string; count: number }[]> {
    const rows = await this.requireDb().select<{ tag: string; count: number }[]>(
      `SELECT j.value AS tag, COUNT(*) AS count FROM cards c, json_each(c.tags) j
       WHERE c.deck_id = ? AND j.value NOT LIKE 'ex:%' AND j.value NOT LIKE '例句:%' GROUP BY j.value ORDER BY tag`,
      [deckId]
    );
    return rows.filter((r) => Boolean(r.tag));
  }

  /** 词库内重点词数量 */
  async getDeckKeyCount(deckId: number): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM cards WHERE deck_id = ? AND is_key = 1",
      [deckId]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 词库掌握度分布（Phase 6C）：四类互斥，合计 = total；threshold 为弱词阈值（默认 3） */
  async getDeckMasteryDistribution(deckId: number, threshold = 3): Promise<MasteryDistribution> {
    const rows = await this.requireDb().select<MasteryDistribution[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN cs.lapses >= ? THEN 1 ELSE 0 END), 0) AS weak,
         COALESCE(SUM(CASE WHEN cs.lapses < ? AND cs.state = 0 THEN 1 ELSE 0 END), 0) AS unlearned,
         COALESCE(SUM(CASE WHEN cs.lapses < ? AND cs.state != 0 AND cs.stability >= 7 THEN 1 ELSE 0 END), 0) AS mastered,
         COALESCE(SUM(CASE WHEN cs.lapses < ? AND cs.state != 0 AND cs.stability < 7 THEN 1 ELSE 0 END), 0) AS learning,
         COUNT(*) AS total
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ?`,
      [threshold, threshold, threshold, threshold, deckId]
    );
    const r = rows[0];
    return r ?? { mastered: 0, learning: 0, weak: 0, unlearned: 0, total: 0 };
  }

  /**
   * 多词库或全词库掌握度与熟练度统计（Phase 6C 扩展）：
   * 支持指定词库范围、忽略标签、目标稳定性阈值（targetStability，默认 7 天）与弱词阈值（默认 3 次）。
   */
  async getMultiDeckMasteryStats(
    deckIds: number[] = [],
    ignoreTags: string[] = [],
    targetStability = 7,
    threshold = 3
  ): Promise<MultiDeckMasteryStats> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, deckIds);
    const hasDecks = deckIds.length > 0;
    const placeholders = hasDecks ? deckIds.map(() => "?").join(",") : "";
    const deckWhere = hasDecks ? ` AND c.deck_id IN (${placeholders})` : "";
    const minTarget = targetStability > 0 ? targetStability : 7;
    const params: (string | number)[] = [
      threshold,
      threshold,
      threshold,
      minTarget,
      threshold,
      minTarget,
      ...(hasDecks ? deckIds : []),
      ...ignoredTagsParams(resolvedTags),
    ];
    const rows = await this.requireDb().select<{
      weak: number;
      unlearned: number;
      mastered: number;
      learning: number;
      total: number;
      learned_total: number;
      avg_stability: number | null;
    }[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN cs.lapses >= ? THEN 1 ELSE 0 END), 0) AS weak,
         COALESCE(SUM(CASE WHEN cs.lapses < ? AND cs.state = 0 THEN 1 ELSE 0 END), 0) AS unlearned,
         COALESCE(SUM(CASE WHEN cs.lapses < ? AND cs.state != 0 AND cs.stability >= ? THEN 1 ELSE 0 END), 0) AS mastered,
         COALESCE(SUM(CASE WHEN cs.lapses < ? AND cs.state != 0 AND cs.stability < ? THEN 1 ELSE 0 END), 0) AS learning,
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN cs.state != 0 THEN 1 ELSE 0 END), 0) AS learned_total,
         AVG(CASE WHEN cs.state != 0 THEN cs.stability ELSE NULL END) AS avg_stability
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.ignored = 0${deckWhere}${ignoredTagsWhere(resolvedTags)}`,
      params
    );
    const r = rows[0] ?? {
      weak: 0,
      unlearned: 0,
      mastered: 0,
      learning: 0,
      total: 0,
      learned_total: 0,
      avg_stability: 0,
    };
    const total = r.total;
    const mastered = r.mastered;
    const masteryRate = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const rawAvg = r.avg_stability ?? 0;
    return {
      weak: r.weak,
      unlearned: r.unlearned,
      mastered,
      learning: r.learning,
      total,
      learnedTotal: r.learned_total,
      avgStability: Math.round(rawAvg * 10) / 10,
      masteryRate,
    };
  }

  /** 词库 TOP N 弱词（按遗忘次数降序、稳定性升序；threshold 默认 3） */
  async getDeckTopWeakWords(deckId: number, threshold = 3, limit = 5): Promise<DeckWeakWord[]> {
    return this.requireDb().select<DeckWeakWord[]>(
      `SELECT c.front, c.weak_source, cs.lapses, cs.stability
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.lapses >= ? AND c.weak_dismissed = 0
       ORDER BY cs.lapses DESC, cs.stability ASC
       LIMIT ?`,
      [deckId, threshold, limit]
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
   * 按 front 检索第一张匹配的卡片（不区分大小写），用于生词释义本地快速匹配
   */
  async findCardByFront(front: string): Promise<Card | null> {
    try {
      const rows = await this.requireDb().select<Card[]>(
        "SELECT * FROM cards WHERE LOWER(TRIM(front)) = LOWER(TRIM(?)) ORDER BY updated_at DESC LIMIT 1",
        [front]
      );
      return rows[0] ?? null;
    } catch {
      return null;
    }
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
      phonetic?: string;
      sourceType?: "markdown" | "csv" | "json" | "manual";
      tags?: string[];
      isKey?: number;
      weakSource?: string;
      meaningPrimary?: string;
      meaningSecondary?: string;
      ignored?: number;
    },
    knownExisting?: Set<string>
  ): Promise<UpsertResult> {
    const db = this.requireDb();
    const wasKnown = knownExisting ? knownExisting.has(opts.front) : false;
    const tags = JSON.stringify(opts.tags ?? []);
    const rows = await db.select<{ id: number }[]>(
      `INSERT INTO cards (deck_id, front, back, markdown_content, phonetic, source_type, tags, is_key, weak_source, meaning_primary, meaning_secondary, ignored, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(deck_id, front) DO UPDATE SET
         back = excluded.back,
         markdown_content = excluded.markdown_content,
         phonetic = excluded.phonetic,
         source_type = excluded.source_type,
         tags = excluded.tags,
         is_key = excluded.is_key,
         weak_source = excluded.weak_source,
         meaning_primary = excluded.meaning_primary,
         meaning_secondary = excluded.meaning_secondary,
         ignored = excluded.ignored,
         updated_at = excluded.updated_at
       RETURNING id`,
      [opts.deckId, opts.front, opts.back, opts.markdown ?? "", opts.phonetic ?? "", opts.sourceType ?? "manual", tags, opts.isKey ?? 0, opts.weakSource ?? "", opts.meaningPrimary ?? "", opts.meaningSecondary ?? "", opts.ignored ?? 0, nowIso(), nowIso()]
    );
    const cardId = rows[0].id;
    if (knownExisting && !wasKnown) knownExisting.add(opts.front);
    // 新卡片初始化 FSRS 记忆状态（保留进度关键）
    if (!wasKnown) {
      await db.execute("INSERT OR IGNORE INTO card_states (card_id) VALUES (?)", [cardId]);
    }
    this.invalidateTagsCache();
    return { cardId, created: !wasKnown };
  }

  /** 编辑卡片（front/back/tags/weak_source/phonetic） */
  async updateCard(
    id: number,
    data: Partial<Pick<Card, "front" | "back" | "tags" | "markdown_content" | "phonetic" | "is_key" | "weak_source" | "weak_dismissed" | "meaning_primary" | "meaning_secondary" | "ignored">>
  ): Promise<void> {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (data.front !== undefined) { sets.push("front = ?"); params.push(data.front); }
    if (data.back !== undefined) { sets.push("back = ?"); params.push(data.back); }
    if (data.tags !== undefined) { sets.push("tags = ?"); params.push(data.tags); this.invalidateTagsCache(); }
    if (data.markdown_content !== undefined) { sets.push("markdown_content = ?"); params.push(data.markdown_content); }
    if (data.phonetic !== undefined) { sets.push("phonetic = ?"); params.push(data.phonetic); }
    if (data.is_key !== undefined) { sets.push("is_key = ?"); params.push(data.is_key); }
    if (data.weak_source !== undefined) { sets.push("weak_source = ?"); params.push(data.weak_source); }
    if (data.weak_dismissed !== undefined) { sets.push("weak_dismissed = ?"); params.push(data.weak_dismissed); }
    if (data.meaning_primary !== undefined) { sets.push("meaning_primary = ?"); params.push(data.meaning_primary); }
    if (data.meaning_secondary !== undefined) { sets.push("meaning_secondary = ?"); params.push(data.meaning_secondary); }
    if (data.ignored !== undefined) { sets.push("ignored = ?"); params.push(data.ignored); }
    if (sets.length === 0) return;
    params.push(nowIso());
    sets.push("updated_at = ?");
    params.push(id);
    await this.requireDb().execute(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  /** 回填历史卡片音标：从 front / markdown_content 解析，仅补 phonetic 为空的行 */
  async backfillCardPhonetics(): Promise<void> {
    try {
      const rows = await this.requireDb().select<{ id: number; front: string; markdown_content: string }[]>(
        "SELECT id, front, markdown_content FROM cards WHERE phonetic = ''"
      );
      for (const r of rows) {
        const phonetic = extractPhoneticFromText(r.front) || extractPhoneticFromText(r.markdown_content);
        if (phonetic) await this.updateCard(r.id, { phonetic });
      }
    } catch {
      // 回填失败不阻塞初始化
    }
  }

  async deleteCard(id: number): Promise<void> {
    this.invalidateTagsCache();
    await this.requireDb().execute("DELETE FROM cards WHERE id = ?", [id]);
  }

  /**
   * 全词库卡片全局综合检索
   * 支持跨词库搜索单词、释义、标签，支持词库过滤、重点词过滤与弱词过滤
   */
  async searchCardsGlobal(opts: SearchCardsOptions): Promise<{ items: GlobalSearchResult[]; total: number }> {
    const rawQ = opts.query.trim();
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const scope = opts.scope ?? "all";

    const wheres: string[] = [];
    const params: (string | number)[] = [];

    // 默认不展示已忽略卡片，除非显式指定
    if (!opts.showIgnored) {
      wheres.push("c.ignored = 0");
    }

    // 指定词库过滤
    if (opts.deckId && opts.deckId > 0) {
      wheres.push("c.deck_id = ?");
      params.push(opts.deckId);
    }

    // 重点词过滤
    if (opts.isKeyOnly) {
      wheres.push("c.is_key = 1");
    }

    // 弱词过滤（lapses >= 3 且未解除）
    if (opts.isWeakOnly) {
      wheres.push("(cs.lapses >= 3 AND c.weak_dismissed = 0)");
    }

    // 关键词过滤
    if (rawQ) {
      const escaped = rawQ.replace(/([%_\\])/g, "\\$1");
      const likePattern = `%${escaped}%`;

      if (scope === "front") {
        wheres.push("c.front LIKE ? ESCAPE '\\'");
        params.push(likePattern);
      } else if (scope === "back") {
        wheres.push("(c.back LIKE ? ESCAPE '\\' OR c.meaning_primary LIKE ? ESCAPE '\\' OR c.meaning_secondary LIKE ? ESCAPE '\\')");
        params.push(likePattern, likePattern, likePattern);
      } else if (scope === "tag") {
        wheres.push("c.tags LIKE ? ESCAPE '\\'");
        params.push(likePattern);
      } else {
        // all
        wheres.push("(c.front LIKE ? ESCAPE '\\' OR c.back LIKE ? ESCAPE '\\' OR c.meaning_primary LIKE ? ESCAPE '\\' OR c.meaning_secondary LIKE ? ESCAPE '\\' OR c.tags LIKE ? ESCAPE '\\')");
        params.push(likePattern, likePattern, likePattern, likePattern, likePattern);
      }
    }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

    // 统计符合条件的总记录数
    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      LEFT JOIN card_states cs ON cs.card_id = c.id
      ${whereClause}
    `;
    const countRows = await this.requireDb().select<{ cnt: number }[]>(countSql, params);
    const total = countRows[0]?.cnt ?? 0;

    if (total === 0) {
      return { items: [], total: 0 };
    }

    // 排序逻辑：若有搜索词，优先匹配度（精确匹配 > 前缀匹配 > 包含匹配），其次重点词、遗忘次数优先
    let orderClause = "ORDER BY c.is_key DESC, c.updated_at DESC, c.id DESC";
    const selectParams: (string | number)[] = [...params];

    if (rawQ) {
      orderClause = `
        ORDER BY
          CASE
            WHEN LOWER(c.front) = LOWER(?) THEN 1
            WHEN LOWER(c.front) LIKE LOWER(?) || '%' THEN 2
            WHEN LOWER(c.front) LIKE '%' || LOWER(?) || '%' THEN 3
            ELSE 4
          END ASC,
          c.is_key DESC,
          cs.lapses DESC,
          c.id DESC
      `;
      selectParams.push(rawQ, rawQ, rawQ);
    }

    const itemsSql = `
      SELECT
        c.id, c.deck_id, d.name AS deck_name, c.front, c.back, c.phonetic,
        c.markdown_content, c.tags, c.is_key, c.weak_source, c.weak_dismissed,
        c.meaning_primary, c.meaning_secondary, c.ignored, c.created_at, c.updated_at,
        cs.state, cs.stability, cs.difficulty, cs.due, cs.reps, cs.lapses, cs.last_review
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      LEFT JOIN card_states cs ON cs.card_id = c.id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;
    selectParams.push(limit, offset);

    const items = await this.requireDb().select<GlobalSearchResult[]>(itemsSql, selectParams);
    return { items, total };
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
      "elapsed_days", "scheduled_days", "learning_steps", "reps", "lapses",
      "desired_retention", "algorithm_version",
    ] as const;
    for (const key of allowed) {
      const v = (state as Record<string, unknown>)[key];
      if (v !== undefined) { sets.push(`${key} = ?`); params.push(v as string | number | null); }
    }
    if (sets.length === 0) return;
    params.push(cardId);
    await db.execute(`UPDATE card_states SET ${sets.join(", ")} WHERE card_id = ?`, params);
  }

  // ==================== 弱词追踪（Phase 6B） ====================

  /** 获取弱词列表（lapses >= threshold，按 lapses 降序、stability 升序；默认阈值 3） */
  async getWeakCards(deckId: number, threshold = 3, limit = 50): Promise<(Card & CardState)[]> {
    return this.requireDb().select(
      `SELECT c.id, c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.phonetic, c.source_type, c.tags, c.is_key,
              c.meaning_primary, c.meaning_secondary, c.ignored, c.weak_source, c.weak_dismissed, c.created_at, c.updated_at,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.lapses >= ? AND c.weak_dismissed = 0
       ORDER BY cs.lapses DESC, cs.stability ASC
       LIMIT ?`,
      [deckId, threshold, limit]
    );
  }

  /** 全局弱词计数（默认阈值 3；不含已从弱词本移除的卡片） */
  async getGlobalWeakCount(threshold = 3): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM card_states cs
       JOIN cards c ON c.id = cs.card_id
       WHERE cs.lapses >= ? AND c.weak_dismissed = 0`,
      [threshold]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 弱词本自主导入：把用户提供的词条加入指定词库，并至少达到弱词阈值（默认 3） */
  async importWeakWords(
    deckId: number,
    entries: { front: string; back?: string }[],
    threshold = 3
  ): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      const front = entry.front.trim();
      if (!front) continue;
      const back = (entry.back ?? "").trim() || front;
      const { cardId } = await this.upsertCard({
        deckId,
        front,
        back,
        sourceType: "manual",
        isKey: 1,
        weakSource: "manual",
      });
      const state = await this.getCardState(cardId);
      const lapses = Math.max(state?.lapses ?? 0, threshold);
      await this.updateCardState(cardId, { lapses });
      count++;
    }
    return count;
  }

  /** 把词库中已有卡片直接加入弱词本：标记为重点词，并将 lapses 提升到弱词阈值 */
  async markCardWeak(cardId: number, threshold = 3): Promise<void> {
    const state = await this.getCardState(cardId);
    const lapses = Math.max(state?.lapses ?? 0, threshold);
    await this.updateCardState(cardId, { lapses });
    await this.updateCard(cardId, { is_key: 1, weak_source: "manual", weak_dismissed: 0 });
  }

  /** 从弱词本移除：标记 dismissed，不再出现在弱词列表 */
  async dismissWeakWord(cardId: number): Promise<void> {
    await this.updateCard(cardId, { weak_dismissed: 1, weak_source: "" });
  }

  /** 获取指定卡片最近 N 次评分（按时间倒序） */
  async getRecentGrades(cardId: number, n = 3): Promise<number[]> {
    const rows = await this.requireDb().select<{ grade: number }[]>(
      "SELECT grade FROM review_logs WHERE card_id = ? ORDER BY reviewed_at DESC LIMIT ?",
      [cardId, n]
    );
    return rows.map((r) => r.grade);
  }

  /** 导出：全部卡片（含 FSRS 状态） */
  async getAllCardsWithState(): Promise<(Card & CardState)[]> {
    return this.requireDb().select(
      `SELECT c.id, c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.phonetic, c.source_type, c.tags, c.is_key,
              c.meaning_primary, c.meaning_secondary, c.ignored, c.weak_source, c.weak_dismissed, c.created_at, c.updated_at,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       ORDER BY c.id ASC`
    );
  }

  /**
   * 恢复卡片（含 FSRS 状态）。
   * 注意：导出行主键字段为 card_id（SELECT c.id AS card_id），读取时须用 card_id。
   */
  async restoreCard(c: Card & CardState): Promise<void> {
    const cardId = (c as { card_id?: number }).card_id ?? (c as { id: number }).id;
    if (cardId === undefined) throw new Error("备份卡片缺少 card_id 字段");
    let tagsStr = "[]";
    if (typeof c.tags === "string") {
      tagsStr = c.tags;
    } else if (Array.isArray(c.tags)) {
      tagsStr = JSON.stringify(c.tags);
    }
    await this.requireDb().execute(
      `INSERT INTO cards (id, deck_id, front, back, markdown_content, phonetic, source_type, tags, is_key, weak_source, weak_dismissed, meaning_primary, meaning_secondary, ignored, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cardId,
        c.deck_id,
        c.front ?? "",
        c.back ?? "",
        c.markdown_content ?? "",
        c.phonetic ?? "",
        c.source_type ?? "manual",
        tagsStr,
        c.is_key ?? 0,
        c.weak_source ?? "",
        c.weak_dismissed ?? 0,
        c.meaning_primary ?? "",
        c.meaning_secondary ?? "",
        c.ignored ?? 0,
        c.created_at ?? nowIso(),
        c.updated_at ?? nowIso(),
      ]
    );
    await this.requireDb().execute(
      `INSERT INTO card_states (card_id, state, stability, difficulty, due, last_review, elapsed_days,
              scheduled_days, learning_steps, reps, lapses, desired_retention, algorithm_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cardId,
        c.state ?? 0,
        c.stability ?? 0,
        c.difficulty ?? 0,
        c.due ?? nowIso(),
        c.last_review ?? null,
        c.elapsed_days ?? 0,
        c.scheduled_days ?? 0,
        c.learning_steps ?? 0,
        c.reps ?? 0,
        c.lapses ?? 0,
        c.desired_retention ?? 0.9,
        c.algorithm_version ?? "FSRS-5",
      ]
    );
  }
}
