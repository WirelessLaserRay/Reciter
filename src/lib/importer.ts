import { parseMarkdown, type ParsedCard, type ParseResult } from "./markdown-parser";

export type ImportFormat = "markdown" | "csv" | "json";

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
  front: "front", word: "front", 单词: "front", 词: "front",
  back: "back", meaning: "back", 释义: "back", 意思: "back", 含义: "back",
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
    let front = "";
    let back = "";
    let deckName = defaultDeck;
    let tags: string[] = [];
    let isKey = false;
    if (header) {
      front = (colMap[0] === "front" ? r[0] : "") ?? "";
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
      if (front || back) warnings.push(`CSV 行缺少字段: "${front || back}".slice(0, 60)`);
      continue;
    }
    const key = deckName + "\u0000" + front;
    if (seen.has(key)) { duplicates.push(`[${deckName}] ${front}`); continue; }
    seen.add(key);
    cards.push({ front, back, markdown: "", deckName, tags, highlights: [], isKey });
  }
  return { bookTitle: "", cards, warnings, duplicates };
}

/** 解析 JSON：数组 [{front|word, back|meaning, deck?, tags?}] */
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
  const arr = Array.isArray(data) ? data : (data as { cards?: unknown[] })?.cards;
  if (!Array.isArray(arr)) {
    return { bookTitle: "", cards, warnings: ["JSON 格式应为数组或含 cards 数组的对象"], duplicates };
  }
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const front = String(obj.front ?? obj.word ?? "").trim();
    const back = String(obj.back ?? obj.meaning ?? "").trim();
    const deckName = String(obj.deck ?? "JSON 导入").trim() || "JSON 导入";
    const rawTags = obj.tags;
    const tags = Array.isArray(rawTags)
      ? rawTags.map(String)
      : typeof rawTags === "string"
        ? rawTags.split(/[;；|]/).map((t) => t.trim()).filter(Boolean)
        : [];
    if (!front || !back) {
      if (front || back) warnings.push(`JSON 条目缺少字段: "${front || back}".slice(0, 60)`);
      continue;
    }
    const key = deckName + "\u0000" + front;
    if (seen.has(key)) { duplicates.push(`[${deckName}] ${front}`); continue; }
    seen.add(key);
    cards.push({ front, back, markdown: "", deckName, tags, highlights: [], isKey: false });
  }
  return { bookTitle: "", cards, warnings, duplicates };
}

/** 按文件扩展名自动选择解析器 */
export function parseImportFile(fileName: string, content: string): ImportFileResult {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") {
    return { fileName, format: "csv", ...parseCSV(content) };
  }
  if (ext === "json") {
    return { fileName, format: "json", ...parseJSON(content) };
  }
  return { fileName, format: "markdown", ...parseMarkdown(content) };
}
