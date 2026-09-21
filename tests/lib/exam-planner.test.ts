import { describe, it, expect } from "vitest";
import { formatCompactList, getDaysUntilExam } from "@/lib/exam-planner";

describe("exam-planner.ts - 备考日程与配额规划", () => {
  it("formatCompactList - 列表精简展示与折叠", () => {
    expect(formatCompactList([])).toEqual({
      displayed: [],
      remainingCount: 0,
      totalCount: 0,
      compactText: "",
      fullText: "",
    });

    const single = formatCompactList(["CET4"]);
    expect(single.displayed).toEqual(["CET4"]);
    expect(single.compactText).toBe("CET4");

    const two = formatCompactList(["CET4", "CET6"]);
    expect(two.displayed).toEqual(["CET4", "CET6"]);
    expect(two.compactText).toBe("CET4、CET6");

    const four = formatCompactList(["A", "B", "C", "D"], 2);
    expect(four.displayed).toEqual(["A", "B"]);
    expect(four.remainingCount).toBe(2);
    expect(four.compactText).toBe("A、B……等 4 个");
    expect(four.fullText).toBe("A、B、C、D");
  });

  it("getDaysUntilExam - 计算至考试日期的倒计时天数", () => {
    const fixedNow = new Date("2026-09-21T12:00:00.000Z");
    // 5 天后
    expect(getDaysUntilExam("2026-09-26", fixedNow)).toBeGreaterThanOrEqual(4);
    // 已经过去的日期，返回 0
    expect(getDaysUntilExam("2026-09-01", fixedNow)).toBe(0);
  });
});
