import { AIClient, getAIConfig } from "@/lib/ai-client";
import { httpFetch, translateText } from "@/lib/dictionary";

export interface CardExampleItem {
  sense: string; // 对应具体释义/词性，如 "v. 放弃"
  en: string;    // 英文例句
  cn: string;    // 中文翻译
  source?: "ai" | "dictionary" | "tatoeba" | string; // 来源（AI / 词典 / Tatoeba）
}

const PREFIX = "ex:";

/**
 * 判断是否为例句标签（以 ex: 或 例句: 开头）
 */
export function isExampleTag(tag: string): boolean {
  if (typeof tag !== "string") return false;
  const t = tag.trim();
  return t.startsWith(PREFIX) || t.startsWith("例句:") || t.startsWith("例句：");
}

/**
 * 从单个标签中解析出 CardExampleItem
 */
export function parseExampleTag(tag: string): CardExampleItem | null {
  if (typeof tag !== "string") return null;
  const t = tag.trim();

  // 1. JSON 格式: ex:{"sense":"...","en":"...","cn":"..."}
  if (t.startsWith(PREFIX)) {
    try {
      const data = JSON.parse(t.slice(PREFIX.length));
      const en = String(data.en || data.text || "").trim();
      if (!en) return null;
      return {
        sense: String(data.sense || "").trim(),
        en,
        cn: String(data.cn || data.translation || "").trim(),
        source: data.source ? String(data.source) : "ai",
      };
    } catch {
      return null;
    }
  }

  // 2. 例句: 前缀格式（兼容旧格式或手动输入）
  if (t.startsWith("例句:") || t.startsWith("例句：")) {
    const content = t.slice(3).trim();
    if (content.startsWith("{")) {
      try {
        const data = JSON.parse(content);
        const en = String(data.en || data.text || "").trim();
        if (!en) return null;
        return {
          sense: String(data.sense || "").trim(),
          en,
          cn: String(data.cn || data.translation || "").trim(),
        };
      } catch {
        // ignore
      }
    }
    // 文本格式: 例句:【sense】en —— cn
    const match = content.match(/^(?:【(.*?)】)?\s*(.*?)(?:\s*(?:——|--|\/\/|翻译[:：])\s*(.*))?$/);
    if (match) {
      const en = match[2]?.trim();
      if (!en) return null;
      return {
        sense: match[1]?.trim() || "",
        en,
        cn: match[3]?.trim() || "",
      };
    }
  }

  return null;
}

/**
 * 容错解析卡片原始 tags（兼容 JSON 数组、单字符串、逗号/顿号/空格切分等）
 */
