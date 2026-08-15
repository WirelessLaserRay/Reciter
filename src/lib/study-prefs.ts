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
