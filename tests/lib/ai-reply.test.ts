import { describe, it, expect } from "vitest";
import { sanitizeMarkdownBold } from "@/components/ai/AIReply";

describe("sanitizeMarkdownBold", () => {
  it("cleans spaces on both sides inside asterisks", () => {
    expect(sanitizeMarkdownBold("** 单词 **")).toBe("**单词**");
    expect(sanitizeMarkdownBold("请注意这个 ** 重点单词 ** 必须要背")).toBe("请注意这个 **重点单词** 必须要背");
  });

  it("cleans space on the left side inside asterisks", () => {
    expect(sanitizeMarkdownBold("** 单词**")).toBe("**单词**");
    expect(sanitizeMarkdownBold("这是一个** 核心考点**")).toBe("这是一个**核心考点**");
  });

  it("cleans space on the right side inside asterisks", () => {
    expect(sanitizeMarkdownBold("**单词 **")).toBe("**单词**");
    expect(sanitizeMarkdownBold("这是一个**核心考点 **句子")).toBe("这是一个**核心考点**句子");
  });

  it("preserves already correct bold markup", () => {
    expect(sanitizeMarkdownBold("**标准加粗**")).toBe("**标准加粗**");
    expect(sanitizeMarkdownBold("Hello **world** test")).toBe("Hello **world** test");
  });

  it("preserves bold-italic (three asterisks)", () => {
    expect(sanitizeMarkdownBold("***重要***")).toBe("***重要***");
  });

  it("handles empty or empty bold gracefully", () => {
    expect(sanitizeMarkdownBold("")).toBe("");
  });
});
