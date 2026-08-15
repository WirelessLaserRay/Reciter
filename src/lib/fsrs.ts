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
  type StepUnit,
} from "ts-fsrs";
import { formatInterval } from "@/lib/day";
import { getLearningSteps } from "@/lib/study-prefs";
import type { CardState } from "@/types";

const DEFAULT_RETENTION = 0.9;

/** 缓存调度器：以 request_retention + learning_steps 为键，设置变更后 invalidate */
let cachedRetention: number | null = null;
let cachedStepsKey: string | null = null;
let scheduler: ReturnType<typeof fsrs> | null = null;

function clampRetention(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_RETENTION;
  return Math.min(0.95, Math.max(0.8, v));
}

/** 解析学习步骤字符串（"1m,10m" → StepUnit[]）；非法格式回退默认短步骤 */
export function parseLearningSteps(raw: string | null | undefined): StepUnit[] {
  const parts = (raw ?? "")
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{1,4}[mhd]$/.test(s)) as StepUnit[];
  if (parts.length > 0) return parts;
  return ["1m", "10m"];
}

/** 获取（缓存的）FSRS 调度器；retention / learningSteps 缺省时读取设置并缓存 */
export async function getScheduler(retention?: number, learningSteps?: string): Promise<ReturnType<typeof fsrs>> {
  const r = clampRetention(retention ?? cachedRetention ?? DEFAULT_RETENTION);
  let stepsKey = cachedStepsKey;
  if (learningSteps !== undefined) {
    stepsKey = parseLearningSteps(learningSteps).join(",");
  } else if (stepsKey === null) {
    stepsKey = parseLearningSteps(await getLearningSteps()).join(",");
  }
  if (!scheduler || cachedRetention !== r || cachedStepsKey !== stepsKey) {
    const steps = parseLearningSteps(stepsKey);
    const params: FSRSParameters = generatorParameters({
      request_retention: r,
      maximum_interval: 36500, // 100 年
      enable_fuzz: true, // 随机微调，避免复习堆积
      learning_steps: steps,
      relearning_steps: steps,
    });
    scheduler = fsrs(params);
    cachedRetention = r;
    cachedStepsKey = steps.join(",");
  }
  return scheduler;
}

/** 设置变更后调用，使调度器按新参数重建 */
export function invalidateFSRS() {
  cachedRetention = null;
  cachedStepsKey = null;
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
  retention?: number,
  learningSteps?: string
): Promise<{ card: FSRSCard; log: ReviewLog }> {
  const scheduler = await getScheduler(retention, learningSteps);
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
  retention?: number,
  learningSteps?: string
): Promise<IntervalPreview> {
  const scheduler = await getScheduler(retention, learningSteps);
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
  retention?: number,
  learningSteps?: string
): Promise<number> {
  const scheduler = await getScheduler(retention, learningSteps);
  return scheduler.get_retrievability(dbStateToFSRSCard(s), now, false) as number;
}

export { createEmptyCard, Rating, State };
export type { FSRSCard, Grade, ReviewLog };