export function parseRawTags(tagsRaw: string | string[] | undefined): string[] {
  if (!tagsRaw) return [];
  if (Array.isArray(tagsRaw)) return tagsRaw.map(String).filter(Boolean);
  const trimmed = String(tagsRaw).trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
  } catch {
    // 兼容非 JSON 格式：以换行、逗号、顿号、分号或多空格切分
    return trimmed
      .split(/[\n,，、;；\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * 从卡片的 tags 字段解析所有例句（最多 3 句，保证不同释义）
 */
export function getCardExamples(tagsRaw: string | string[] | undefined): CardExampleItem[] {
  const arr = parseRawTags(tagsRaw);
  const result: CardExampleItem[] = [];
  const seenSenses = new Set<string>();

  for (const tag of arr) {
    if (result.length >= 3) break;
    const item = parseExampleTag(tag);
    if (!item) continue;

    // 确保不同释义（如果非空 sense 重复，跳过）
    const senseKey = item.sense.toLowerCase().replace(/\s+/g, "");
    if (senseKey && seenSenses.has(senseKey)) {
      continue;
    }
    if (senseKey) seenSenses.add(senseKey);
    result.push(item);
  }

  return result;
}

/**
 * 提取卡片常规标签（过滤掉例句标签）
 */
export function getPureTags(tagsRaw: string | string[] | undefined): string[] {
  const arr = parseRawTags(tagsRaw);
  return arr.filter((t) => !isExampleTag(t));
}

/**
 * 将例句写入 tags 数组（最多 3 句，保留常规标签，覆盖旧例句标签）
 */
export function setCardExamplesToTags(
  existingTagsRaw: string | string[] | undefined,
  examples: CardExampleItem[]
): string[] {
  const pureTags = getPureTags(existingTagsRaw);
  const validExamples: CardExampleItem[] = [];
  const seenSenses = new Set<string>();

  for (const ex of examples) {
    if (validExamples.length >= 3) break;
    const en = ex.en.trim();
    if (!en) continue;
    const sense = ex.sense.trim();
    const senseKey = sense.toLowerCase().replace(/\s+/g, "");
    if (senseKey && seenSenses.has(senseKey)) continue;
    if (senseKey) seenSenses.add(senseKey);
    validExamples.push({
      sense,
      en,
      cn: ex.cn.trim(),
      source: ex.source || "ai",
    });
  }

  const exampleTags = validExamples.map((ex) => PREFIX + JSON.stringify(ex));
  return [...pureTags, ...exampleTags];
}

/**
 * 匹配例句：
 * 优先调用 AI 生成最多 3 句不同释义的例句（含对应释义/词性与中文翻译）；
 * 若 AI 未配置或失败，自动回退到 Free Dictionary / Tatoeba + 机器翻译。
 */
export async function matchExamplesForCard(card: {
  front: string;
  back: string;
  meaning_primary?: string;
  meaning_secondary?: string;
}): Promise<CardExampleItem[]> {
  const front = card.front.trim();
  if (!front) return [];

  // 1. 尝试使用 AI 匹配（质量最高，严格保证不同释义，最多 3 句）
  try {
    const cfg = await getAIConfig();
    const client = new AIClient(cfg);
    if (client.isReady) {
      const prompt = [
        `你是一名专业的英语教学与例句助手。请为单词/短语「${front}」匹配地道英文例句与中文翻译。`,
        "",
        `【单词】${front}`,
        `【释义】${card.back}`,
        card.meaning_primary ? `【主要释义】${card.meaning_primary}` : "",
        card.meaning_secondary ? `【次要释义】${card.meaning_secondary}` : "",
        "",
        "【严格规则】",
        "1. 最多匹配 3 个例句（若该词只有 1 或 2 个不同释义，则只生成对应数量的例句，最多不超过 3 个）。",
        "2. 每一个例句必须对应【不同的释义/词性】（严禁多个例句表达相同的含义）。",
        "3. 英文例句必须自然、地道，且准确包含该词或其时态/变形形式。",
        "4. 输出为纯 JSON 数组，每个元素字段：",
        '   - sense: 该例句对应的中文释义与词性（动词必须严格标明及物 vt. 或不及物 vi.，例如："vt. 放弃"、"vi. 退却"、"n. 放任"）',
        '   - en: 英文例句',
        '   - cn: 中文翻译',
        "",
        "【输出要求】",
        "仅输出合法 JSON 数组，不要包含 Markdown 代码块标记（如 ```json），不要添加任何额外说明文字。",
        '示例：[{"sense":"vt. 放弃","en":"They abandoned their car in the snow.","cn":"他们把车弃在雪地里。"}]',
      ].filter(Boolean).join("\n");

      const raw = await client.chat([
        { role: "system", content: "你是专业英语例句生成工具。严格输出 JSON 数组，严禁输出任何非 JSON 字符。" },
        { role: "user", content: prompt },
      ]);

      const cleaned = raw.replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start !== -1 && end !== -1 && end > start) {
        const jsonStr = cleaned.slice(start, end + 1);
        const parsed = JSON.parse(jsonStr) as Array<{ sense?: string; en?: string; cn?: string }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const res: CardExampleItem[] = [];
          const seenSenses = new Set<string>();
          for (const item of parsed) {
            if (res.length >= 3) break;
            const en = String(item.en || "").trim();
            if (!en) continue;
            const sense = String(item.sense || "").trim();
            const senseKey = sense.toLowerCase().replace(/\s+/g, "");
            if (senseKey && seenSenses.has(senseKey)) continue;
            if (senseKey) seenSenses.add(senseKey);
            res.push({
              sense,
              en,
              cn: String(item.cn || "").trim(),
              source: "ai",
            });
          }
          if (res.length > 0) return res;
        }
      }
    }
  } catch {
    // AI 失败时自动降级到词典与公共翻译
  }

  // 2. 词典/Tatoeba 回退
  try {
    const key = front.toLowerCase();
    const res = await httpFetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    if (res.ok) {
      const data = (await res.json()) as Array<{
        meanings?: Array<{
          partOfSpeech?: string;
          definitions?: Array<{ definition?: string; example?: string }>;
        }>;
      }>;
      const candidates: Array<{ sense: string; en: string }> = [];
      const seenDefs = new Set<string>();

      for (const entry of data ?? []) {
        for (const meaning of entry.meanings ?? []) {
          const pos = meaning.partOfSpeech || "";
          for (const def of meaning.definitions ?? []) {
            if (candidates.length >= 3) break;
            if (def.example && def.example.trim()) {
              const defKey = (pos + ":" + (def.definition || "")).slice(0, 30).toLowerCase();
              if (!seenDefs.has(defKey)) {
                seenDefs.add(defKey);
                const senseText = pos ? `${pos}.` : "";
                candidates.push({
                  sense: senseText,
                  en: def.example.trim(),
                });
              }
            }
          }
        }
      }

      if (candidates.length > 0) {
        const out: CardExampleItem[] = [];
        for (const item of candidates.slice(0, 3)) {
          const cn = await translateText(item.en);
          out.push({
            sense: item.sense,
            en: item.en,
            cn,
            source: "dictionary",
          });
        }
        return out;
      }
    }
  } catch {
    // ignore
  }

  return [];
}
