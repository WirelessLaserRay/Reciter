import { AIClient, getAIConfig } from "@/lib/ai-client";
import { db } from "@/lib/db";
import { splitMeaningText } from "./meaning";

export type VocabStandard = "CET4" | "CET6" | "考研" | "专业英语";

export interface ArticleQuestion {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface NewWord {
  word: string;
  pos: string;
  meaning: string;
}

export interface WordExplanation {
  word: string;
  pos: string;
  meaning: string;
  example: string;
  exampleCn: string;
}

const STANDARDS: VocabStandard[] = ["CET4", "CET6", "考研", "专业英语"];

export function isVocabStandard(v: string): v is VocabStandard {
  return (STANDARDS as string[]).includes(v);
}

export async function getVocabStandard(): Promise<VocabStandard> {
  const raw = await db.getSetting("vocab_standard");
  return isVocabStandard(raw ?? "") ? (raw as VocabStandard) : "考研";
}

export async function saveVocabStandard(standard: VocabStandard): Promise<void> {
  await db.setSetting("vocab_standard", standard);
}

function extractJsonArray<T>(raw: string): T[] {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("AI 返回格式不是 JSON 数组");
  return JSON.parse(cleaned.slice(start, end + 1)) as T[];
}

function extractJsonObject<T>(raw: string): T {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 返回格式不是 JSON 对象");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

async function getClient(): Promise<AIClient> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) throw new Error("AI 未配置，请先完成 AI 设置");
  return client;
}

/** 根据文章生成阅读理解选择题（含选项、答案、中文解析） */
export async function generateArticleQuestions(
  content: string,
  count?: number
): Promise<ArticleQuestion[]> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const text = content.slice(0, 8000);
  // 根据文章词数动态决定出题数量：≤300 词 3 题，300-600 词 4 题，>600 词 5 题
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const dynamicCount = count ?? (wordCount <= 300 ? 3 : wordCount <= 600 ? 4 : 5);
  const prompt = [
    `请根据下面的英语文章出 ${dynamicCount} 道阅读理解选择题。`,
    "",
    "【难度要求】",
    `- 当前学习标准：${standard}`,
    "- 题目难度对标考研英语阅读理解真题水平",
    "- 选项设计要有迷惑性：干扰项应来自文章内容但偷换概念、以偏概全或因果倒置",
    "- 避免出过于简单的表层细节题，侧重考察深层理解",
    "",
    "【题型多样化】",
    `${dynamicCount} 道题应尽量覆盖以下题型（至少涵盖 2 种）：`,
    "- 主旨大意题（Main Idea）：考察对文章中心思想的把握",
    "- 推理判断题（Inference）：需根据文章信息进行逻辑推理",
    "- 词义猜测题（Vocabulary）：根据上下文推断词/短语的含义",
    "- 细节理解题（Detail）：考察对关键信息的精确理解",
    "- 观点态度题（Attitude）：判断作者或文中人物的立场",
    "",
    "【每题字段】",
    "- question：题干（英文，清晰明确）",
    "- options：4 个选项（字符串数组，不带 A/B/C/D 前缀；选项长度接近，避免最长选项即正确答案）",
    "- answer：正确选项字母（A/B/C/D，对应 options 下标 0-3）",
    "- explanation：中文解析（须包含：① 正确答案的依据及对应原文位置；② 主要干扰项的排除理由）",
    "",
    "只输出 JSON 数组，不要使用 markdown 代码块包裹。",
    '格式：[{"question":"...","options":["选项1","选项2","选项3","选项4"],"answer":"A","explanation":"中文解析"}]',
    "",
    "文章：",
    text,
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是一位考研英语阅读命题专家。根据文章出高质量阅读理解选择题，题目难度对标考研真题，解析须引用原文依据并说明干扰项排除理由。严格以 JSON 数组格式输出，不得输出 JSON 以外的任何内容。" },
    { role: "user", content: prompt },
  ]);
  return extractJsonArray<ArticleQuestion>(raw).slice(0, dynamicCount);
}

/** 全文翻译成中文 */
export async function translateArticle(content: string): Promise<string> {
  const client = await getClient();
  const prompt = [
    "请将下面的英文文章完整翻译成中文。",
    "",
    "要求：",
    "- 保留原文的段落结构和分段",
    "- 翻译准确流畅，符合中文表达习惯",
    "- 只输出中文翻译结果，不要添加注释、解释或原文",
    "",
    content.slice(0, 10000),
  ].join("\n");
  return client.chat([
    { role: "system", content: "你是 Reciter 文章翻译助手。将英文翻译成通顺自然的中文，保留段落结构，只输出译文。" },
    { role: "user", content: prompt },
  ]);
}

