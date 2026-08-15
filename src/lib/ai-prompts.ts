import { db } from "@/lib/db";

export type PromptType = "cloze" | "context" | "grading" | "example" | "choice";

export interface PromptTemplate {
  id: string;
  label: string;
  description: string;
  default: string;
}

/** 默认 Prompt 模板（可编辑，存 settings：prompt_*） */
export const DEFAULT_PROMPTS: Record<PromptType, PromptTemplate> = {
  cloze: {
    id: "prompt_cloze",
    label: "完形填空",
    description: "生成语境完形题（填空·中译英 的 AI 出题）",
    default: [
      '你是一位专业的英语教师。请根据给定的英语单词 "{word}"（释义：{meaning}），生成一道适合 {level} 水平学习者的完形填空题。',
      "",
      "要求：",
      '1. 编写一个 2-3 句话的英语短段落，其中 "{word}" 出现的位置用 _____ 代替',
      "2. 用中文简要解释为什么该词合适",
      "",
      "输出格式：",
      "**题目**: [段落]",
      "**解析**: [中文解析]",
    ].join("\n"),
  },
  context: {
    id: "prompt_context",
    label: "语境对话",
    description: "用单词编情景对话（AI 深度复习 · 语境题）",
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
  example: {
    id: "prompt_example",
    label: "例句",
    description: "生成带翻译的例句（AI 深度复习 · 生成例句）",
    default: [
      '请用英语单词 "{word}"（释义：{meaning}）生成 2-3 个例句，难度适合 {level} 水平。',
      "",
      "要求：",
      "1. 每个例句后附中文翻译",
      "2. 最后一个例句改为挖空（用 _____ 代替该词）",
      "3. 提出一个理解性问题考察该词的含义",
      "",
      "输出格式：",
      "**例句**: [例句1]",
      "翻译: [中文]",
      "**例句**: [例句2（含 _____）]",
      "翻译: [中文]",
      "**问题**: [理解性问题]",
      "**答案**: [中文答案]",
    ].join("\n"),
  },
  choice: {
    id: "prompt_choice",
    label: "选择题出题",
    description: "生成语境句 + 方向自适应的 4 个选项（选择·中译英 / 选择·英译中 的 AI 出题）",
    default: [
      '请用英语单词 "{word}"（释义：{meaning}）编写一句包含该词的英语语境句，难度适合 {level} 水平。',
      "",
      "随后根据题目方向 {direction} 提供 4 个选项（A/B/C/D）：",
      '- 若方向为 "看释义选单词"：选项必须是 4 个英语单词，其中一个是 {word}',
      '- 若方向为 "看单词选释义"：选项必须是 4 个中文释义，其中一个是 {meaning}',
      "",
      "输出格式：",
      "**题目**: [语境句]",
      "**选项**: A. xxx  B. xxx  C. xxx  D. xxx",
      "**答案**: [字母]",
      "**解析**: [简短中文解析]",
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

export const PROMPT_TYPES: PromptType[] = ["cloze", "context", "example", "choice", "grading"];

export type AIStrategy = "teach" | "recognition" | "production" | "deep_drill";

export const STRATEGY_TYPES: AIStrategy[] = ["teach", "recognition", "production", "deep_drill"];

/** Phase 6B：按 FSRS 状态自适应的 AI 策略 Prompt（JSON 结构化输出） */
export const STRATEGY_PROMPTS: Record<AIStrategy, string> = {
  teach: [
    '你是一位耐心的英语教师。请针对单词 "{word}"（释义：{meaning}）进行首次教学。',
    "请严格以 JSON 格式回复，不要使用 markdown 标记包裹，不要输出其他内容。",
    'JSON 结构：{ "etymology": "词根/词缀分析", "examples": ["例句1", "例句2"], "simple_quiz": "一个简单的理解题", "explanation": "中文讲解" }',
  ].join("\n"),
  recognition: [
    '你是一位英语测验出题者。请根据单词 "{word}"（释义：{meaning}）出一道识别题。',
    "请严格以 JSON 格式回复，不要使用 markdown 标记包裹，不要输出其他内容。",
    'JSON 结构：{ "question": "题目文本", "options": ["选项1", "选项2", "选项3", "选项4"], "answer": "正确答案", "explanation": "解析" }',
  ].join("\n"),
  production: [
    '你是一位英语写作教练。请针对单词 "{word}"（释义：{meaning}）设计一道产出型练习。',
    "请严格以 JSON 格式回复，不要使用 markdown 标记包裹，不要输出其他内容。",
    'JSON 结构：{ "prompt": "练习要求", "sample_answer": "参考答案", "rubric": "评分要点", "explanation": "讲解" }',
  ].join("\n"),
  deep_drill: [
    '你是一位攻克顽固词的记忆教练。请针对单词 "{word}"（释义：{meaning}）设计多角度深度训练。',
    "请严格以 JSON 格式回复，不要使用 markdown 标记包裹，不要输出其他内容。",
    'JSON 结构：{ "mnemonic": "助记法", "confusable_words": ["易混词1", "易混词2"], "quiz_chain": ["递进练习1", "递进练习2", "递进练习3"] }',
  ].join("\n"),
};

/** 读取策略 Prompt（settings 覆盖时用用户版本，键名 strategy_prompt_<strategy>） */
export async function getStrategyPrompt(strategy: AIStrategy): Promise<string> {
  const saved = await db.getSetting("strategy_prompt_" + strategy);
  return saved && saved.trim() ? saved : STRATEGY_PROMPTS[strategy];
}

export async function saveStrategyPrompt(strategy: AIStrategy, content: string): Promise<void> {
  await db.setSetting("strategy_prompt_" + strategy, content);
}

export async function resetStrategyPrompt(strategy: AIStrategy): Promise<void> {
  await db.setSetting("strategy_prompt_" + strategy, STRATEGY_PROMPTS[strategy]);
}

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
