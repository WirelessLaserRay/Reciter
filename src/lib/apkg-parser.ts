import { unzipSync } from "fflate";
import initSqlJs from "sql.js";
import type { ParsedCard, ParseResult } from "./markdown-parser";
import { extractPhoneticFromText } from "@/lib/phonetic";
import { splitMeaningText } from "./meaning";

/** 基础 HTML 清洗，去除 Anki 卡片内嵌标签并保留文本结构 */
function cleanAnkiHtml(raw: string): string {
  if (!raw) return "";
  return raw
    // 移除脚本与样式块
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // 移除 Anki 媒体声音标签，如 [sound:xxx.mp3]
    .replace(/\[sound:[^\]]+\]/gi, "")
    // 块级换行转化
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    // 去除所有剩余 HTML 标签
    .replace(/<[^>]+>/g, "")
    // 解码常用 HTML 实体
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/\r?\n\s*\r?\n/g, "\n")
    .trim();
}

/** 启发式判断某个文本是否为音标 */
function looksLikePhonetic(text: string): boolean {
  const t = text.trim();
  return (
    (t.startsWith("/") && t.endsWith("/") && t.length > 2) ||
    (t.startsWith("[") && t.endsWith("]") && t.length > 2) ||
    /^[a-zA-Z\s,;'-]*[æɑːɔːəɪiːʊuːʌɜːeɪaɪɔɪəʊaʊɪəeəʊəptkbdɡtʃdʒfsθðszʃʒhmnŋlrjwˈˌː]+[a-zA-Z\s,;'-]*$/.test(
      t
    )
  );
}

/** 启发式判断某个文本是否主要包含中文释义 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

/** 启发式判断文本是否更像完整例句（以大写字母开头或包含英文句点标点，长度较长） */
function looksLikeSentence(text: string): boolean {
  const t = text.trim();
  return t.length >= 20 && /[.?!。？！]/.test(t);
}

/**
 * 解析 Anki .apkg 压缩包，轻量提取卡片字段（单词、音标、释义、例句与标签）
 */
