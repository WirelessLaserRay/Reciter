import { db } from "@/lib/db";
import { parseDayStartHour } from "@/lib/day";

/** 读取用户设置的目标记忆率（未设置返回 undefined → 用默认值） */
export async function getEffectiveRetention(): Promise<number | undefined> {
  const raw = await db.getSetting("desired_retention");
  const v = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(v) ? v : undefined;
}

/** 读取今日起始小时 */
export async function getDayStartHourSetting(): Promise<number> {
  const raw = await db.getSetting("day_start");
  return parseDayStartHour(raw);
}
