import { AIClient, getAIConfig } from "@/lib/ai-client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";

export interface Example {
  text: string;
  translation: string;
}

export interface DictionaryResult {
  source: "dictionary" | "tatoeba" | "ai" | "none";
  examples: Example[];
}

const cache = new Map<string, Promise<DictionaryResult>>();
const phoneticCache = new Map<string, Promise<string>>();
const httpFetch = isTauri() ? tauriFetch : (...args: Parameters<typeof fetch>) => fetch(...args);

/**
 * 规范化用于查音标的单词：
 * - 忽略括号及括号内容
 * - 只要内容含空格就不解析音标
 * - 内容含斜杠时只取斜杠前内容
 */
export function normalizeWordForPhonetic(raw: string): string {
  const noParen = raw
    .replace(/[（(][^（）()]*[）)]/g, "")
    .trim();
  if (!noParen || noParen.includes(" ")) return "";
  const slash = noParen.indexOf("/");
  return (slash >= 0 ? noParen.slice(0, slash) : noParen).trim().toLowerCase();
}

/** AI 生成音标兜底（仅单词） */
async function generatePhonetic(word: string): Promise<string> {
  try {
    const cfg = await getAIConfig();
    const client = new AIClient(cfg);
    if (!client.isReady) return "";
    const raw = await client.chat([
      { role: "system", content: "你是音标查询工具。只输出 IPA 音标本身（如 /əˈbændən/），不要输出引号、解释、词性或任何其他内容。" },
      { role: "user", content: `请给出英语单词 "${word}" 的 IPA 音标（英式或美式均可），只输出音标。` },
    ]);
    const cleaned = raw.trim().replace(/^["'“”]|["'“”]$/g, "");
    return /^[\/\[]/.test(cleaned) || /[ˈˌa-zæɒɔɪʊʌəɜːiːuːɑːeɪaɪɔɪəʊ]/i.test(cleaned) ? cleaned : "";
  } catch {
    return "";
  }
}

/** 获取单词音标（仅单词，词组返回空）；Free Dictionary 优先，AI 兜底 */
export function fetchPhonetic(word: string): Promise<string> {
  const key = normalizeWordForPhonetic(word);
  if (!key) return Promise.resolve("");
  const cached = phoneticCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    try {
      const res = await httpFetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
      if (res.ok) {
        const data = (await res.json()) as Array<{
          phonetic?: string;
          phonetics?: Array<{ text?: string }>;
        }>;
        for (const entry of data ?? []) {
          if (entry.phonetic) return entry.phonetic;
          for (const ph of entry.phonetics ?? []) {
            if (ph.text) return ph.text;
          }
        }
      }
    } catch {
      // ignore
    }
    try {
      const ai = await generatePhonetic(key);
      if (ai) return ai;
    } catch {
      // ignore
    }
    return "";
  })();
  phoneticCache.set(key, p);
  return p;
}

/**
 * 批量获取音标（带并发控制），用于导入时批量补齐。
 * @param words  待查询的单词列表（词组/空值自动跳过）
 * @param onProgress 进度回调 (done, total)
 * @param concurrency 并发数（默认 5，Free Dictionary 免费 API 不宜过高）
 * @returns Map<原始单词, 音标>
 */
export async function batchFetchPhonetics(
  words: string[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 5,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  // 去重：同一 normalized key 只查一次
  const unique = new Map<string, string[]>(); // normalized key → [原始 words]
  for (const w of words) {
    const key = normalizeWordForPhonetic(w);
    if (!key) continue; // 词组/空值跳过
    const arr = unique.get(key) ?? [];
    arr.push(w);
    unique.set(key, arr);
  }
  const entries = [...unique.entries()];
  const total = entries.length;
  let done = 0;
  onProgress?.(0, total);

  // 分批并发
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ([, originals]) => {
        const phonetic = await fetchPhonetic(originals[0]);
        for (const w of originals) result.set(w, phonetic);
        done++;
        onProgress?.(done, total);
      }),
    );
  }
  return result;
}

export type TranslationProvider = "deepl" | "fallback";

export async function getTranslationProvider(): Promise<TranslationProvider> {
  const raw = await db.getSetting("translation_provider");
  return raw === "deepl" || raw === "fallback" ? raw : "deepl";
}

export async function getDeepLApiKey(): Promise<string> {
  return (await db.getSetting("deepl_api_key")) ?? "";
}

export async function getDeepLApiUrl(): Promise<string> {
  const raw = await db.getSetting("deepl_api_url");
  return raw?.trim() || "https://api-free.deepl.com/v2/translate";
}

export async function getDeepLCorsProxy(): Promise<string> {
  return (await db.getSetting("deepl_cors_proxy"))?.trim() ?? "";
}

/** DeepL 翻译（en → zh-CN）；Tauri 直连 DeepL，Web 走 Worker 代理 */
async function translateWithDeepL(text: string): Promise<string> {
  const key = await getDeepLApiKey();
  if (!key) return "";
  try {
    let res: Response;
    if (isTauri()) {
      // 桌面端：直连 DeepL，Key 放 Header
      const url = await getDeepLApiUrl();
      res = await httpFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `DeepL-Auth-Key ${key}`,
        },
        body: JSON.stringify({ text: [text], target_lang: "ZH-HANS" }),
      });
    } else {
      // 网页端：走 Worker 代理，Key 放 body 由 Worker 转到 Header
      const proxy = await getDeepLCorsProxy();
      if (!proxy) {
        console.warn("DeepL：网页端未配置代理地址，跳过");
        return "";
      }
      res = await httpFetch(proxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: [text], target_lang: "ZH-HANS", auth_key: key }),
      });
    }
    if (!res.ok) {
      console.warn("DeepL 翻译请求失败 status:", res.status);
      return "";
    }
    const data = (await res.json()) as { translations?: Array<{ text?: string }> };
    return data.translations?.[0]?.text ?? "";
  } catch (e) {
    console.warn("DeepL 翻译异常:", e);
    return "";
  }
}

