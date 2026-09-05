import { AIClient, getAIConfig } from "@/lib/ai-client";
import { db } from "@/lib/db";
import { splitMeaningText } from "./meaning";
import { normalizeWordForPhonetic, httpFetch, translateText, getDeepLApiKey, translateWithDeepL } from "@/lib/dictionary";

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
    "- 题目难度对标考研英语阅读理解真题水平，不要出过于简单/一眼能看出答案/无需从文章中获取信息的题目",
    "- 选项设计要有迷惑性：干扰项应来自文章内容但偷换概念、以偏概全或因果倒置等，答案选项设计请不要过于有规律（如都是 A 或都是 B）",
    "- 避免出过于简单的表层细节题，侧重考察深层理解，答案不要与文章中的信息直接对应，也不用提示段落信息，应设计成不同表达形式或需要通过推理和分析得出。",
    "",
    "【题型多样化】",
    `${dynamicCount} 道题应尽量覆盖以下题型（至少涵盖 2 种）：`,
    "- 主旨大意题（Main Idea）：考察对文章中心思想的把握",
    "- 推理判断题（Inference）：需根据文章信息进行逻辑推理",
    "- 词义猜测题（Vocabulary）：根据上下文推断词/短语的含义",
    "- 细节理解题（Detail）：考察对关键信息的精确理解",
    "- 文章结构题（Structure）：考察对文章整体结构和逻辑关系的把握",
    "- 观点态度题（Attitude）：判断作者或文中人物的立场",
    "",
    "【每题字段】",
    "- question：题干（英文，清晰明确）",
    "- options：4 个选项（字符串数组，不带 A/B/C/D 前缀；选项长度接近，避免最长选项即正确答案）",
    "- answer：正确选项字母（A/B/C/D，对应 options 下标 0-3）",
    "- explanation：中文解析（须包含：① 正确答案的依据及对应原文位置；② 主要干扰项的排除理由）",
    "",
    "只输出 JSON 数组，不要使用 markdown 代码块包裹。",
    '参考格式：[{"question":"...","options":["选项1","选项2","选项3","选项4"],"answer":"A/B/C/D","explanation":"中文解析"}]',
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

export type ArticleTranslateEngine = "ai" | "deepl" | "fallback";

export async function getArticleTranslateEngine(): Promise<ArticleTranslateEngine> {
  const raw = await db.getSetting("article_translate_engine");
  return raw === "deepl" || raw === "fallback" || raw === "ai" ? raw : "ai";
}

export async function saveArticleTranslateEngine(engine: ArticleTranslateEngine): Promise<void> {
  await db.setSetting("article_translate_engine", engine);
}

/** 全文翻译成中文（支持 AI / DeepL / 公共接口兜底） */
export async function translateArticle(content: string, engine?: ArticleTranslateEngine): Promise<string> {
  const activeEngine = engine ?? (await getArticleTranslateEngine());
  const clean = content.trim();
  if (!clean) return "";

  // 1. DeepL 翻译
  if (activeEngine === "deepl") {
    const key = await getDeepLApiKey();
    if (!key) {
      throw new Error("未配置 DeepL API Key，请前往「设置 → AI与翻译」填写，或切换为 AI 翻译");
    }
    const result = await translateWithDeepL(clean.slice(0, 30000));
    if (result) return result;
    throw new Error("DeepL 全文翻译请求未返回结果，请检查 API Key 或网络连通性");
  }

  // 2. 公共接口兜底（按段落分批翻译）
  if (activeEngine === "fallback") {
    const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return "";
    const translatedParas: string[] = [];
    for (const p of paragraphs) {
      const res = await translateText(p);
      translatedParas.push(res || p);
    }
    return translatedParas.join("\n\n");
  }

  // 3. AI 大模型翻译（默认）
  const client = await getClient();
  if (!client.isReady) {
    throw new Error("AI 接口未配置，请先完成 AI 设置或切换为 DeepL 翻译");
  }
  const prompt = [
    "请将下面的英文文章完整翻译成中文。",
    "",
    "要求：",
    "- 保留原文的段落结构和分段（段落之间保持双换行）",
    "- 翻译准确流畅，符合中文表达习惯",
    "- 只输出中文翻译结果，不要添加注释、解释或原文",
    "",
    clean.slice(0, 15000),
  ].join("\n");
  return client.chat([
    { role: "system", content: "你是 Reciter 文章翻译助手。将英文翻译成通顺自然的中文，保留段落结构，只输出译文。" },
    { role: "user", content: prompt },
  ]);
}

