import { describe, it, expect } from "vitest";
import {
  normalizePosTag,
  extractAndNormalizeMeaning,
  splitMeaningText,
  getCardMeaning,
  isPhrase,
  removePosPrefix,
} from "@/lib/meaning";

describe("meaning.ts - 词性解析与释义规整引擎", () => {
  it("normalizePosTag - 标准化各种词性标识", () => {
    expect(normalizePosTag("n")).toBe("n.");
    expect(normalizePosTag("vt")).toBe("vt.");
    expect(normalizePosTag("adj")).toBe("adj.");
    expect(normalizePosTag("【动】")).toBe("v.");
    expect(normalizePosTag("（名）")).toBe("n.");
    expect(normalizePosTag("noun")).toBe("n.");
    expect(normalizePosTag("verb")).toBe("v.");
    expect(normalizePosTag("adjective")).toBe("adj.");
    expect(normalizePosTag("a.")).toBe("adj.");
    expect(normalizePosTag("ad.")).toBe("adv.");
  });

  it("extractAndNormalizeMeaning - 前缀词性规范化", () => {
    const res = extractAndNormalizeMeaning("abandon", "vt. 放弃，抛弃");
    expect(res.pos).toBe("vt.");
    expect(res.back).toBe("vt. 放弃，抛弃");
    expect(removePosPrefix(res.back)).toBe("放弃，抛弃");
  });

  it("extractAndNormalizeMeaning - 括号与中括号词性规范化", () => {
    const res1 = extractAndNormalizeMeaning("abandon", "放弃，抛弃 (vt.)");
    expect(res1.pos).toBe("vt.");
    expect(res1.back).toBe("vt. 放弃，抛弃");

    const res2 = extractAndNormalizeMeaning("apple", "[n.] 苹果");
    expect(res2.pos).toBe("n.");
    expect(res2.back).toBe("n. 苹果");

    const res3 = extractAndNormalizeMeaning("apple", "苹果 【名】");
    expect(res3.pos).toBe("n.");
    expect(res3.back).toBe("n. 苹果");
  });

  it("extractAndNormalizeMeaning - 短语词条识别与剥离", () => {
    expect(isPhrase("take off")).toBe(true);
    const res = extractAndNormalizeMeaning("take off", "v. 起飞；脱下");
    // 短语自动剥除词性前缀
    expect(res.pos).toBe("");
    expect(res.back).toBe("起飞；脱下");
  });

  it("splitMeaningText - 主次释义拆分", () => {
    const res = splitMeaningText("**放弃**；交出", "abandon");
    expect(res.primary).toBe("放弃");
    expect(res.secondary).toBe("交出");
  });

  it("getCardMeaning - 统一获取卡片学习释义", () => {
    const meaning = getCardMeaning({
      front: "abandon",
      meaning_primary: "放弃，抛弃",
      meaning_secondary: "沉溺于",
      back: "vt. 放弃，抛弃；沉溺于",
    });
    expect(meaning).toBe("放弃，抛弃；沉溺于");
  });
});
