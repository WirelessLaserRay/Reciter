import { describe, it, expect } from "vitest";
import {
  parseDayStartHour,
  getDayStartDate,
  getDayEndDate,
  toDateKey,
  todayKey,
  formatInterval,
} from "@/lib/day";

describe("day.ts - 日界与时间换算", () => {
  it("parseDayStartHour - 解析日界小时设置", () => {
    expect(parseDayStartHour("04:00")).toBe(4);
    expect(parseDayStartHour("05:00")).toBe(5);
    expect(parseDayStartHour(null)).toBe(4);
    expect(parseDayStartHour("")).toBe(4);
  });

  it("getDayStartDate - 日界 04:00 计算起点", () => {
    // 假设当前时间是 2026-09-21 03:30:00 (本地时间，在 04:00 之前)，起点属于前一天
    const early = new Date(2026, 8, 21, 3, 30, 0);
    const startEarly = getDayStartDate(4, early);
    expect(startEarly.getFullYear()).toBe(2026);
    expect(startEarly.getMonth()).toBe(8);
    expect(startEarly.getDate()).toBe(20);
    expect(startEarly.getHours()).toBe(4);

    // 假设当前时间是 2026-09-21 04:30:00 (在 04:00 之后)，起点属于当天
    const after = new Date(2026, 8, 21, 4, 30, 0);
    const startAfter = getDayStartDate(4, after);
    expect(startAfter.getFullYear()).toBe(2026);
    expect(startAfter.getMonth()).toBe(8);
    expect(startAfter.getDate()).toBe(21);
    expect(startAfter.getHours()).toBe(4);
  });

  it("getDayEndDate - 终点为起点后 24 小时", () => {
    const ref = new Date(2026, 8, 21, 10, 0, 0);
    const start = getDayStartDate(4, ref);
    const end = getDayEndDate(4, ref);
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
  });

  it("toDateKey & todayKey - 格式化为 YYYY-MM-DD", () => {
    const d = new Date(2026, 8, 21, 12, 0, 0);
    expect(toDateKey(d)).toBe("2026-09-21");

    // 凌晨 3 点，日界为 4，其学习日属于前一天
    const early = new Date(2026, 8, 21, 3, 0, 0);
    expect(todayKey(4, early)).toBe("2026-09-20");

    // 上午 9 点，日界为 4，其学习日属于当天
    const normal = new Date(2026, 8, 21, 9, 0, 0);
    expect(todayKey(4, normal)).toBe("2026-09-21");
  });

  it("formatInterval - 间隔人性化转换", () => {
    expect(formatInterval(30_000)).toBe("30秒");
    expect(formatInterval(600_000)).toBe("10分钟");
    expect(formatInterval(7_200_000)).toBe("2小时");
    expect(formatInterval(86_400_000 * 3)).toBe("3天");
  });
});