/** 从文章中识别生词（含词性和中文释义，支持无上限全面识别） */
export async function recognizeNewWords(
  content: string,
  limit?: number
): Promise<NewWord[]> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `请全面、深入地阅读下面的英语文章，识别出所有对${standard}学习者有学习价值的全部生词/短语。`,
    "",
    "筛选标准：请勿人为设限数量，全面提取文章的核心词汇、阅读高频词、重难点词与易混淆短语，按重要程度排序，跳过初中等过于简单的基础词汇。",
    "",
    "每个词包含：",
    "- word：单词或短语",
    "- pos：词性（动词必须严格标明及物 vt. 或不及物 vi.，严禁笼统写成 v.；名词 n.，形容词 adj.，副词 adv. 等）",
    "- meaning：简洁中文释义（优先给出文章语境中的含义，动词标明及物/不及物）",
    "",
    '只输出 JSON 数组，不要使用 markdown 代码块包裹。格式：[{"word":"...","pos":"vt.","meaning":"..."}]',
    "",
    "文章：",
    content.slice(0, 12000),
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 生词识别助手。全面从文章中筛选有学习价值的生词，动词必须区分标注及物 vt. 或不及物 vi.，严格以 JSON 数组格式输出，不得输出 JSON 以外的任何内容。" },
    { role: "user", content: prompt },
  ]);
  const words = extractJsonArray<NewWord>(raw);
  return limit && limit > 0 ? words.slice(0, limit) : words;
}

/** AI 按当前标准拆分释义为主要/次要 */
export async function aiSplitMeaning(front: string, back: string): Promise<{ primary: string; secondary: string }> {
  const client = await getClient();
  const standard = await getVocabStandard();
  const prompt = [
    `你是一名专业的英语词汇释义整理助手。请按照${standard}学习标准，重新整理单词 "${front}" 的中文释义。`,

    "",
    "【任务】",
    "将原始释义中的内容按照学习重要程度分为 primary（主要释义）和 secondary（次要释义）。",
    "同时检查原始释义是否遗漏了该单词在当前学习标准下常见且重要的释义；如果确实存在，可以补充到 primary 或 secondary 中。",

    "",
    "【primary 主要释义】",
    `- ${standard}学习者最应该优先掌握的含义。`,
    "- 优先选择高频、高价值、常考、常用的释义。",
    "- 如果某个释义在阅读中非常常见，即使原始释义没有明确列出，也可以补充。",
    "- 如果单词存在重要的熟词生义，应优先纳入 primary。",
    "- primary 不宜堆砌大量低频或专业含义。",

    "",
    "【secondary 次要释义】",
    "- 原始释义中其他有学习价值的含义。",
    "- 可以包含较常见但优先级低于 primary 的释义。",
    "- 可以包含有一定价值的引申义、低频义或特定语境义。",
    "- 如果没有值得单独列出的次要释义，填写空字符串。",

    "",
    "【补充释义规则】",
    `- 补充释义必须符合${standard}学习需求，并且确实是该单词的标准、常见用法。`,
    "- 优先补充高频、常考、阅读中容易遇到但原始释义遗漏的含义。",
    "- 不要为了丰富内容而随意增加生僻、专业或罕见释义。",
    "- 不要重复原始释义中已经表达的含义。",
    "- 如果原始释义已经完整覆盖重要含义，则不要强行补充。",
    "- 补充的释义与原始释义具有同等可靠性时，才应加入结果。",

    "",
    "【整理规则与词性要求（极其重要）】",
    "- 不要丢失原始释义中的重要信息。",
    "- primary 和 secondary 应覆盖原始释义中的有效信息；如果为了学习优先级进行了合并，可以合并同义或高度相近的释义。",
    "- 动词必须严格保留或准确标明及物动词（vt.）和不及物动词（vi.），严禁笼统标注为 v.！",
    "- 若原始释义中已标注 vt. 或 vi.，必须准确保留对应词性，不得篡改或降级为 v.；",
    "- 若原始释义未标明及物性（仅标 v. 或无词性），请根据单词在该含义下的英语语法实际用法，准确标明是 vt. 还是 vi.；若某释义兼具及物与不及物用法，标为 vt.&vi.；",
    "- 其他词性（如 n.、adj.、adv.、prep. 等）也应清晰标注并保留；",
    "- 每个词性对应的释义片段前必须清晰带有词性缩写（如“vt. 抛弃；放弃”、“vi. 放弃；屈服”、“n. 放任”）；",
    "- 中文释义应简洁、自然、准确，避免解释过长。",
    "- 不要输出英文例句、词源、同义词或额外解释。",
    "- 不要改变单词本身的含义或人为创造不存在的释义。",

    "",
    "【输出要求】",
    '只输出合法 JSON，不要使用 Markdown 代码块，不要添加任何解释。',
    '格式：{"primary":"...","secondary":"..."}',

    "",
    `【单词】${front}`,
    `【原始释义】${back}`,
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 释义拆分助手。将释义拆分为主要/次要部分，严格以 JSON 对象格式输出。动词必须明确区分并标明及物（vt.）或不及物（vi.），严禁笼统写成 v.，不得输出 JSON 以外的任何内容。" },
    { role: "user", content: prompt },
  ]);
  const parsed = extractJsonObject<{ primary?: string; secondary?: string }>(raw);
  let primary = parsed.primary?.trim() || "";
  let secondary = parsed.secondary?.trim() || "";
  const combinedLen = (primary + secondary).replace(/\s+/g, "").length;
  const originalLen = back.replace(/\s+/g, "").length;
  // 防丢失：AI 结果为空或明显比原释义短很多时，回退为整条释义作为主要释义
  if (!primary || (originalLen > 0 && combinedLen < originalLen * 0.5)) {
    return splitMeaningText(back);
  }

  // 动词及物性校准与防降级：若原释义已明确标注 vt. 或 vi.，确保不会被错误降级为纯 v.
  const hasVt = /\bvt\./i.test(back);
  const hasVi = /\bvi\./i.test(back);
  if (hasVt && !hasVi) {
    primary = primary.replace(/\bv\.\s*/gi, "vt. ");
    secondary = secondary.replace(/\bv\.\s*/gi, "vt. ");
  } else if (hasVi && !hasVt) {
    primary = primary.replace(/\bv\.\s*/gi, "vi. ");
    secondary = secondary.replace(/\bv\.\s*/gi, "vi. ");
  } else if (hasVt && hasVi) {
    primary = primary.replace(/\bv\.\s*/gi, "vt.&vi. ");
    secondary = secondary.replace(/\bv\.\s*/gi, "vt.&vi. ");
  }

  // 词性继承：从原释义提取词性，优先匹配 vt./vi. 等更精确的词性标注
  const posMatch = back.match(
    /\b(?:vt\.?&vi|vt\.\/vi|vi\.\/vt|vt|vi|n|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part|v)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*/i
  );
  const pos = posMatch ? posMatch[0] : "";
  const hasPos = (s: string) =>
    /\b(?:vt\.?&vi|vt\.\/vi|vi\.\/vt|vt|vi|n|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part|v)\./i.test(s);
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
    "- pos：词性（动词必须严格标明及物 vt. 或不及物 vi.，严禁笼统写成 v.；其余如 n./adj./adv./phr. 等）",
    "- meaning：中文释义（简洁准确，动词请标明及物/不及物）",
    "- example：一个包含该词的地道英文例句",
    "- exampleCn：该例句的中文翻译",
    "",
    '只输出 JSON，不要使用 markdown 代码块包裹：{"word":"...","pos":"...","meaning":"...","example":"...","exampleCn":"..."}',
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 词汇讲解助手。讲解单词的词性、释义和用法，动词必须明确区分标注 vt. 或 vi.，严格以 JSON 对象格式输出，不得输出 JSON 以外的任何内容。" },
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

