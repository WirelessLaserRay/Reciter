import { parseMarkdown, type ParsedCard, type ParseResult } from "./markdown-parser";
import { extractPhoneticFromText } from "@/lib/phonetic";
import { splitMeaningText, extractAndNormalizeMeaning } from "./meaning";
import { parseAPKG } from "./apkg-parser";

export type ImportFormat = "markdown" | "csv" | "json" | "txt" | "apkg";

export interface ImportFileResult extends ParseResult {
  fileName: string;
  format: ImportFormat;
}

/** 简易 CSV 行解析（支持双引号包裹字段） */
function parseCSVLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length > 0 || field !== "") {
      push();
      rows.push(row);
      row = [];
    }
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      push();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (field.trim() !== "" || row.length > 0) pushRow();
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

const COLUMN_ALIASES: Record<string, keyof ParsedCard | "deck"> = {
  front: "front", word: "front", 单词: "front", 词: "front", headword: "front",
  back: "back", meaning: "back", 释义: "back", 意思: "back", 含义: "back",
  trans: "back", translation: "back", definition: "back", explain: "back", explanation: "back",
  deck: "deck", deckname: "deck", 词库: "deck", 分组: "deck",
  tags: "tags", tag: "tags", 标签: "tags",
  key: "isKey", iskey: "isKey", 重点: "isKey",
};

/** 解析 CSV：首行若为表头则识别列，否则按 word,meaning 顺序 */
export function parseCSV(content: string, defaultDeck = "CSV 导入"): ParseResult {
  const lines = content.replace(/^\uFEFF/, "").trim();
  const rows = parseCSVLines(lines);
  const cards: ParsedCard[] = [];
  const warnings: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  if (rows.length === 0) return { bookTitle: "", cards, warnings, duplicates };

  const first = rows[0].map((c) => c.trim().toLowerCase());
  const header = first.some((c) => COLUMN_ALIASES[c] !== undefined);
  const colMap: Record<number, keyof ParsedCard | "deck"> = {};
  if (header) {
    first.forEach((c, i) => {
      if (COLUMN_ALIASES[c] !== undefined) colMap[i] = COLUMN_ALIASES[c];
    });
  }

  const dataRows = header ? rows.slice(1) : rows;
  for (const r of dataRows) {
    let front = header ? ((colMap[0] === "front" ? r[0] : "") ?? "") : (r[0] ?? "");
    let back = "";
    let deckName = defaultDeck;
    let tags: string[] = [];
    let isKey = false;
    if (header) {
      for (let i = 0; i < r.length; i++) {
        const col = colMap[i];
        if (!col) continue;
        const v = (r[i] ?? "").trim();
        if (col === "front" && v) front = v;
        else if (col === "back" && v) back = v;
        else if (col === "deck" && v) deckName = v;
        else if (col === "tags" && v) tags = v.split(/[;；|]/).map((t) => t.trim()).filter(Boolean);
        else if (col === "isKey" && v) isKey = /^(1|true|yes|是|true)$/i.test(v.trim());
      }
    } else {
      front = (r[0] ?? "").trim();
      back = (r[1] ?? "").trim();
      if (r.length > 2 && r[2]?.trim()) deckName = r[2].trim();
    }
    if (!front || !back) {
      if (front || back) warnings.push(`CSV 行缺少字段: "${(front || back).slice(0, 60)}"`);
      continue;
    }
    const key = deckName + "\u0000" + front;
    if (seen.has(key)) { duplicates.push(`[${deckName}] ${front}`); continue; }
    seen.add(key);
    const meaning = splitMeaningText(back, front);
    cards.push({ front, back, markdown: "", phonetic: extractPhoneticFromText(front), deckName, folder: "", tags, highlights: [], isKey, meaningPrimary: meaning.primary, meaningSecondary: meaning.secondary });
  }
  return { bookTitle: "", cards, warnings, duplicates };
}

