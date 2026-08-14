import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Root, Heading, ListItem, Blockquote } from "mdast";

/** 解析出的待导入卡片 */
export interface ParsedCard {
  front: string;
  back: string;
  markdown: string; // 原始 Markdown 片段
  deckName: string;
  tags: string[];
  highlights: string[]; // ==xx== 挖空素材
}

export interface ParseResult {
  bookTitle: string;
  cards: ParsedCard[];
  warnings: string[];
  /** 文件内部 front 重复（同一词库内） */
  duplicates: string[];
}

/** 词性标签（模板格式：word n. 释义 / phrase vt./vi. 释义） */
const POS_RE =
  /\b(?:n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*/;

const CJK_RE = /[\u4e00-\u9fff]/;

/** 去掉行内 markdown 标记，返回纯文本 */
function stripInline(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\`/g, "")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/**
 * 将列表项文本切分为 front / back
 * 支持多种格式（按优先级）：
 *  1. PLAN 格式：word: meaning / word：meaning / word — meaning / word – meaning
 *  2. 模板格式（词性切分）：word n. 释义 / word vt./vi. 释义
 *  3. 首个汉字切分：word phrase 中文释义
 *  4. 首个空白切分（兜底）
 */
export function splitCardText(raw: string): { front: string; back: string } {
  const text = stripInline(raw);
  if (!text) return { front: "", back: "" };

  // 1. 冒号分隔（中英文冒号）
  const colonIdx = text.search(/[:：]/);
  if (colonIdx > 0 && colonIdx < text.length - 1) {
    return { front: text.slice(0, colonIdx).trim(), back: text.slice(colonIdx + 1).trim() };
  }

  // 2. 破折号分隔（— – ——）
  const dashIdx = text.search(/[—–]/);
  if (dashIdx > 0 && dashIdx < text.length - 1) {
    return { front: text.slice(0, dashIdx).trim(), back: text.slice(dashIdx + 1).trim() };
  }

  // 3. 词性标签切分（模板样式）
  const posMatch = POS_RE.exec(text);
  if (posMatch && posMatch.index > 0) {
    return { front: text.slice(0, posMatch.index).trim(), back: text.slice(posMatch.index).trim() };
  }

  // 4. 首个汉字（词组格式：in one's phrase 释义）
  const cjkIdx = text.search(CJK_RE);
  if (cjkIdx > 0) {
    return { front: text.slice(0, cjkIdx).trim(), back: text.slice(cjkIdx).trim() };
  }

  // 5. 首个空白（兜底）
  const wsIdx = text.search(/\s/);
  if (wsIdx > 0) {
    return { front: text.slice(0, wsIdx).trim(), back: text.slice(wsIdx).trim() };
  }

  return { front: text, back: "" };
}

/** 递归提取节点全部文本 */
function extractText(node: unknown): string {
  const n = node as { type?: string; value?: string; children?: unknown[] };
  if (n.type === "text") return n.value ?? "";
  if (n.type === "code") return n.value ?? "";
  if (Array.isArray(n.children)) return n.children.map(extractText).join("");
  return "";
}

/** 提取 heading 文本 */
function headingText(node: Heading): string {
  return extractText(node).trim();
}

/** 提取列表项文本（含多段续行，如模板中的换行对齐补充） */
function listItemText(node: ListItem): string {
  const parts: string[] = [];
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const t = extractText(child).trim();
      if (t) parts.push(t);
    }
  }
  return parts.join(" ");
}

/**
 * 解析 Markdown 词库文件
 * 规则（对齐 PLAN.md + templates 样式）：
 *  - # 标题        → 书名（bookTitle，无 ## 时作为词库名兜底）
 *  - ## 标题       → 词库（Deck）
 *  - ### 标题      → 分组，作为卡片 tag
 *  - - word: meaning → 卡片（PLAN 格式）
 *  - - **word n. 释义** / - plain n. 释义 → 卡片（模板格式）
 *  - > 引用块      → 追加为上一卡片例句
 *  - ==高亮==      → 正则提取为挖空素材（两阶段：AST 解析结构 + 正则后处理）
 */
export function parseMarkdown(content: string): ParseResult {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content) as Root;

  let bookTitle = "";
  let currentDeck = "";
  let currentSection = "";
  const cards: ParsedCard[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, string>(); // deck + front -> raw
  const duplicates: string[] = [];

  const addCard = (raw: string) => {
    const { front, back } = splitCardText(raw);
    if (!front || !back) {
      warnings.push(`无法解析列表项: "${raw.slice(0, 60)}"`);
      return;
    }
    const highlights = [...raw.matchAll(/==([^=]+)==/g)].map((m) => m[1]);
    const deckName = currentDeck || bookTitle || "默认词库";
    const key = deckName + "\u0000" + front;
    if (seen.has(key)) {
      duplicates.push(`[${deckName}] ${front}`);
      return; // 文件内重复，保留首条
    }
    seen.set(key, raw);
    cards.push({
      front,
      back,
      markdown: raw.trim(),
      deckName,
      tags: currentSection ? [currentSection] : [],
      highlights,
    });
  };

  visit(tree, (node) => {
    switch (node.type) {
      case "heading": {
        const h = node as Heading;
        const text = headingText(h);
        if (h.depth === 1 && !bookTitle) bookTitle = text;
        else if (h.depth === 2) { currentDeck = text; currentSection = ""; }
        else if (h.depth === 3) currentSection = text;
        break;
      }
      case "listItem": {
        const raw = listItemText(node as ListItem);
        if (raw) addCard(raw);
        break;
      }
      case "blockquote": {
        // 引用块 → 上一卡片例句（文档开头说明类引用在无卡片时自然跳过）
        if (cards.length > 0) {
          const quote = extractText(node as Blockquote).trim();
          if (quote) {
            const last = cards[cards.length - 1];
            last.back = last.back + "\n例句: " + quote;
            last.markdown = last.markdown + "\n> " + quote;
          }
        }
        break;
      }
      default:
        break;
    }
  });

  return { bookTitle, cards, warnings, duplicates };
}
