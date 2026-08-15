/**
 * AI 出题适配层
 * 解析 AI 按模板返回的原始回复，提取结构化题目（题目/选项/答案/解析），
 * 并适配为测验（QuizSession）可用的结构 —— 关键：答案与解析在作答前不泄漏。
 */

import { parseAIJSON } from "@/lib/ai-parse";

export interface AIParsedQuestion {
  /** 展示给用户的题目文本（已剔除选项/答案/解析，避免泄漏） */
  question: string;
  /** 选项（A. xxx B. xxx ... 解析提取，≥2 个才有效） */
  options: string[] | null;
  /** 答案字母（A-D） */
  answerLetter: string | null;
  /** 答案文本（字母映射到选项后的具体内容） */
  answerText: string | null;
  /** 解析/解释 */
  explanation: string | null;
  /** 原始回复（存档用，不直接展示） */
  raw: string;
}

export type QuizItemType = "fill-cn2en" | "choice-cn2en" | "choice-en2cn";

export interface AdaptedQuizQuestion {
  /** 展示给用户的题目 */
  prompt: string;
  /** 有效 AI 选项（≥2）；null → 使用本地干扰项 */
  options: string[] | null;
  /** 正确答案文本（按题型取 front 或 back，并确保包含在选项中） */
  correctAnswer: string;
  /** 解析（作答后展示） */
  explanation: string | null;
  /** 原始 AI 回复（存入 review_logs / 调试） */
  aiRaw: string;
}

const SECTION_RE =
  /\*\*(题目|选项|答案|解析|对话|问题|例句)\*\*\s*[:：]\s*([\s\S]*?)(?=\*\*(?:题目|选项|答案|解析|对话|问题|例句)\*\*\s*[:：]|$)/g;

/** 按 **标签**: 提取各段 */
export function parseSections(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  SECTION_RE.lastIndex = 0;
  while ((m = SECTION_RE.exec(content)) !== null) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** 解析选项文本："A. xxx  B. yyy  C. zzz  D. www" → ["xxx","yyy","zzz","www"] */
export function parseOptions(text: string | undefined): string[] | null {
  if (!text) return null;
  const items = text
    .split(/(?=[A-D][\.、．)）]\s*)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^[A-D][\.、．)）]\s*/, "").trim());
  return items.length >= 2 ? items : null;
}

/** 提取答案字母（"B" / "[B]" / "答案：B" 等） */
export function extractAnswerLetter(text: string | undefined): string | null {
  if (!text) return null;
  const m = /[A-Da-d]/.exec(text);
  return m ? m[0].toUpperCase() : null;
}

/** 转义正则特殊字符（字符类中省略 $，其在本场景可作字面量） */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^{}()|[\]\\]/g, "\\$&");
}

/** 将题目中的目标单词替换为填空（若 AI 未按模板挖空） */
function blankWord(text: string, word: string): string {
  if (!word) return text;
  if (text.includes("_____")) return text;
  return text.replace(new RegExp("\\b" + escapeRegExp(word) + "\\b", "g"), "_____");
}

/** 从 JSON 结构化输出中解析题目；非 JSON 或字段缺失时返回 null */
export function parseStructuredQuestion(raw: string): AIParsedQuestion | null {
  const data = parseAIJSON<{
    question?: string;
    options?: string[];
    answer?: string;
    explanation?: string;
  }>(raw);
  if (!data || typeof data !== "object") return null;

  const options = Array.isArray(data.options) && data.options.length >= 2 ? data.options : null;
  let answerLetter: string | null = null;
  let answerText: string | null = null;
  const answer = typeof data.answer === "string" ? data.answer.trim() : "";

  if (/^[A-Da-d]$/.test(answer)) {
    answerLetter = answer.toUpperCase();
    if (options) {
      const idx = answerLetter.charCodeAt(0) - 65;
      answerText = options[idx] ?? null;
    }
  } else if (options && answer) {
    const idx = options.findIndex((o) => o === answer);
    if (idx >= 0) {
      answerLetter = String.fromCharCode(65 + idx);
      answerText = answer;
    } else {
      answerText = answer;
    }
  } else if (answer) {
    answerText = answer;
  }

  const question = typeof data.question === "string" ? data.question.trim() : "";
  if (!question) return null;

  return {
    question,
    options,
    answerLetter,
    answerText,
    explanation: typeof data.explanation === "string" ? data.explanation : null,
    raw,
  };
}

/** 解析 AI 回复为结构化题目（不含泄漏） */
export function parseAIQuestion(raw: string): AIParsedQuestion {
  const structured = parseStructuredQuestion(raw);
  if (structured) return structured;

  const sections = parseSections(raw);
  const options = parseOptions(sections["选项"]);
  const answerLetter = extractAnswerLetter(sections["答案"]);
  let answerText: string | null = null;
  if (answerLetter && options) {
    const idx = answerLetter.charCodeAt(0) - 65;
    answerText = options[idx] ?? null;
  }
  // 题目：完形取「题目」；例句取「例句」+「问题」；语境取「对话」+「问题」
  let question = sections["题目"] ?? "";
  if (!question) {
    const ex = sections["例句"] ?? "";
    const q = sections["问题"] ?? "";
    const dialog = sections["对话"] ?? "";
    question = [ex, dialog, q].filter(Boolean).join("\n");
  }
  // 剔除可能残留的标签行，防止答案泄漏
  question = question
    .split("\n")
    .filter((l) => !/^\s*\*{0,2}(选项|答案|解析)\*{0,2}\s*[:：]/.test(l))
    .join("\n")
    .trim();
  return {
    question,
    options,
    answerLetter,
    answerText,
    explanation: sections["解析"] ?? null,
    raw,
  };
}

/** 适配为测验可用结构（按题型归一化正确答案） */
export function adaptAIQuestion(
  raw: string,
  itemType: QuizItemType,
  front: string,
  back: string
): AdaptedQuizQuestion {
  const parsed = parseAIQuestion(raw);
  const correctAnswer = itemType === "choice-en2cn" ? back : front;

  // 填空：题目挖空（若未挖空则替换目标词）
  if (itemType === "fill-cn2en") {
    return {
      prompt: blankWord(parsed.question || back, front),
      options: null,
      correctAnswer: front,
      explanation: parsed.explanation,
      aiRaw: raw,
    };
  }

  // 选择：方向校验（英译中须含中文选项、中译英须为英文选项），
  // 有效则使用（并确保含正确答案），方向不符则回退本地干扰项
  let options = parsed.options;
  if (options) {
    const hasCJK = options.some((o) => /[\u4e00-\u9fff]/.test(o));
    const directionOk = itemType === "choice-en2cn" ? hasCJK : !hasCJK;
    if (directionOk) {
      if (!options.includes(correctAnswer)) options = [correctAnswer, ...options];
    } else {
      options = null; // 方向不符（如英译中却给了英文选项），回退本地
    }
  }
  return {
    prompt: parsed.question || (itemType === "choice-cn2en" ? back : front),
    options,
    correctAnswer,
    explanation: parsed.explanation,
    aiRaw: raw,
  };
}

/** 深度复习展示用：仅返回干净的题目文本（无答案/选项/解析泄漏） */
export function cleanQuestionDisplay(raw: string): string {
  return parseAIQuestion(raw).question || raw;
}
