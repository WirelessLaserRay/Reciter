import type { ReviewLog } from "@/types";
import { CardRepository } from "./card-repo";
import { nowIso, tagWhere, tagParam, ignoredTagsWhere, ignoredTagsParams } from "./helpers";
import type { ReviewLogInsert, StudyCardRow } from "./types";

export class StudyRepository extends CardRepository {
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

  async restoreReviewLog(l: ReviewLog): Promise<void> {
    await this.requireDb().execute(
      `INSERT INTO review_logs (id, card_id, grade, reviewed_at, response_time_ms, source, ai_question, ai_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        l.id,
        l.card_id,
        l.grade ?? 3,
        l.reviewed_at ?? nowIso(),
        l.response_time_ms ?? null,
        l.source ?? "review",
        l.ai_question ?? null,
        l.ai_answer ?? null,
      ]
    );
  }

  /** 今日到期卡片（state != 0 且 due <= before，含 Learning/Review/Relearning），按 due 升序；可按标签过滤、忽略标签（支持模糊/正则） */
  async getDueCards(
    deckId: number,
    before: string,
    tag?: string,
    keyOnly = false,
    limit?: number,
    ignoreTags: string[] = []
  ): Promise<StudyCardRow[]> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, [deckId]);
    const params: (string | number)[] = [
      deckId,
      before,
      keyOnly ? 1 : 0,
      keyOnly ? 1 : 0,
      ...tagParam(tag),
      ...ignoredTagsParams(resolvedTags),
    ];
    const limitSql = limit !== undefined ? " LIMIT ?" : "";
    if (limit !== undefined) params.push(limit);
    return this.requireDb().select<StudyCardRow[]>(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.phonetic, c.tags, c.is_key,
              c.meaning_primary, c.meaning_secondary, c.ignored,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND c.ignored = 0 AND cs.state != 0 AND cs.due <= ? AND (? = 0 OR c.is_key = ?)${tagWhere(tag)}${ignoredTagsWhere(resolvedTags)}
       ORDER BY
          CASE WHEN cs.state IN (1, 3) THEN 0 ELSE 1 END,
          cs.due ASC, c.id ASC${limitSql}`,
      params
    );
  }

