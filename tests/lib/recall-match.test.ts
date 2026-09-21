import { describe, it, expect } from "vitest";
import {
  matchWordSpelling,
  extractWordCandidates,
  getCleanWordForDisplay,
} from "@/lib/recall-match";

describe("recall-match.ts - 回想与拼写比对引擎", () => {
  it("基础精确与大小写匹配", () => {
    expect(matchWordSpelling("apple", "apple").match).toBe(true);
    expect(matchWordSpelling("Apple", "apple").match).toBe(true);
    expect(matchWordSpelling("APPLE", "apple").match).toBe(true);
    expect(matchWordSpelling("  apple  ", "apple").match).toBe(true);
  });

  it("剥离词性前缀（如 vt. / n. / adj.）", () => {
    expect(matchWordSpelling("abandon", "vt. abandon").match).toBe(true);
    expect(matchWordSpelling("abandon", "v./n. abandon").match).toBe(true);
    expect(matchWordSpelling("apple", "n. apple").match).toBe(true);
    expect(matchWordSpelling("beautiful", "adj. beautiful").match).toBe(true);
  });

  it("剥离各类括号补充说明", () => {
    expect(matchWordSpelling("take off", "take off (起飞)").match).toBe(true);
    expect(matchWordSpelling("take off", "take off [起飞]").match).toBe(true);
    expect(matchWordSpelling("color", "color (美) / colour (英)").match).toBe(true);
    expect(matchWordSpelling("colour", "color (美) / colour (英)").match).toBe(true);
  });

  it("支持多变体（斜杠 / 逗号 / 分号 / or 分隔）", () => {
    expect(matchWordSpelling("traveler", "traveler / traveller").match).toBe(true);
    expect(matchWordSpelling("traveller", "traveler / traveller").match).toBe(true);
    expect(matchWordSpelling("center", "center, centre").match).toBe(true);
    expect(matchWordSpelling("centre", "center, centre").match).toBe(true);
  });

  it("容忍动词 to 前缀与连字符/智能引号", () => {
    expect(matchWordSpelling("abandon", "to abandon").match).toBe(true);
    expect(matchWordSpelling("to abandon", "abandon").match).toBe(true);
    expect(matchWordSpelling("dont", "don't").match).toBe(true);
    expect(matchWordSpelling("don't", "dont").match).toBe(true);
    expect(matchWordSpelling("well known", "well-known").match).toBe(true);
    expect(matchWordSpelling("well-known", "well known").match).toBe(true);
  });

  it("相似度计算与不匹配判定", () => {
    // 拼写微小失误应有较高相似度
    const resClose = matchWordSpelling("embarass", "embarrass");
    expect(resClose.similarity).toBeGreaterThan(0.8);

    // 完全无关单词绝不匹配
    const resMismatch = matchWordSpelling("banana", "elephant");
    expect(resMismatch.match).toBe(false);
    expect(resMismatch.similarity).toBeLessThan(0.4);
  });

  it("getCleanWordForDisplay - 剥离噪声展示净词", () => {
    expect(getCleanWordForDisplay("take off (起飞)")).toBe("take off");
    expect(getCleanWordForDisplay("abandon [v.]")).toBe("abandon");
  });

  it("extractWordCandidates - 提取所有等效候选", () => {
    const candidates = extractWordCandidates("vt. abandon (抛弃)");
    expect(candidates).toContain("abandon");
  });
});
