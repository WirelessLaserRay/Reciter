import { db } from "@/lib/db";

export type PromptType = "cloze" | "context" | "grading";

export interface PromptTemplate {
  id: string;
  label: string;
  description: string;
  default: string;
}

/** 默认三套 Prompt 模板（可编辑，存 settings：prompt_cloze / prompt_context / prompt_grading） */
export const DEFAULT_PROMPTS: Record<PromptType, PromptTemplate> = {
  cloze: {
    id: "prompt_cloze",
    label: "完形填空",
    description: "根据单词生成语境完形题（用于测试模式与 AI 深度复习）",
    default: [
      '你是一位专业的英语教师。请根据给定的英语单词 "{word}"（释义：{meaning}），生成一道适合 {level} 水平学习者的完形填空题。',
      "",
      "要求：",
      '1. 编写一个 3-5 句话的英语短段落，其中 "{word}" 出现的位置用 _____ 代替',
      '2. 提供 4 个选项（A/B/C/D），其中一个是正确答案 "{word}"',
      "3. 用中文简要解释为什么正确答案合适",
      "",
      "输出格式：",
      "**题目**: [段落]",
      "**选项**: A. xxx  B. xxx  C. xxx  D. xxx",
      "**答案**: [字母]",
      "**解析**: [中文解析]",
    ].join("\n"),
  },
  context: {
    id: "prompt_context",
    label: "语境造句",
    description: "用单词编情景对话（用于 AI 深度复习的语境模式）",
    default: [
      '你是一位专业的英语教师。请用英语单词 "{word}"（释义：{meaning}）造一个情景对话。',
      "",
      "要求：",
      "1. 对话 2-3 轮，自然地使用该单词",
      "2. 难度适合 {level} 水平",
      "3. 对话后留一个问句考察 {word} 的含义",
      "",
      "输出格式：",
      "**对话**:",
      "A: ...",
      "B: ...",
      "**问题**: [基于对话的中文问题]",
      "**答案**: [中文答案]",
    ].join("\n"),
  },
  grading: {
    id: "prompt_grading",
    label: "AI 判分",
    description: "评估用户回答质量并给出 1-4 分",
    default: [
      "请评估用户对以下英语问题的回答质量，并给出 1-4 分的评分：",
      "1分 = 完全错误或不理解",
      "2分 = 部分正确但有明显错误",
      "3分 = 基本正确，小错误",
      "4分 = 完全正确",
      "",
      "**题目**: {question}",
      "**正确答案**: {answer}",
      "**用户回答**: {userAnswer}",
      "",
      "请给出评分（仅数字 1-4）和简短评语。",
      "格式：",
      "**评分**: [数字]",
      "**评语**: [一句话]",
    ].join("\n"),
  },
};

export const PROMPT_TYPES: PromptType[] = ["cloze", "context", "grading"];

/** 读取模板（settings 覆盖时用用户版本） */
export async function getPromptTemplate(type: PromptType): Promise<string> {
  const def = DEFAULT_PROMPTS[type];
  const saved = await db.getSetting(def.id);
  return saved && saved.trim() ? saved : def.default;
}

/** 保存模板 */
export async function savePromptTemplate(type: PromptType, content: string): Promise<void> {
  await db.setSetting(DEFAULT_PROMPTS[type].id, content);
}

/** 恢复默认 */
export async function resetPromptTemplate(type: PromptType): Promise<void> {
  await db.setSetting(DEFAULT_PROMPTS[type].id, DEFAULT_PROMPTS[type].default);
}

/** 渲染模板中的占位符 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split("{" + k + "}").join(v);
  return out;
}