/** 从文章中识别生词（含词性和中文释义） */
export async function recognizeNewWords(
  content: string,
  limit = 12
): Promise<NewWord[]> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `请从下面的英语文章中识别对${standard}学习者最有学习价值的生词/短语，最多 ${limit} 个。`,
    "",
    "筛选标准：优先选择文章核心词汇、阅读高频词、易混淆词，按重要程度排序，跳过过于简单的基础词汇。",
    "",
    "每个词包含：",
    "- word：单词或短语",
    "- pos：词性（n./v./adj./adv./phr. 等）",
    "- meaning：简洁中文释义（优先给出文章语境中的含义）",
    "",
    '只输出 JSON 数组，不要使用 markdown 代码块包裹。格式：[{"word":"...","pos":"n.","meaning":"..."}]',
    "",
    "文章：",
    content.slice(0, 8000),
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 生词识别助手。从文章中筛选有学习价值的生词，严格以 JSON 数组格式输出，不得输出 JSON 以外的任何内容。" },
    { role: "user", content: prompt },
  ]);
  return extractJsonArray<NewWord>(raw).slice(0, limit);
}

/** AI 按当前标准拆分释义为主要/次要 */
export async function aiSplitMeaning(front: string, back: string): Promise<{ primary: string; secondary: string }> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `请按${standard}标准，将单词 "${front}" 的释义拆分为主要释义和次要释义。`,
    "",
    "拆分规则：",
    "- primary：该标准下最核心、最常考/最常用的含义",
    "- secondary：其余含义；若只有一层含义，填空字符串",
    "- 拆分后合并应覆盖原始释义的全部信息，不得丢失内容",
    "- 保留原始释义中的词性标注（如 n./v. 等）",
    "",
    `原始释义：${back}`,
    "",
    '只输出 JSON，不要使用 markdown 代码块包裹：{"primary":"...","secondary":"..."}',
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 释义拆分助手。将释义拆分为主要/次要部分，严格以 JSON 对象格式输出，不得输出 JSON 以外的任何内容。" },
    { role: "user", content: prompt },
  ]);
  const parsed = extractJsonObject<{ primary?: string; secondary?: string }>(raw);
  const primary = parsed.primary?.trim() || "";
  const secondary = parsed.secondary?.trim() || "";
  const combinedLen = (primary + secondary).replace(/\s+/g, "").length;
  const originalLen = back.replace(/\s+/g, "").length;
  // 防丢失：AI 结果为空或明显比原释义短很多时，回退为整条释义作为主要释义
  if (!primary || (originalLen > 0 && combinedLen < originalLen * 0.5)) {
    return splitMeaningText(back);
  }
  // 词性继承：从原释义提取词性，若 AI 结果缺少词性则补上
  const posMatch = back.match(
    /\b(?:n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*/i
  );
  const pos = posMatch ? posMatch[0] : "";
  const hasPos = (s: string) =>
    /\b(?:n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\./i.test(s);
  const finalPrimary = pos && primary && !hasPos(primary) ? `${pos} ${primary}` : primary;
  const finalSecondary = pos && secondary && !hasPos(secondary) ? `${pos} ${secondary}` : secondary;
  return { primary: finalPrimary, secondary: finalSecondary };
}

/** 讲解单个生词（词性/释义/例句/翻译） */
export async function explainWord(word: string): Promise<WordExplanation> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `请讲解英语单词/短语「${word}」，难度适合${standard}水平。`,
    "",
    "输出以下字段：",
    "- word：单词/短语本身",
    "- pos：词性（n./v./adj./adv./phr. 等）",
    "- meaning：中文释义（简洁准确）",
    "- example：一个包含该词的地道英文例句",
    "- exampleCn：该例句的中文翻译",
    "",
    '只输出 JSON，不要使用 markdown 代码块包裹：{"word":"...","pos":"...","meaning":"...","example":"...","exampleCn":"..."}',
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 词汇讲解助手。讲解单词的词性、释义和用法，严格以 JSON 对象格式输出，不得输出 JSON 以外的任何内容。" },
    { role: "user", content: prompt },
  ]);
  const parsed = extractJsonObject<WordExplanation>(raw);
  return {
    word: parsed.word || word,
    pos: parsed.pos || "",
    meaning: parsed.meaning || "",
    example: parsed.example || "",
    exampleCn: parsed.exampleCn || "",
  };
}
