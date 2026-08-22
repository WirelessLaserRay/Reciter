/**
 * 日界工具（ts-fsrs 时区陷阱对策）
 * ts-fsrs 使用原生 Date，不处理"今日截止"概念。
 * 应用层以 getDayStart(hour) 为每天起点（默认 04:00，可配置）。
 */

const DEFAULT_DAY_START_HOUR = 4;

/** 读取今日起始小时（settings KV 'day_start'，格式 'HH:MM'，默认 '04:00'） */
export function parseDayStartHour(value: string | null | undefined): number {
  if (!value) return DEFAULT_DAY_START_HOUR;
  const m = /^(\d{1,2}):/.exec(value.trim());
  if (!m) return DEFAULT_DAY_START_HOUR;
  const h = parseInt(m[1], 10);
  return Number.isFinite(h) ? h : DEFAULT_DAY_START_HOUR;
}

/** 某参考时刻所在学习日的起点（本地时间），若起点在未来则取前一天 */
export function getDayStartDate(hour: number, ref: Date = new Date()): Date {
  const d = new Date(ref);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() > ref.getTime()) d.setTime(d.getTime() - 86400000);
  return d;
}

/** 学习日终点（起点 + 24h） */
export function getDayEndDate(hour: number, ref: Date = new Date()): Date {
  const start = getDayStartDate(hour, ref);
  return new Date(start.getTime() + 24 * 3600 * 1000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地日期键 'YYYY-MM-DD'（daily_stats.date） */
export function toDateKey(d: Date): string {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** 今日学习日键（按日界 hour） */
export function todayKey(hour: number, ref: Date = new Date()): string {
  return toDateKey(getDayStartDate(hour, ref));
}

/** 人类可读间隔（用于评分按钮预览）：<1min → X秒；<60min → X分钟；<24h → X小时；否则 X天 */
export function formatInterval(ms: number): string {
  if (ms < 60_000) return Math.max(1, Math.round(ms / 1000)) + "秒";
  if (ms < 3_600_000) return Math.round(ms / 60_000) + "分钟";
  if (ms < 86_400_000) return Math.round(ms / 3_600_000) + "小时";
  return Math.round(ms / 86_400_000) + "天";
}
