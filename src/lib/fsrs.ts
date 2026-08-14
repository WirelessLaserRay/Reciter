import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FSRSCard,
  type FSRSParameters,
  type Grade,
  type ReviewLog,
} from "ts-fsrs";
import { formatInterval } from "@/lib/day";
import type { CardState } from "@/types";

const DEFAULT_RETENTION = 0.9;

/** 缓存调度器：以 request_retention 为键，设置变更后 invalidate */
let cachedRetention: number | null = null;
let scheduler: ReturnType<typeof fsrs> | null = null;

function clampRetention(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_RETENTION;
  return Math.min(0.95, Math.max(0.8, v));
}

/** 获取（缓存的）FSRS 调度器；retention 缺省用缓存值 */
export async function getScheduler(retention?: number): Promise<ReturnType<typeof fsrs>> {
  const r = clampRetention(retention ?? cachedRetention ?? DEFAULT_RETENTION);
  if (!scheduler || cachedRetention !== r) {
    const params: FSRSParameters = generatorParameters({
      request_retention: r,
      maximum_interval: 36500, // 100 年
      enable_fuzz: true, // 随机微调，避免复习堆积
    });
    scheduler = fsrs(params);
    cachedRetention = r;
  }
  return scheduler;
}

/** 设置变更后调用，使调度器按新参数重建 */
export function invalidateFSRS() {
  cachedRetention = null;
  scheduler = null;
}

/** 数据库行 → ts-fsrs Card */
export function dbStateToFSRSCard(s: CardState): FSRSCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps ?? 0,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

/** ts-fsrs Card → 数据库写入格式 */
export function fsrsCardToDBState(c: FSRSCard): Partial<CardState> {
  return {
    state: c.state as number,
    stability: c.stability,
    difficulty: c.difficulty,
    due: c.due.toISOString(),
    last_review: c.last_review ? c.last_review.toISOString() : null,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
  };
}

/** 评分一卡片，返回新状态与记录 */
export async function reviewCard(
  s: CardState,
  grade: Grade,
  now: Date = new Date(),
  retention?: number
): Promise<{ card: FSRSCard; log: ReviewLog }> {
  const scheduler = await getScheduler(retention);
  const result = scheduler.next(dbStateToFSRSCard(s), now, grade);
  return { card: result.card, log: result.log };
}

export interface IntervalPreview {
  [rating: number]: { label: string; state: State };
}

/** 预计算四个评分的下一间隔（评分按钮下方预览） */
export async function previewIntervals(
  s: CardState,
  now: Date = new Date(),
  retention?: number
): Promise<IntervalPreview> {
  const scheduler = await getScheduler(retention);
  const preview = scheduler.repeat(dbStateToFSRSCard(s), now);
  const out: IntervalPreview = {};
  for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const item = preview[grade as Grade];
    const ms = item.card.due.getTime() - now.getTime();
    out[grade] = { label: formatInterval(ms), state: item.card.state };
  }
  return out;
}

/** 当前记忆可检索度 (0~1) */
export async function getRetrievability(
  s: CardState,
  now: Date = new Date(),
  retention?: number
): Promise<number> {
  const scheduler = await getScheduler(retention);
  return scheduler.get_retrievability(dbStateToFSRSCard(s), now, false) as number;
}

export { createEmptyCard, Rating, State };
export type { FSRSCard, Grade, ReviewLog };