/** 查询单词释义（优先 AI 词汇讲解，词典 + 翻译降级兜底，用于手动添加生词自动写入释义） */
export async function fetchWordDefinition(
  word: string
): Promise<{ pos: string; meaning: string }> {
  const clean = word.trim();
  if (!clean) return { pos: "", meaning: "" };

  // 1. 优先尝试 AI 讲解接口
  try {
    const exp = await explainWord(clean);
    if (exp && (exp.meaning || exp.pos)) {
      return { pos: exp.pos || "", meaning: exp.meaning || "" };
    }
  } catch {
    // AI 未配置或异常，降级到词典与公共翻译
  }

  // 2. 词典 API + 翻译兜底
  try {
    const key = normalizeWordForPhonetic(clean) || clean.toLowerCase();
    const res = await httpFetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    if (res.ok) {
      const data = (await res.json()) as any[];
      if (Array.isArray(data) && data[0]?.meanings?.length) {
        const firstMeaning = data[0].meanings[0];
        const pos = firstMeaning.partOfSpeech ? `${firstMeaning.partOfSpeech}.` : "";
        const rawDef = firstMeaning.definitions?.[0]?.definition || "";
        if (rawDef) {
          const zh = await translateText(rawDef).catch(() => "");
          if (zh) return { pos, meaning: zh };
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. 直接翻译文本兜底（兼容短语、成语或无词典条目词）
  try {
    const zh = await translateText(clean).catch(() => "");
    if (zh && zh.toLowerCase() !== clean.toLowerCase()) {
      return { pos: "", meaning: zh };
    }
  } catch {
    // ignore
  }

  return { pos: "", meaning: "" };
}

