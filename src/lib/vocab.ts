import { AIClient, getAIConfig } from "@/lib/ai-client";
import { db } from "@/lib/db";

export type VocabStandard = "CET4" | "CET6" | "考研" | "专业英语";

export interface ArticleQuestion {
  question: string;
  answer: string;
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

/** 根据文章生成阅读理解题（含参考答案） */
export async function generateArticleQuestions(
  content: string,
  count = 3
): Promise<ArticleQuestion[]> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `你是英语阅读出题老师。请根据下面的文章，出 ${count} 道阅读理解题。`,
    `难度标准：${standard}。`,
    "每道题包含 question 和 answer（参考答案）。",
    '只输出 JSON 数组，格式：[{"question":"...","answer":"..."}]',
    "",
    "文章：",
    content.slice(0, 8000),
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 英语阅读出题助手，严格按 JSON 输出。" },
    { role: "user", content: prompt },
  ]);
  return extractJsonArray<ArticleQuestion>(raw).slice(0, count);
}

/** 从文章中识别生词（含词性和中文释义） */
export async function recognizeNewWords(
  content: string,
  limit = 12
): Promise<NewWord[]> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `你是英语词汇老师。请从下面的文章中，识别对${standard}学习者来说可能是生词的单词/短语。`,
    `最多输出 ${limit} 个，按重要程度排序。`,
    "每个词包含 word、pos（词性，如 n./v./adj./phr.）、meaning（中文释义）。",
    '只输出 JSON 数组，格式：[{"word":"...","pos":"n.","meaning":"..."}]',
    "",
    "文章：",
    content.slice(0, 8000),
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 生词识别助手，严格按 JSON 输出。" },
    { role: "user", content: prompt },
  ]);
  return extractJsonArray<NewWord>(raw).slice(0, limit);
}

/** 讲解单个生词（词性/释义/例句/翻译） */
export async function explainWord(word: string): Promise<WordExplanation> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `请用${standard}标准讲解英语单词/短语：${word}`,
    "输出 JSON：{\"word\":\"...\",\"pos\":\"...\",\"meaning\":\"...\",\"example\":\"...\",\"exampleCn\":\"...\"}",
    "example 为包含该词的英文例句，exampleCn 为中文翻译。",
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 词汇讲解助手，严格按 JSON 输出。" },
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
