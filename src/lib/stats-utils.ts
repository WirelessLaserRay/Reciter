/** 统计纯函数（无 DB 依赖，可单测） */
import type { DailyStats } from "@/types";
import { toDateKey } from "@/lib/day";

export interface DailyPoint {
  date: string; // 'YYYY-MM-DD'
  newCount: number;
  reviewCount: number;
  againCount: number;
  /** 记忆保留率（1 - again/review），无复习时为 null */
  retention: number | null;
}

/** 本地日期键数组（含首尾，按天递增） */
export function fillDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur.getTime() <= end.getTime()) {
    keys.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

/** 将 daily_stats 行填充为连续的每日数据点（缺日补零，计算保留率） */
export function buildDailyPoints(rows: DailyStats[], from: Date, to: Date): DailyPoint[] {
  const map = new Map(rows.map((r) => [r.date, r]));
  return fillDateKeys(from, to).map((date) => {
    const r = map.get(date);
    const reviewCount = r?.review_count ?? 0;
    const againCount = r?.again_count ?? 0;
    return {
      date,
      newCount: r?.new_count ?? 0,
      reviewCount,
      againCount,
      retention: reviewCount > 0 ? Math.max(0, 1 - againCount / reviewCount) : null,
    };
  });
}