  /** 新卡片（state = 0），按 id 升序取 limit 张；可按标签过滤、忽略标签（支持模糊/正则） */
  async getNewCards(
    deckId: number,
    limit: number,
    tag?: string,
    keyOnly = false,
    ignoreTags: string[] = []
  ): Promise<StudyCardRow[]> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, [deckId]);
    const params: (string | number)[] = [
      deckId,
      keyOnly ? 1 : 0,
      keyOnly ? 1 : 0,
      ...tagParam(tag),
      ...ignoredTagsParams(resolvedTags),
      limit,
    ];
    return this.requireDb().select<StudyCardRow[]>(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.phonetic, c.tags, c.is_key,
              c.meaning_primary, c.meaning_secondary, c.ignored,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND c.ignored = 0 AND cs.state = 0 AND (? = 0 OR c.is_key = ?)${tagWhere(tag)}${ignoredTagsWhere(resolvedTags)}
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

  /** 多词库或全词库今日已学习的新卡数（支持忽略指定标签规则） */
  async countMultiDeckNewLearnedToday(
    deckIds: number[] = [],
    dayStart: string,
    ignoreTags: string[] = []
  ): Promise<number> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, deckIds);
    const hasDecks = deckIds.length > 0;
    const placeholders = hasDecks ? deckIds.map(() => "?").join(",") : "";
    const deckWhere = hasDecks ? ` AND c.deck_id IN (${placeholders})` : "";
    const params: (string | number)[] = [
      dayStart,
      dayStart,
      ...(hasDecks ? deckIds : []),
      ...ignoredTagsParams(resolvedTags),
    ];
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM cards c
       WHERE c.ignored = 0
         AND EXISTS (SELECT 1 FROM review_logs r WHERE r.card_id = c.id AND r.reviewed_at >= ?)
         AND NOT EXISTS (SELECT 1 FROM review_logs r2 WHERE r2.card_id = c.id AND r2.reviewed_at < ?)
         ${deckWhere}${ignoredTagsWhere(resolvedTags)}`,
      params
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 多词库或全词库今日已复习的到期卡片数（独立卡片去重，且排除今日首次学的新卡） */
  async countMultiDeckReviewsToday(
    deckIds: number[] = [],
    dayStart: string,
    ignoreTags: string[] = []
  ): Promise<number> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, deckIds);
    const hasDecks = deckIds.length > 0;
    const placeholders = hasDecks ? deckIds.map(() => "?").join(",") : "";
    const deckWhere = hasDecks ? ` AND c.deck_id IN (${placeholders})` : "";
    const params: (string | number)[] = [
      dayStart,
      dayStart,
      ...(hasDecks ? deckIds : []),
      ...ignoredTagsParams(resolvedTags),
    ];
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(DISTINCT r.card_id) AS cnt FROM review_logs r
       JOIN cards c ON c.id = r.card_id
       WHERE r.reviewed_at >= ?
         AND EXISTS (SELECT 1 FROM review_logs r2 WHERE r2.card_id = c.id AND r2.reviewed_at < ?)
         AND c.ignored = 0${deckWhere}${ignoredTagsWhere(resolvedTags)}`,
      params
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 全局今日已复习数（日报复习预算）：按独立卡片去重，避免同一张卡多次 Again 提前耗尽额度 */
  async countReviewsToday(dayStart: string): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      "SELECT COUNT(DISTINCT card_id) AS cnt FROM review_logs WHERE reviewed_at >= ?",
      [dayStart]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 某张卡片今天是否已有复习记录（daily_stats 去重用） */
  async hasReviewedCardToday(cardId: number, dayStart: string): Promise<boolean> {
    const rows = await this.requireDb().select<{ id: number }[]>(
      "SELECT 1 AS id FROM review_logs WHERE card_id = ? AND reviewed_at >= ? LIMIT 1",
      [cardId, dayStart]
    );
    return rows.length > 0;
  }

  /** 某张卡片今天是否已有「忘记(Again)」记录（daily_stats.again_count 去重用） */
  async hasAgainCardToday(cardId: number, dayStart: string): Promise<boolean> {
    const rows = await this.requireDb().select<{ id: number }[]>(
      "SELECT 1 AS id FROM review_logs WHERE card_id = ? AND reviewed_at >= ? AND grade = 1 LIMIT 1",
      [cardId, dayStart]
    );
    return rows.length > 0;
  }

  /** 全局今日待复习数（due < dayEnd 且已学过；可忽略标签，支持模糊/正则） */
  async getGlobalDueCount(before: string, ignoreTags: string[] = []): Promise<number> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags);
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM card_states cs
       JOIN cards c ON c.id = cs.card_id
       WHERE cs.reps > 0 AND cs.due < ?${ignoredTagsWhere(resolvedTags)}`,
      [before, ...ignoredTagsParams(resolvedTags)]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 全局新卡片数（state = 0；可忽略标签，支持模糊/正则） */
  async getGlobalNewCount(ignoreTags: string[] = []): Promise<number> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags);
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM card_states cs
       JOIN cards c ON c.id = cs.card_id
       WHERE cs.state = 0${ignoredTagsWhere(resolvedTags)}`,
      [...ignoredTagsParams(resolvedTags)]
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 指定词库中的新卡片数（可忽略标签，支持模糊/正则；deckIds 为空时统计全词库） */
  async getNewCountByDecks(deckIds: number[], ignoreTags: string[] = []): Promise<number> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, deckIds);
    const hasDecks = deckIds.length > 0;
    const placeholders = hasDecks ? deckIds.map(() => "?").join(",") : "";
    const deckWhere = hasDecks ? ` AND c.deck_id IN (${placeholders})` : "";
    const params: (string | number)[] = [
      ...(hasDecks ? deckIds : []),
      ...ignoredTagsParams(resolvedTags),
    ];
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM card_states cs
       JOIN cards c ON c.id = cs.card_id
       WHERE cs.state = 0 AND c.ignored = 0${deckWhere}${ignoredTagsWhere(resolvedTags)}`,
      params
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 指定词库中的今日待复习卡片数（可忽略标签，支持模糊/正则；deckIds 为空时统计全词库） */
  async getDueCountByDecks(deckIds: number[], before: string, ignoreTags: string[] = []): Promise<number> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, deckIds);
    const hasDecks = deckIds.length > 0;
    const placeholders = hasDecks ? deckIds.map(() => "?").join(",") : "";
    const deckWhere = hasDecks ? ` AND c.deck_id IN (${placeholders})` : "";
    const params: (string | number)[] = [
      before,
      ...(hasDecks ? deckIds : []),
      ...ignoredTagsParams(resolvedTags),
    ];
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM card_states cs
       JOIN cards c ON c.id = cs.card_id
       WHERE cs.reps > 0 AND cs.due < ? AND c.ignored = 0${deckWhere}${ignoredTagsWhere(resolvedTags)}`,
      params
    );
    return rows[0]?.cnt ?? 0;
  }

  /** 多词库或全词库今日到期卡片（可忽略标签，支持模糊/正则） */
  async getMultiDeckDueCards(
    deckIds: number[],
    before: string,
    limit?: number,
    ignoreTags: string[] = []
  ): Promise<StudyCardRow[]> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, deckIds);
    const hasDecks = deckIds.length > 0;
    const placeholders = hasDecks ? deckIds.map(() => "?").join(",") : "";
    const deckWhere = hasDecks ? ` AND c.deck_id IN (${placeholders})` : "";
    const params: (string | number)[] = [
      before,
      ...(hasDecks ? deckIds : []),
      ...ignoredTagsParams(resolvedTags),
    ];
    const limitSql = limit !== undefined ? " LIMIT ?" : "";
    if (limit !== undefined) params.push(limit);
    return this.requireDb().select<StudyCardRow[]>(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.phonetic, c.tags, c.is_key,
              c.meaning_primary, c.meaning_secondary, c.ignored,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.ignored = 0 AND cs.state != 0 AND cs.due <= ?${deckWhere}${ignoredTagsWhere(resolvedTags)}
       ORDER BY
          CASE WHEN cs.state IN (1, 3) THEN 0 ELSE 1 END,
          cs.due ASC, c.id ASC${limitSql}`,
      params
    );
  }

  /** 多词库或全词库新卡片（可忽略标签，支持模糊/正则） */
  async getMultiDeckNewCards(
    deckIds: number[],
    limit: number,
    ignoreTags: string[] = []
  ): Promise<StudyCardRow[]> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, deckIds);
    const hasDecks = deckIds.length > 0;
    const placeholders = hasDecks ? deckIds.map(() => "?").join(",") : "";
    const deckWhere = hasDecks ? ` AND c.deck_id IN (${placeholders})` : "";
    const params: (string | number)[] = [
      ...(hasDecks ? deckIds : []),
      ...ignoredTagsParams(resolvedTags),
      limit,
    ];
    return this.requireDb().select<StudyCardRow[]>(
      `SELECT c.id AS card_id, c.deck_id, c.front, c.back, c.markdown_content, c.phonetic, c.tags, c.is_key,
              c.meaning_primary, c.meaning_secondary, c.ignored,
              cs.state, cs.stability, cs.difficulty, cs.due, cs.last_review,
              cs.elapsed_days, cs.scheduled_days, cs.learning_steps, cs.reps, cs.lapses,
              cs.desired_retention, cs.algorithm_version
       FROM cards c JOIN card_states cs ON cs.card_id = c.id
       WHERE c.ignored = 0 AND cs.state = 0${deckWhere}${ignoredTagsWhere(resolvedTags)}
       ORDER BY c.id ASC
       LIMIT ?`,
      params
    );
  }

  /** 各词库今日待复习数（可忽略标签，支持模糊/正则） */
  async getDeckDueCounts(before: string, ignoreTags: string[] = []): Promise<Record<number, number>> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags);
    const rows = await this.requireDb().select<{ deck_id: number; cnt: number }[]>(
      `SELECT c.deck_id, COUNT(*) AS cnt FROM cards c
       JOIN card_states cs ON cs.card_id = c.id
       WHERE cs.reps > 0 AND cs.due < ?${ignoredTagsWhere(resolvedTags)}
       GROUP BY c.deck_id`,
      [before, ...ignoredTagsParams(resolvedTags)]
    );
    const map: Record<number, number> = {};
    for (const r of rows) map[r.deck_id] = r.cnt;
    return map;
  }

  /** 各词库可用新卡数（state = 0，可忽略标签，支持模糊/正则） */
  async getDeckNewCounts(ignoreTags: string[] = []): Promise<Record<number, number>> {
    const resolvedTags = await this.resolveMatchingTags(ignoreTags);
    const rows = await this.requireDb().select<{ deck_id: number; cnt: number }[]>(
      `SELECT c.deck_id, COUNT(*) AS cnt FROM cards c
       JOIN card_states cs ON cs.card_id = c.id
       WHERE cs.state = 0 AND c.ignored = 0${ignoredTagsWhere(resolvedTags)}
       GROUP BY c.deck_id`,
      [...ignoredTagsParams(resolvedTags)]
    );
    const map: Record<number, number> = {};
    for (const r of rows) map[r.deck_id] = r.cnt;
    return map;
  }

  /** 单个词库今日待复习数（可忽略标签，支持模糊/正则） */
  async getDueCountByDeck(deckId: number, before?: string, ignoreTags: string[] = []): Promise<number> {
    const b = before ?? new Date().toISOString();
    const resolvedTags = await this.resolveMatchingTags(ignoreTags, [deckId]);
    const rows = await this.requireDb().select<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM cards c
       JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ? AND cs.reps > 0 AND cs.due < ?${ignoredTagsWhere(resolvedTags)}`,
      [deckId, b, ...ignoredTagsParams(resolvedTags)]
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
}
