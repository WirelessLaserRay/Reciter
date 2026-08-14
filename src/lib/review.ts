import { db } from "@/lib/db";
import { fsrsCardToDBState, reviewCard, Rating, State, type FSRSCard, type Grade } from "@/lib/fsrs";
import { getEffectiveRetention } from "@/lib/settings";
import { parseDayStartHour, todayKey } from "@/lib/day";

export type ReviewSource = "review" | "quiz" | "ai_test";

export interface ApplyReviewOptions {
  source?: ReviewSource;
  responseTimeMs?: number;
}

/**
 * 评分一张卡片（学习 / 测试 / AI 测试共用）：
 * FSRS 调度 → 持久化 card_states → 写 review_logs → 累加 daily_stats。
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
  const retention = await getEffectiveRetention();
  const { card } = await reviewCard(state, grade, now, retention);

  await db.updateCardState(cardId, fsrsCardToDBState(card));
  await db.addReviewLog({
    card_id: cardId,
    grade: grade as 1 | 2 | 3 | 4,
    response_time_ms: opts.responseTimeMs ?? null,
    source: opts.source ?? "review",
  });

  const hour = parseDayStartHour(await db.getSetting("day_start"));
  await db.updateDailyStats(todayKey(hour, now), {
    new_count: wasNew ? 1 : 0,
    review_count: 1,
    again_count: grade === Rating.Again ? 1 : 0,
  });

  return card;
}

/** 掌握度 → FSRS 评分（测试模式用） */
export type Mastery = "forgot" | "fuzzy" | "mastered";

export function masteryToGrade(m: Mastery): Grade {
  if (m === "forgot") return Rating.Again;
  if (m === "fuzzy") return Rating.Hard;
  return Rating.Good;
}
