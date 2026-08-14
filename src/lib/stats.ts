import { db } from "@/lib/db";
import { getDayStartDate, parseDayStartHour, toDateKey } from "@/lib/day";
import { buildDailyPoints, fillDateKeys, type DailyPoint } from "@/lib/stats-utils";
export type { DailyPoint };

/** 最近 N 天复习数据点 */
export async function getLastNDays(days: number): Promise<DailyPoint[]> {
  const hour = parseDayStartHour(await db.getSetting("day_start"));
  const to = getDayStartDate(hour);
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);
  const rows = await db.getDailyStatsRange(fromKey, toKey);
  return buildDailyPoints(rows, from, to);
}

/** 未来 N 天预期复习量（按本地日分组） */
export async function getFutureDue(days: number): Promise<{ date: string; count: number }[]> {
  const hour = parseDayStartHour(await db.getSetting("day_start"));
  const start = getDayStartDate(hour);
  const end = new Date(start.getTime() + days * 86_400_000);
  const dues = await db.getDueDatesBetween(start.toISOString(), end.toISOString());
  const map = new Map<string, number>();
  for (const due of dues) {
    const key = toDateKey(new Date(due));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return fillDateKeys(start, new Date(end.getTime() - 1)).map((date) => ({
    date: date.slice(5), // 'MM-DD'
    count: map.get(date) ?? 0,
  }));
}

/** 热力图数据：近 N 天每日复习量 { 'YYYY-MM-DD': count } */
export async function getHeatmapData(days = 365): Promise<Record<string, number>> {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  const rows = await db.getDailyStatsRange(toDateKey(from), toDateKey(to));
  const map: Record<string, number> = {};
  for (const r of rows) map[r.date] = (map[r.date] ?? 0) + r.review_count;
  return map;
}
