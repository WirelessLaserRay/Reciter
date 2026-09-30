import { describe, it, expect } from "vitest";
import { resolveStudyMode } from "@/lib/study-mode";
import { stemOf, findRelatedWords } from "@/lib/word-family";
import { pickSimilarWords } from "@/lib/similar-words";
import { matchWordSpelling, getWordMaskHint } from "@/lib/recall-match";
import type { CardState } from "@/types";

describe("weak-words-drill - 弱词学习模式与加深记忆逻辑", () => {
  const weakState: CardState = {
    card_id: 101,
    state: 2,
    stability: 2.5,
    difficulty: 6.0,
    due: "2026-09-28T00:00:00.000Z",
    last_review: "2026-09-27T00:00:00.000Z",
    elapsed_days: 1,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 5,
    lapses: 3, // >= leechThreshold (3)
    desired_retention: 0.9,
    algorithm_version: "FSRS-5",
  };

  it("resolveStudyMode - 弱词在无论 AI 是否开启时均进入 ai_drill 靶向攻克模式", () => {
    // AI 开启时
    const modeWithAI = resolveStudyMode(weakState, true, true, 3);
    expect(modeWithAI.mode).toBe("ai_drill");
    expect(modeWithAI.aiStrategy).toBe("deep_drill");

    // AI 未开启时，依然进入弱词靶向攻克模式（本地离线四维拆解）
    const modeWithoutAI = resolveStudyMode(weakState, false, true, 3);
    expect(modeWithoutAI.mode).toBe("ai_drill");
    expect(modeWithoutAI.aiStrategy).toBeNull();
  });

  it("pickSimilarWords - 精准提取形近易混词干扰项", () => {
    const candidates = [
      "adopt",
      "adept",
      "banana",
      "computer",
      "adaptation",
    ];
    const similar = pickSimilarWords("adapt", candidates, 2);
    expect(similar).toContain("adopt");
    expect(similar).toContain("adept");
    expect(similar).not.toContain("banana");
  });

  it("stemOf & findRelatedWords - 词干提取与同族词发现", () => {
    expect(stemOf("actively")).toBe("act");
    expect(stemOf("action")).toBe("act");

    const allWords = ["action", "actively", "actor", "apple", "banana"];
    const related = findRelatedWords("act", allWords);
    expect(related).toContain("action");
    expect(related).toContain("actively");
    expect(related).toContain("actor");
    expect(related).not.toContain("apple");
  });

  it("matchWordSpelling & getWordMaskHint - 拼写跟打验证与首末字母挖空", () => {
    const mask = getWordMaskHint("adapt", true);
    expect(mask.startsWith("a")).toBe(true);
    expect(mask.endsWith("t")).toBe(true);
    expect(mask).toContain("_");

    expect(matchWordSpelling("adapt", "adapt").match).toBe(true);
    expect(matchWordSpelling("  Adapt  ", "adapt").match).toBe(true);
    expect(matchWordSpelling("adopt", "adapt").match).toBe(false);
  });

  it("fetchConfusableWords - 全英语词典易混词与经典辨析匹配", async () => {
    const { fetchConfusableWords, normalizeTargetWord } = await import("@/lib/confusable-ai");

    expect(normalizeTargetWord("adapt(vt.)")).toBe("adapt");
    expect(normalizeTargetWord("programme/program")).toBe("programme");

    // 经典易混词离线匹配
    const res = await fetchConfusableWords("adapt", "适应；改编");
    expect(res.items.length).toBeGreaterThan(0);
    const words = res.items.map((i) => i.word);
    expect(words).toContain("adopt");
    expect(words).toContain("adept");

    // 确保辨析字段不含 Emoji
    for (const item of res.items) {
      if (item.distinction) {
        expect(item.distinction).not.toMatch(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
      }
    }
  });

  it("isTrueConfusableCandidate - 严禁强行匹配，形近度严格过滤门禁", async () => {
    const { isTrueConfusableCandidate } = await import("@/lib/confusable-ai");

    // 真正高频形近易混词 -> 放行
    expect(isTrueConfusableCandidate("adapt", "adopt")).toBe(true);
    expect(isTrueConfusableCandidate("adapt", "adept")).toBe(true);
    expect(isTrueConfusableCandidate("access", "assess")).toBe(true);
    expect(isTrueConfusableCandidate("stationary", "stationery")).toBe(true);

    // 强行凑数的远距词/无关词 -> 坚决拦截拒绝
    expect(isTrueConfusableCandidate("computer", "competitor")).toBe(false);
    expect(isTrueConfusableCandidate("elephant", "element")).toBe(false);
    expect(isTrueConfusableCandidate("apple", "application")).toBe(false);
    expect(isTrueConfusableCandidate("adapt", "adapt")).toBe(false);
  });
});