export async function parseAPKG(
  source: ArrayBuffer | Uint8Array,
  fallbackDeckName = "Anki 导入"
): Promise<ParseResult> {
  const warnings: string[] = [];
  const duplicates: string[] = [];
  const cards: ParsedCard[] = [];
  const seen = new Set<string>();

  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);

  // 1. 使用 fflate 同步解压 ZIP
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (err) {
    return {
      bookTitle: "",
      cards: [],
      warnings: [`解压 APKG 文件失败: ${(err as Error).message}`],
      duplicates: [],
    };
  }

  // 2. 定位 SQLite 数据库文件（collection.anki2 或 collection.anki21）
  const dbBytes = unzipped["collection.anki2"] || unzipped["collection.anki21"];
  if (!dbBytes) {
    return {
      bookTitle: "",
      cards: [],
      warnings: ["无效的 APKG 文件：未找到 collection.anki2 数据库"],
      duplicates: [],
    };
  }

  // 3. 初始化 sql.js 并打开数据库
  const wasmUrl = (import.meta.env.BASE_URL || "") + "sql-wasm.wasm";
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(dbBytes);

  let deckName = fallbackDeckName;
  const modelFieldNames: Record<number, string[]> = {};

  try {
    // 4. 解析 col 表获取默认牌组名与字段映射
    const colRows = db.exec("SELECT decks, models FROM col LIMIT 1");
    if (colRows.length > 0 && colRows[0].values.length > 0) {
      const decksJson = colRows[0].values[0][0];
      const modelsJson = colRows[0].values[0][1];

      // 解析牌组名称
      if (typeof decksJson === "string") {
        try {
          const decks = JSON.parse(decksJson) as Record<string, { name?: string }>;
          for (const key of Object.keys(decks)) {
            const name = decks[key]?.name?.trim();
            if (name && name !== "Default" && name !== "default") {
              // 处理 Anki 层级牌组名（如 "考研::核心词汇"）
              const parts = name.split("::").map((p) => p.trim());
              deckName = parts[parts.length - 1] || name;
              break;
            }
          }
        } catch {}
      }

      // 解析每个 Model 对应的字段名称列表
      if (typeof modelsJson === "string") {
        try {
          const models = JSON.parse(modelsJson) as Record<
            string,
            { flds?: { name?: string; ord?: number }[] }
          >;
          for (const mid of Object.keys(models)) {
            const m = models[mid];
            if (Array.isArray(m?.flds)) {
              modelFieldNames[Number(mid)] = m.flds
                .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
                .map((f) => (f.name ?? "").toLowerCase());
            }
          }
        } catch {}
      }
    }

    // 5. 查询 notes 表提取全部卡片
    const noteRows = db.exec("SELECT id, mid, tags, flds FROM notes");
    if (noteRows.length > 0 && noteRows[0].values.length > 0) {
      for (const row of noteRows[0].values) {
        const mid = Number(row[1]);
        const rawTags = String(row[2] ?? "").trim();
        const fldsRaw = String(row[3] ?? "");

        const rawParts = fldsRaw.split("\x1f");
        const cleanedParts = rawParts.map(cleanAnkiHtml);
        const fldNames = modelFieldNames[mid] || [];

        let front = "";
        let back = "";
        let phonetic = "";
        let example = "";
        const otherNotes: string[] = [];

        // 尝试通过字段名称精准匹配
        if (fldNames.length === cleanedParts.length) {
          fldNames.forEach((name, idx) => {
            const val = cleanedParts[idx];
            if (!val) return;
            if (/^(front|word|term|expression|english|单词|词汇|英文)$/i.test(name)) {
              if (!front) front = val;
            } else if (/^(back|meaning|definition|translation|chinese|释义|中文|含义)$/i.test(name)) {
              if (!back) back = val;
            } else if (/^(phonetic|sound|ipa|accent|音标|发音)$/i.test(name)) {
              if (!phonetic) phonetic = val;
            } else if (/^(example|sentence|context|sample|例句|语境)$/i.test(name)) {
              if (!example) example = val;
              else example += "\n\n" + val;
            } else {
              otherNotes.push(val);
            }
          });
        }

        // 若通过字段名未能完全匹配，走启发式内容特征推断
        if (!front && cleanedParts[0]) {
          front = cleanedParts[0];
        }

        // 识别音标
        if (!phonetic) {
          for (let i = 1; i < cleanedParts.length; i++) {
            const p = cleanedParts[i];
            if (p && looksLikePhonetic(p)) {
              phonetic = p;
              break;
            }
          }
          if (!phonetic && front) {
            phonetic = extractPhoneticFromText(front);
          }
        }

        // 识别释义
        if (!back) {
          for (let i = 1; i < cleanedParts.length; i++) {
            const p = cleanedParts[i];
            if (!p || p === phonetic) continue;
            if (containsChinese(p)) {
              back = p;
              break;
            }
          }
          if (!back && cleanedParts[1] && cleanedParts[1] !== phonetic) {
            back = cleanedParts[1];
          }
        }

        // 识别例句
        if (!example) {
          for (let i = 1; i < cleanedParts.length; i++) {
            const p = cleanedParts[i];
            if (!p || p === phonetic || p === back) continue;
            if (looksLikeSentence(p)) {
              example = p;
              break;
            }
          }
        }

        front = front.trim();
        back = back.trim();

        if (!front) continue;
        if (!back) back = front;

        const key = deckName + "\u0000" + front;
        if (seen.has(key)) {
          duplicates.push(`[${deckName}] ${front}`);
          continue;
        }
        seen.add(key);

        // 拆分 Anki 标签（空格隔开）
        const tags = rawTags
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t && t !== "none");

        const meaning = splitMeaningText(back, front);

        // 组装例句 markdown
        let markdown = example.trim();
        if (!markdown && otherNotes.length > 0) {
          // 挑选一段最像有效注释的字段保留在 markdown 中
          const candidate = otherNotes.find((n) => n.length >= 15);
          if (candidate) markdown = candidate.trim();
        }

        cards.push({
          front,
          back,
          markdown,
          phonetic: phonetic || extractPhoneticFromText(front),
          deckName,
          folder: "",
          tags,
          highlights: [],
          isKey: false,
          meaningPrimary: meaning.primary,
          meaningSecondary: meaning.secondary,
        });
      }
    }
  } catch (e) {
    warnings.push(`解析 APKG 数据库遇到异常: ${(e as Error).message}`);
  } finally {
    db.close();
  }

  return {
    bookTitle: deckName,
    cards,
    warnings,
    duplicates,
  };
}
