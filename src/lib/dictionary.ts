import { AIClient, getAIConfig } from "@/lib/ai-client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";

export interface DictionaryResult {
  source: "dictionary" | "tatoeba" | "ai" | "none";
  examples: string[];
}

const cache = new Map<string, Promise<DictionaryResult>>();
const httpFetch = isTauri() ? tauriFetch : (...args: Parameters<typeof fetch>) => fetch(...args);

async function fetchFreeDictionary(word: string): Promise<string[]> {
  const res = await httpFetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    meanings?: Array<{ definitions?: Array<{ example?: string }> }>;
  }>;
  const examples: string[] = [];
  for (const entry of data ?? []) {
    for (const meaning of entry.meanings ?? []) {
      for (const def of meaning.definitions ?? []) {
        if (def.example) examples.push(def.example);
      }
    }
  }
  return examples;
}

async function fetchTatoeba(word: string): Promise<string[]> {
  const res = await httpFetch(
    `https://api.tatoeba.org/api/v1/sentences?q=${encodeURIComponent(word)}&lang=eng&limit=3`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ text?: string }> };
  return (data.results ?? []).map((r) => r.text ?? "").filter(Boolean);
}

async function generateExample(word: string): Promise<string> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) return "";
  const raw = await client.chat([
    { role: "user", content: `请为英语单词/短语 "${word}" 生成一个简洁的英文例句，只输出例句本身。` },
  ]);
  return raw.trim().replace(/^["'“”]|["'“”]$/g, "");
}

/** 依次降级：Free Dictionary → Tatoeba → AI；带内存缓存 */
export function fetchExamples(word: string): Promise<DictionaryResult> {
  const key = word.trim().toLowerCase();
  if (!key) return Promise.resolve({ source: "none", examples: [] });
  const cached = cache.get(key);
  if (cached) return cached;
  const p = (async () => {
    try {
      const dict = await fetchFreeDictionary(key);
      if (dict.length > 0) return { source: "dictionary" as const, examples: dict.slice(0, 3) };
    } catch {
      // fallthrough
    }
    try {
      const tato = await fetchTatoeba(key);
      if (tato.length > 0) return { source: "tatoeba" as const, examples: tato.slice(0, 3) };
    } catch {
      // fallthrough
    }
    try {
      const ai = await generateExample(key);
      if (ai) return { source: "ai" as const, examples: [ai] };
    } catch {
      // fallthrough
    }
    return { source: "none" as const, examples: [] };
  })();
  cache.set(key, p);
  return p;
}
