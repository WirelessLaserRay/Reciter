import { db } from "@/lib/db";

/** 上次学习上下文（用于「继续上次」入口） */
export interface LastStudyContext {
  deckId: number;
  tag?: string;
  keyOnly?: boolean;
}

/** 读取上次学习上下文；没有记录或记录损坏时返回 null */
export async function getLastStudyContext(): Promise<LastStudyContext | null> {
  const deckIdRaw = await db.getSetting("last_study_deck_id");
  if (!deckIdRaw) return null;
  const deckId = parseInt(deckIdRaw, 10);
  if (!Number.isFinite(deckId) || deckId <= 0) return null;

  const [tagRaw, keyOnlyRaw] = await Promise.all([
    db.getSetting("last_study_tag"),
    db.getSetting("last_study_key_only"),
  ]);
  const tag = tagRaw && tagRaw.trim() ? tagRaw : undefined;
  const keyOnly = keyOnlyRaw === "true";

  return { deckId, tag, keyOnly };
}

/** 保存上次学习上下文（每次成功加载学习队列时调用） */
export async function saveLastStudyContext(
  deckId: number,
  tag?: string,
  keyOnly?: boolean
): Promise<void> {
  await Promise.all([
    db.setSetting("last_study_deck_id", String(deckId)),
    db.setSetting("last_study_tag", tag ?? ""),
    db.setSetting("last_study_key_only", keyOnly ? "true" : "false"),
  ]);
}

/** 评分模式：三档（默认）或四档 */
export async function getRatingMode(): Promise<"3" | "4"> {
  const raw = await db.getSetting("rating_mode");
  return raw === "4" ? "4" : "3";
}

export async function saveRatingMode(mode: "3" | "4"): Promise<void> {
  await db.setSetting("rating_mode", mode);
}

/** 主动回忆模式（默认开启） */
export async function getActiveRecallEnabled(): Promise<boolean> {
  const raw = await db.getSetting("active_recall_enabled");
  return raw !== "false";
}

export async function saveActiveRecallEnabled(enabled: boolean): Promise<void> {
  await db.setSetting("active_recall_enabled", enabled ? "true" : "false");
}

/** 迷你小结间隔（每 N 张一次，默认 10） */
export async function getSummaryInterval(): Promise<number> {
  const raw = await db.getSetting("session_summary_interval");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export async function saveSummaryInterval(interval: number): Promise<void> {
  await db.setSetting("session_summary_interval", String(interval));
}

/** 新卡交错比例：每 N 张复习卡插入 1 张新卡（P0-①，默认 5） */
export async function getInterleaveRatio(): Promise<number> {
  const raw = await db.getSetting("interleave_ratio");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 5;
}

export async function saveInterleaveRatio(ratio: number): Promise<void> {
  await db.setSetting("interleave_ratio", String(Math.min(10, Math.max(1, Math.round(ratio)))));
}

/** 熟练卡秒答阈值（毫秒）：阈值内答对自动 Good（P2-⑨，默认 5 秒） */
export async function getQuickTestMs(): Promise<number> {
  const raw = await db.getSetting("quick_test_threshold_ms");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 2000 && n <= 15000 ? n : 5000;
}

export async function saveQuickTestMs(ms: number): Promise<void> {
  await db.setSetting("quick_test_threshold_ms", String(Math.min(15000, Math.max(2000, Math.round(ms)))));
}

/** 学习步骤（P3-⑪）：如 "1m,10m"；默认短且少，第二天起交给 FSRS 动态调度 */
export async function getLearningSteps(): Promise<string> {
  const raw = await db.getSetting("learning_steps");
  return raw && raw.trim() ? raw.trim() : "1m,10m";
}

export async function saveLearningSteps(steps: string): Promise<void> {
  await db.setSetting("learning_steps", steps.trim());
}

/** 词库乱序学习开关（按词库存储） */
export async function getDeckShuffle(deckId: number): Promise<boolean> {
  const raw = await db.getSetting(`deck_shuffle_${deckId}`);
  return raw === "true";
}

export async function saveDeckShuffle(deckId: number, enabled: boolean): Promise<void> {
  await db.setSetting(`deck_shuffle_${deckId}`, enabled ? "true" : "false");
}