/** 解析 JSON：支持标准数组、Qwerty Learner 格式、嵌套 cards/words/items 数组及键值对词典对象 */
export function parseJSON(content: string): ParseResult {
  const cards: ParsedCard[] = [];
  const warnings: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return { bookTitle: "", cards, warnings: [`JSON 解析失败: ${(e as Error).message}`], duplicates };
  }

  let arr: unknown[] | null = null;
  let defaultDeckFromJson = "";
  let defaultFolderFromJson = "";

  if (Array.isArray(data)) {
    arr = data;
  } else if (typeof data === "object" && data !== null) {
    const rootObj = data as Record<string, unknown>;
    if (typeof rootObj.title === "string" || typeof rootObj.name === "string" || typeof rootObj.deck === "string") {
      defaultDeckFromJson = String(rootObj.title ?? rootObj.name ?? rootObj.deck ?? "").trim();
    }
    if (typeof rootObj.folder === "string") {
      defaultFolderFromJson = String(rootObj.folder).trim();
    }

    const candidateArrays = [
      rootObj.cards,
      rootObj.words,
      rootObj.items,
      rootObj.list,
      rootObj.vocabulary,
      rootObj.data,
      rootObj.dict,
    ];
    for (const c of candidateArrays) {
      if (Array.isArray(c)) {
        arr = c;
        break;
      }
    }

    // 兼顾以单词为 key 的字典对象结构，例如 { "abandon": "vt. 放弃", "ability": "n. 能力" }
    if (!arr) {
      const entries = Object.entries(rootObj);
      if (
        entries.length > 0 &&
        entries.every(
          ([k, v]) =>
            typeof k === "string" &&
            k.length > 0 &&
            (typeof v === "string" || Array.isArray(v) || (typeof v === "object" && v !== null))
        )
      ) {
        arr = entries.map(([k, v]) => {
          if (typeof v === "string" || Array.isArray(v)) {
            return { word: k, trans: v };
          }
          return { word: k, ...(v as object) };
        });
      }
    }
  }

  if (!Array.isArray(arr)) {
    return {
      bookTitle: defaultDeckFromJson,
      cards,
      warnings: ["JSON 格式应为数组或含 cards/words/items 列表的对象"],
      duplicates,
    };
  }

  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;

    // 词目（支持 front, word, name, term, headWord 等常见字段）
    const front = String(
      obj.front ??
        obj.word ??
        obj.name ??
        obj.term ??
        obj.headword ??
        obj.headWord ??
        obj.title ??
        obj.key ??
        ""
    ).trim();

    // 释义源数据（支持 trans, translation, definition, back, meaning, explain, explanation 等）
    const rawMeaning =
      obj.trans ??
      obj.translation ??
      obj.definition ??
      obj.back ??
      obj.meaning ??
      obj.explain ??
      obj.explanation ??
      obj.cn ??
      obj.paraphrase ??
      obj.translate ??
      "";

    const explicitPos = String(obj.pos ?? obj.partOfSpeech ?? "").trim();

    // 结构化提取词性与清洗后的释义
    const { back: finalBack, meaningPrimary, meaningSecondary } =
      extractAndNormalizeMeaning(front, rawMeaning, explicitPos);

    // 音标提取与规范化
    let phonetic = String(
      obj.phonetic ??
        obj.usphone ??
        obj.ukphone ??
        obj.phone ??
        obj.ipa ??
        ""
    ).trim();
    if (phonetic && !phonetic.startsWith("/") && !phonetic.startsWith("[")) {
      phonetic = `/${phonetic}/`;
    }
    if (!phonetic) {
      phonetic = extractPhoneticFromText(front);
    }

    // 例句提取
    const rawExample =
      obj.example ??
      obj.sentence ??
      (Array.isArray(obj.sentences) ? obj.sentences[0] : "") ??
      "";
    const example = typeof rawExample === "string" ? rawExample.trim() : "";

    const rawExampleCn =
      obj.example_cn ??
      obj.example_zh ??
      obj.sentence_cn ??
      obj.sen_cn ??
      "";
    const exampleCn = typeof rawExampleCn === "string" ? rawExampleCn.trim() : "";

    const markdown = example ? (exampleCn ? `${example}\n\n${exampleCn}` : example) : exampleCn;

    const deckName =
      String(obj.deck ?? obj.deckName ?? obj.book ?? (defaultDeckFromJson || "JSON 导入")).trim() ||
      "JSON 导入";
    const folder = String(obj.folder ?? defaultFolderFromJson ?? "").trim();

    const rawTags = obj.tags ?? obj.tag;
    const tags = Array.isArray(rawTags)
      ? rawTags.map(String)
      : typeof rawTags === "string"
        ? rawTags.split(/[;；|,]/).map((t) => t.trim()).filter(Boolean)
        : [];

    const isKey = /^(1|true|yes|是|true)$/i.test(
      String(obj.isKey ?? obj.is_key ?? obj.key ?? obj.important ?? "")
    );

    if (!front || !finalBack) {
      if (front || finalBack) {
        warnings.push(`JSON 条目缺少字段: "${(front || finalBack).slice(0, 60)}"`);
      }
      continue;
    }

    const key = deckName + "\u0000" + front;
    if (seen.has(key)) {
      duplicates.push(`[${deckName}] ${front}`);
      continue;
    }
    seen.add(key);

    cards.push({
      front,
      back: finalBack,
      markdown,
      phonetic,
      deckName,
      folder,
      tags,
      highlights: [],
      isKey,
      meaningPrimary,
      meaningSecondary,
    });
  }

  return { bookTitle: defaultDeckFromJson, cards, warnings, duplicates };
}

