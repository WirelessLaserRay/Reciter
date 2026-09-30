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

  it("generateHeuristicStudyAdvice - Easy Days 减负日与休整日诊断", async () => {
    const { generateHeuristicStudyAdvice } = await import("@/lib/exam-planner");
    const mockSituation = {
      daysActive7: 5,
      totalNew7: 100,
      totalReview7: 200,
      totalAgain7: 20,
      avgNewPerDay: 20,
      retentionRate7: 90,
      weakCount: 2,
    };

    // 0% 负荷专属休整日
    const restPlan = {
      dateKey: "2026-09-28",
      daysUntilExam: 30,
      examDate: "2026-10-28",
      examTitle: "大学英语六级",
      deckIds: [1],
      deckNames: "CET6 核心词汇",
      selectedDeckNames: ["CET6 核心词汇"],
      ignoredTags: [],
      remainingNew: 300,
      dueToday: 40,
      plannedNew: 0,
      learnedNewToday: 0,
      targetNew: 0,
      reviewedToday: 0,
      targetReview: 0,
      totalTarget: 0,
      targetStability: 7,
      avgStability: 8.5,
      masteryRate: 75,
      masteredCount: 400,
      learningCount: 100,
      weakCount: 2,
      totalCards: 800,
      inSprintPhase: false,
      sprintBufferDays: 7,
      isEasyDay: true,
      easyFactor: 0,
    };

    const restAdvice = generateHeuristicStudyAdvice(restPlan, mockSituation);
    expect(restAdvice).toContain("专属休整期");
    expect(restAdvice).toContain("0%");

    // 50% 负荷计划减负日
    const halfPlan = {
      ...restPlan,
      easyFactor: 0.5,
      targetReview: 20,
      totalTarget: 20,
    };

    const halfAdvice = generateHeuristicStudyAdvice(halfPlan, mockSituation);
    expect(halfAdvice).toContain("计划减负期");
    expect(halfAdvice).toContain("50%");
  });

  it("getEasyDaysFactor - 减负日与休整日系数推导", async () => {
    const { getEasyDaysFactor } = await import("@/lib/easy-days");

    // 禁用状态恒为 1
    expect(
      getEasyDaysFactor(new Date("2026-09-27T10:00:00Z"), {
        enabled: false,
        weekdays: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.5 },
        specificDates: [],
      })
    ).toBe(1);

    // 开启状态：周日 (0) 为 0，周六 (6) 为 0.5，周一 (1) 为 1
    const sunday = new Date("2026-09-27T12:00:00"); // 2026-09-27 is Sunday
    const saturday = new Date("2026-09-26T12:00:00"); // 2026-09-26 is Saturday
    const monday = new Date("2026-09-28T12:00:00"); // 2026-09-28 is Monday

    const cfg = {
      enabled: true,
      weekdays: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.5 },
      specificDates: [],
    };

    expect(getEasyDaysFactor(sunday, cfg)).toBe(0);
    expect(getEasyDaysFactor(saturday, cfg)).toBe(0.5);
    expect(getEasyDaysFactor(monday, cfg)).toBe(1);
  });
});

