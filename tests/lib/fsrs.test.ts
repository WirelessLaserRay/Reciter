import { describe, it, expect } from "vitest";
import {
  parseLearningSteps,
  dbStateToFSRSCard,
  fsrsCardToDBState,
  reviewCard,
  previewIntervals,
  Rating,
  State,
} from "@/lib/fsrs";
import type { CardState } from "@/types";

describe("fsrs.ts - FSRS-5 核心调度算法与状态转换", () => {
  const mockInitialState: CardState = {
    card_id: 1,
    state: 0, // State.New
    stability: 0,
    difficulty: 0,
    due: "2026-09-21T00:00:00.000Z",
    last_review: null,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    desired_retention: 0.9,
    algorithm_version: "FSRS-5",
  };

  it("parseLearningSteps - 正常与非法输入回退", () => {
    expect(parseLearningSteps("1m,10m")).toEqual(["1m", "10m"]);
    expect(parseLearningSteps("10m 1d")).toEqual(["10m", "1d"]);
    expect(parseLearningSteps("invalid")).toEqual(["1m", "10m"]);
    expect(parseLearningSteps("")).toEqual(["1m", "10m"]);
  });

  it("dbStateToFSRSCard & fsrsCardToDBState - 双向转换一致性", () => {
    const fsrsCard = dbStateToFSRSCard(mockInitialState);
    expect(fsrsCard.state).toBe(State.New);
    expect(fsrsCard.stability).toBe(0);

    const backToDb = fsrsCardToDBState(fsrsCard);
    expect(backToDb.state).toBe(0);
    expect(backToDb.stability).toBe(0);
    expect(backToDb.due).toBe(mockInitialState.due);
  });

  it("reviewCard - 新卡评 Good 进入 Learning 状态并更新稳定性", async () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const { card, log } = await reviewCard(mockInitialState, Rating.Good, now, 0.9, "1m,10m");
    expect(card.stability).toBeGreaterThan(0);
    expect(card.reps).toBe(1);
    expect(log.rating).toBe(Rating.Good);
  });

  it("reviewCard - 评 Again 会增加 lapses", async () => {
    const reviewState: CardState = {
      ...mockInitialState,
      state: 2, // State.Review
      stability: 5.0,
      difficulty: 5.0,
      reps: 3,
      lapses: 0,
    };
    const now = new Date("2026-09-21T12:00:00.000Z");
    const { card } = await reviewCard(reviewState, Rating.Again, now, 0.9, "1m,10m");
    expect(card.lapses).toBe(1);
  });

  it("previewIntervals - 计算四个评级按钮的间隔标签", async () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const preview = await previewIntervals(mockInitialState, now, 0.9, "1m,10m");
    expect(preview[Rating.Again]).toBeDefined();
    expect(preview[Rating.Hard]).toBeDefined();
    expect(preview[Rating.Good]).toBeDefined();
    expect(preview[Rating.Easy]).toBeDefined();
    expect(typeof preview[Rating.Good].label).toBe("string");
  });
});