/** 解析 TXT：每行一个词条；支持自定义分隔符或自动探测 Tab/竖线/逗号/破折号/冒号；支持多列例句写入；# 开头为词库名 */
export function parseTXT(
  content: string,
  defaultDeck = "手动导入",
  customDelimiter?: string
): ParseResult {
  const cards: ParsedCard[] = [];
  const warnings: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  let deckName = defaultDeck;
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  // 规范化自定义分隔符（支持用户输入 \t 转义）
  const normalizedDelimiter =
    customDelimiter !== undefined && customDelimiter !== ""
      ? customDelimiter === "\\t"
        ? "\t"
        : customDelimiter
      : undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const name = line.replace(/^#+\s*/, "").trim();
      if (name) deckName = name;
      continue;
    }

    let front = line;
    let back = "";
    let markdown = "";

    if (normalizedDelimiter) {
      let parts: string[];
      if (normalizedDelimiter === " " || normalizedDelimiter === "\\s+") {
        // 空格切分：第一段为单词，后续为释义
        const firstSpace = line.search(/\s+/);
        if (firstSpace >= 0) {
          parts = [line.slice(0, firstSpace), line.slice(firstSpace).trim()];
        } else {
          parts = [line];
        }
      } else {
        parts = line.split(normalizedDelimiter);
      }

      if (parts.length >= 2) {
        front = parts[0].trim();
        back = parts[1].trim();
        // 如果有第 3 栏或更多（例如例句或附加说明），作为 markdown 写入
        if (parts.length >= 3) {
          markdown = parts
            .slice(2)
            .map((p) => p.trim())
            .filter(Boolean)
            .join("\n\n");
        }
      } else {
        front = line;
        back = line;
      }
    } else {
      // 默认自动探测常见分隔符
      const tab = line.indexOf("\t");
      const pipe = line.indexOf("|");
      const comma = line.search(/[,，]/);
      const dash = line.search(/\s+[-—–]\s+/);
      const colon = line.search(/\s*[:：]\s*/);
      const seps = [tab, pipe, comma, dash, colon].filter((i) => i >= 0);
      if (seps.length > 0) {
        const idx = Math.min(...seps);
        front = line.slice(0, idx).trim();
        back = line.slice(idx + 1).replace(/^\s*[-—–|,，:：]?\s*/, "").trim();
      }
    }

    if (!front) continue;
    if (!back) back = front;
    const key = deckName + "\u0000" + front;
    if (seen.has(key)) {
      duplicates.push(`[${deckName}] ${front}`);
      continue;
    }
    seen.add(key);
    const meaning = splitMeaningText(back, front);
    cards.push({
      front,
      back,
      markdown,
      phonetic: extractPhoneticFromText(front),
      deckName,
      folder: "",
      tags: [],
      highlights: [],
      isKey: false,
      meaningPrimary: meaning.primary,
      meaningSecondary: meaning.secondary,
    });
  }
  return { bookTitle: "", cards, warnings, duplicates };
}

/** 手动输入解析：按格式解析，auto 时自动识别，支持自定义分隔符 */
export function parseTextInput(
  content: string,
  format: ImportFormat | "auto" = "auto",
  customDelimiter?: string
): ImportFileResult {
  const trimmed = content.trim();
  let fmt: ImportFormat;
  if (format !== "auto") {
    fmt = format;
  } else if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    fmt = "json";
  } else if (customDelimiter && customDelimiter.trim()) {
    // 若用户显式指定了自定义分隔符，优先按 txt 规则解析
    fmt = "txt";
  } else {
    const nonEmptyLines = trimmed.split(/\r?\n/).filter(Boolean);
    const first = nonEmptyLines[0] ?? "";
    if (nonEmptyLines.length > 1 && /[,，]/.test(first)) fmt = "csv";
    else if (/^#+\s/m.test(trimmed) || /-\s+\*\*/.test(trimmed)) fmt = "markdown";
    else fmt = "txt";
  }
  switch (fmt) {
    case "csv":
      return { fileName: "pasted.csv", format: "csv", ...parseCSV(content) };
    case "json":
      return { fileName: "pasted.json", format: "json", ...parseJSON(content) };
    case "markdown":
      return { fileName: "pasted.md", format: "markdown", ...parseMarkdown(content) };
    default:
      return {
        fileName: "pasted.txt",
        format: "txt",
        ...parseTXT(content, "手动导入", customDelimiter),
      };
  }
}

/** 按文件扩展名自动选择解析器 */
export function parseImportFile(
  fileName: string,
  content: string,
  customDelimiter?: string
): ImportFileResult {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") {
    return { fileName, format: "csv", ...parseCSV(content) };
  }
  if (ext === "json") {
    return { fileName, format: "json", ...parseJSON(content) };
  }
  if (ext === "txt") {
    return {
      fileName,
      format: "txt",
      ...parseTXT(content, "手动导入", customDelimiter),
    };
  }
  return { fileName, format: "markdown", ...parseMarkdown(content) };
}

/** 解析 Anki .apkg 二进制文件 */
export async function parseApkgFile(
  fileName: string,
  buffer: ArrayBuffer | Uint8Array
): Promise<ImportFileResult> {
  const defaultDeck = fileName.replace(/\.apkg$/i, "").trim() || "Anki 导入";
  const res = await parseAPKG(buffer, defaultDeck);
  return {
    fileName,
    format: "apkg",
    ...res,
  };
}
