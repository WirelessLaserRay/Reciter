import { db } from "@/lib/db";
import { fsrsCardToDBState, reviewCard, Rating, State, type FSRSCard, type Grade } from "@/lib/fsrs";
import { getEffectiveRetention } from "@/lib/settings";
import { getLearningSteps } from "@/lib/study-prefs";
import { parseDayStartHour, todayKey } from "@/lib/day";

export type ReviewSource = "review" | "quiz" | "ai_test";

/** Leech（顽固词）阈值：达到该遗忘次数时自动标记为重点词（P1-⑤） */
export const LEECH_THRESHOLD = 4;

export interface ApplyReviewOptions {
  source?: ReviewSource;
  responseTimeMs?: number;
  /** AI 测试：题目内容与用户回答（写入 review_logs） */
  aiQuestion?: string | null;
  aiAnswer?: string | null;
}

/**
 * 评分一张卡片（学习 / 测试 / AI 测试共用）：
 * FSRS 调度 → 持久化 card_states → 写 review_logs → 累加 daily_stats → Leech 自动标记。
 * 返回新 FSRS 状态（调用方据其判断 Learning/Again 重插队列等）。
 */
export async function applyReview(
  cardId: number,
  grade: Grade,
  opts: ApplyReviewOptions = {}
): Promise<FSRSCard> {
  const state = await db.getCardState(cardId);
  if (!state) throw new Error("卡片状态不存在: " + cardId);

  const wasNew = state.state === State.New;
  const now = new Date();
  const [retention, learningSteps] = await Promise.all([
    getEffectiveRetention(),
    getLearningSteps(),
  ]);
  const { card } = await reviewCard(state, grade, now, retention, learningSteps);

  await db.updateCardState(cardId, fsrsCardToDBState(card));
  await db.addReviewLog({
    card_id: cardId,
    grade: grade as 1 | 2 | 3 | 4,
    response_time_ms: opts.responseTimeMs ?? null,
    source: opts.source ?? "review",
    ai_question: opts.aiQuestion ?? null,
    ai_answer: opts.aiAnswer ?? null,
  });

  const hour = parseDayStartHour(await db.getSetting("day_start"));
  await db.updateDailyStats(todayKey(hour, now), {
    new_count: wasNew ? 1 : 0,
    review_count: 1,
    again_count: grade === Rating.Again ? 1 : 0,
  });

  // Leech 自动干预：遗忘次数达到阈值（及每越过一个阈值）时自动标记为重点词
  if (card.lapses >= LEECH_THRESHOLD && card.lapses % LEECH_THRESHOLD === 0) {
    await db.updateCard(cardId, { is_key: 1 });
  }

  return card;
}

/** 掌握度 → FSRS 评分（测试模式用） */
export type Mastery = "forgot" | "fuzzy" | "mastered";

export function masteryToGrade(m: Mastery): Grade {
  if (m === "forgot") return Rating.Again;
  if (m === "fuzzy") return Rating.Hard;
  return Rating.Good;
}