/** 测试 DeepL 配置是否可用（供设置页诊断） */
export async function testDeepL(): Promise<{ ok: boolean; message: string }> {
  const provider = await getTranslationProvider();
  if (provider !== "deepl") {
    return { ok: false, message: "当前例句翻译接口未选择 DeepL" };
  }
  const key = await getDeepLApiKey();
  if (!key) {
    return { ok: false, message: "未填写 DeepL API Key" };
  }
  if (!isTauri()) {
    const proxy = await getDeepLCorsProxy();
    if (!proxy) {
      return { ok: false, message: "网页端未配置 CORS 代理地址，DeepL 无法直连" };
    }
  }
  const t = await translateWithDeepL("Hello world");
  if (t) return { ok: true, message: `翻译成功：${t}` };
  return { ok: false, message: "DeepL 请求失败，请检查 API Key / URL / 代理或控制台日志" };
}

/** MyMemory 免费翻译（en → zh-CN）；失败返回空 */
async function translateWithMyMemory(text: string): Promise<string> {
  try {
    const res = await httpFetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`
    );
    if (!res.ok) return "";
    const data = (await res.json()) as { responseData?: { translatedText?: string } };
    return data.responseData?.translatedText ?? "";
  } catch {
    return "";
  }
}

/** AI 翻译兜底 */
async function translateWithAI(text: string): Promise<string> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) return "";
  const raw = await client.chat([
    { role: "system", content: "你是英文翻译工具。只输出中文译文，不要添加引号、标注、解释或原文。" },
    { role: "user", content: `请将下面的英文翻译成中文，只输出中文译文：\n\n${text}` },
  ]);
  return raw.trim().replace(/^["'“”]|["'“”]$/g, "");
}

async function translateText(text: string): Promise<string> {
  const provider = await getTranslationProvider();
  if (provider === "deepl") {
    const t = await translateWithDeepL(text);
    if (t) return t;
  }
  const t2 = await translateWithMyMemory(text);
  if (t2) return t2;
  try {
    return await translateWithAI(text);
  } catch {
    return "";
  }
}

/** 确保每个例句都带中文翻译 */
async function fillTranslations(examples: Example[]): Promise<Example[]> {
  const out: Example[] = [];
  for (const ex of examples.slice(0, 3)) {
    if (ex.translation) {
      out.push(ex);
    } else {
      const translation = await translateText(ex.text);
      out.push({ text: ex.text, translation });
    }
  }
  return out;
}

async function fetchFreeDictionary(word: string): Promise<Example[]> {
  const res = await httpFetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    meanings?: Array<{ definitions?: Array<{ example?: string }> }>;
  }>;
  const examples: Example[] = [];
  for (const entry of data ?? []) {
    for (const meaning of entry.meanings ?? []) {
      for (const def of meaning.definitions ?? []) {
        if (def.example) examples.push({ text: def.example, translation: "" });
      }
    }
  }
  return examples;
}

async function fetchTatoeba(word: string): Promise<Example[]> {
  const res = await httpFetch(
    `https://api.tatoeba.org/api/v1/sentences?q=${encodeURIComponent(word)}&lang=eng&limit=3`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ text?: string }> };
  return (data.results ?? []).map((r) => ({ text: r.text ?? "", translation: "" })).filter((e) => e.text);
}

async function generateExample(word: string): Promise<Example | null> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) return null;
  const raw = await client.chat([
    { role: "system", content: "你是英语例句生成工具。严格以 JSON 格式输出，不要使用 markdown 代码块包裹，不要输出 JSON 以外的任何内容。" },
    {
      role: "user",
      content: `请为英语单词/短语 "${word}" 生成一个简洁、地道的英文例句，并给出中文翻译。只输出 JSON：{"text":"英文例句","translation":"中文翻译"}`,
    },
  ]);
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned) as { text?: string; translation?: string };
    if (obj.text) return { text: obj.text.trim(), translation: obj.translation?.trim() ?? "" };
  } catch {
    // 如果 AI 没按 JSON 输出，把整段当英文例句
    return { text: raw.trim(), translation: "" };
  }
  return null;
}

/** 依次降级：Free Dictionary → Tatoeba → AI；并统一补中文翻译；带内存缓存 */
export function fetchExamples(word: string): Promise<DictionaryResult> {
  const key = word.trim().toLowerCase();
  if (!key) return Promise.resolve({ source: "none", examples: [] });
  const cached = cache.get(key);
  if (cached) return cached;
  const p = (async () => {
    try {
      const dict = await fetchFreeDictionary(key);
      if (dict.length > 0) {
        return { source: "dictionary" as const, examples: await fillTranslations(dict) };
      }
    } catch {
      // fallthrough
    }
    try {
      const tato = await fetchTatoeba(key);
      if (tato.length > 0) {
        return { source: "tatoeba" as const, examples: await fillTranslations(tato) };
      }
    } catch {
      // fallthrough
    }
    try {
      const ai = await generateExample(key);
      if (ai) {
        const withTranslation = ai.translation ? ai : { text: ai.text, translation: await translateText(ai.text) };
        return { source: "ai" as const, examples: [withTranslation] };
      }
    } catch {
      // fallthrough
    }
    return { source: "none" as const, examples: [] };
  })();
  cache.set(key, p);
  return p;
}
