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
      '请根据英语单词 "{word}"（释义：{meaning}），生成一道适合 {level} 水平的完形填空题。',
      "",
      "要求：",
      '1. 编写 2-3 句自然流畅的英语短段落，空格处只能填 "{word}"，用 _____ 代替',
      '2. 段落语境应能帮助学习者推断出答案',
      "3. 用中文简要解释为什么该词合适",
      "",
      "严格按以下格式输出，不要添加其他内容：",
      "**题目**: [段落]",
      "**解析**: [中文解析]",
    ].join("\n"),
  },
  context: {
    id: "prompt_context",
    label: "语境对话",
    description: "用单词编情景对话（AI 深度复习 · 语境题）",
    default: [
      '请用英语单词 "{word}"（释义：{meaning}）编写一个情景对话，难度适合 {level} 水平。',
      "",
      "要求：",
      '1. 对话 2-3 轮，自然地使用 "{word}"，场景真实可信',
      "2. 对话角色用 A/B 标注",
      '3. 对话后留一个中文问题，考察学习者是否理解 "{word}" 在对话中的含义',
      "",
      "严格按以下格式输出，不要添加其他内容：",
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
      "2. 例句场景应多样化（如日常、学术、工作等不同语境）",
      "3. 最后一个例句将该词挖空（用 _____ 代替）",
      "4. 提出一个理解性问题考察该词的含义",
      "",
      "严格按以下格式输出，不要添加其他内容：",
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
      '- 若方向为 "看释义选单词"：选项必须是 4 个英语单词，其中一个是 {word}；干扰项应词性相同、难度接近、具有迷惑性',
      '- 若方向为 "看单词选释义"：选项必须是 4 个中文释义，其中一个是 {meaning}；干扰项应与正确答案词性类似但含义不同',
      "",
      "严格按以下格式输出，不要添加其他内容：",
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
      "请评估用户对以下英语问题的回答质量，给出 1-4 分的整数评分：",
      "",
      "评分标准：",
      "1分 = 完全错误或不理解（答非所问、含义完全偏离）",
      "2分 = 部分正确但有明显错误（核心意思对但细节错，或反之）",
      "3分 = 基本正确，仅有小错误（拼写、词形小偏差但不影响理解）",
      "4分 = 完全正确（含义精准、表达得当）",
      "",
      "**题目**: {question}",
      "**正确答案**: {answer}",
      "**用户回答**: {userAnswer}",
      "",
      "严格按以下格式输出，不要添加其他内容：",
      "**评分**: [数字 1-4]",
      "**评语**: [一句话简要说明理由]",
    ].join("\n"),
  },
};

export const PROMPT_TYPES: PromptType[] = ["cloze", "context", "example", "choice", "grading"];

export type AIStrategy = "teach" | "recognition" | "production" | "deep_drill";

export const STRATEGY_TYPES: AIStrategy[] = ["teach", "recognition", "production", "deep_drill"];

/** Phase 6B：按 FSRS 状态自适应的 AI 策略 Prompt（JSON 结构化输出 · 教学优先） */
const TEACHING_SCHEMA = [
  '"explanation": "词义讲解（中文，含一词多义/熟词生义，简明扼要）"',
  '"etymology": "词根/词缀分析（无则填空字符串）"',
  '"examples": ["英文例句1 —— 中文翻译", "英文例句2 —— 中文翻译"]',
  '"usage": "常见搭配、固定短语和用法要点（中文）"',
  '"derived": ["同根词/派生词/近义词（带简要释义）"]',
  '"confusable": ["易混词及辨析要点（可选）"]',
  '"mnemonic": "助记法/联想记忆（可选）"',
  '"practice": "一道针对性小练习（可选，如填空/选择/造句，并附参考答案）"',
  '"follow_up": "引导深入学习的追问（可选）"',
].join(", ");

export const STRATEGY_PROMPTS: Record<AIStrategy, string> = {
  teach: [
    '请针对单词 "{word}"（释义：{meaning}）进行首次教学。',
    "",
    "教学重点：",
    "1. 先讲清含义与用法（含一词多义/熟词生义）",
    "2. 给出 2-3 个地道英文例句（每句附中文翻译）",
    "3. 列出同根词/派生词/词族",
    "4. 最后给一道简单小练习检验理解",
    "",
    "语言要求：除英文例句外，其他内容均用中文。",
    "请严格以 JSON 格式回复，不要使用 markdown 代码块包裹，不要输出 JSON 以外的任何内容。",
    "JSON 结构：{ " + TEACHING_SCHEMA + " }",
  ].join("\n"),
  recognition: [
    '请针对单词 "{word}"（释义：{meaning}）先讲解再出识别题。',
    "",
    "教学流程：",
    "1. 简要讲解词义、给出 1-2 个例句（附中文翻译）与用法要点",
    "2. 出一道识别题（选择题或完形填空）检验理解，并附解析",
    "",
    "语言要求：除英文例句外，其他内容均用中文。",
    "请严格以 JSON 格式回复，不要使用 markdown 代码块包裹，不要输出 JSON 以外的任何内容。",
    "JSON 结构：{ " + TEACHING_SCHEMA + " }（其中 practice 为识别题，follow_up 可引导下一步）",
  ].join("\n"),
  production: [
    '请针对单词 "{word}"（释义：{meaning}）先讲解再设计产出练习。',
    "",
    "教学流程：",
    "1. 讲解含义、常见搭配与近义/同根词，给出例句",
    "2. 设计一道产出型练习（造句/翻译/语境运用），附参考答案与得分要点",
    "",
    "语言要求：除英文例句外，其他内容均用中文。",
    "请严格以 JSON 格式回复，不要使用 markdown 代码块包裹，不要输出 JSON 以外的任何内容。",
    "JSON 结构：{ " + TEACHING_SCHEMA + " }（其中 practice 为产出练习及参考答案）",
  ].join("\n"),
  deep_drill: [
    '请针对顽固词 "{word}"（释义：{meaning}）进行深度讲解和强化训练。',
    "",
    "教学重点：",
    "1. 助记法/联想记忆（必须提供）",
    "2. 易混词辨析（如有）",
    "3. 词根/词缀分析与同根词族",
    "4. 多角度例句（不同语境）",
    "5. 递进式练习（由易到难 2-3 题）",
    "",
    "语言要求：除英文例句外，其他内容均用中文。",
    "请严格以 JSON 格式回复，不要使用 markdown 代码块包裹，不要输出 JSON 以外的任何内容。",
    "JSON 结构：{ " + TEACHING_SCHEMA + " }（其中 practice 包含 2-3 道递进练习，用换行分隔）",
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
