/** 词性正则（与 markdown-parser 保持一致） */
const POS_RE =
  /\b(?:vt\.?&vi|vi\.?&vt|vt\.\/vi|vi\.\/vt|n|vt|vi|v|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*/i;

function extractPos(text: string): string {
  const m = POS_RE.exec(text);
  return m ? m[0] : "";
}

/**
 * 判断是否为短语（词组/固定搭配/短语动词等，通常含空格或连字符）
 */
export function isPhrase(word: string): boolean {
  const t = word.trim();
  return /\s+|-/.test(t);
}

/**
 * 从释义文本中剥除词性前缀（短语不匹配词性，或清洗残留词性）
 * 例如："vt. 放弃；vi. 屈服" → "放弃；屈服"
 *       "phr. 在...之前" → "在...之前"
 *       "v. 抛弃" → "抛弃"
 */
export function removePosPrefix(text: string): string {
  if (!text) return "";
  return text
    .replace(
      /(^|[；;，,、\s]+)(?:vt\.?&vi|vi\.?&vt|vt\.\/vi|vi\.\/vt|n|vt|vi|v|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*\s*/gi,
      "$1"
    )
    .replace(/^[；;，,、\s]+/, "")
    .replace(/[；;，,、\s]+$/, "")
    .trim();
}

/**
 * 从释义文本中拆分主要释义（加粗）与次要释义（非加粗）。
 * 如果非加粗部分没有词性，单词会承接最近一个加粗部分的词性；若是短语，则不匹配/不继承词性，并剔除任何词性标签。
 * 例如：
 *  - 单词：**offspring n. 结果；产物**；子孙；后代
 *    → primary: n. 结果；产物
 *    → secondary: n. 子孙；后代
 *  - 短语：**give up 放弃**；交出
 *    → primary: 放弃
 *    → secondary: 交出
 */
export function splitMeaningText(
  text: string,
  wordOrIsPhrase?: string | boolean
): { primary: string; secondary: string } {
  const isPhraseItem =
    typeof wordOrIsPhrase === "boolean"
      ? wordOrIsPhrase
      : typeof wordOrIsPhrase === "string"
        ? isPhrase(wordOrIsPhrase)
        : false;

  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  const bolds: string[] = [];
  const nonBolds: string[] = [];
  let lastPos = "";

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      let content = part.slice(2, -2).trim();
      if (isPhraseItem) {
        content = removePosPrefix(content);
      }
      const pos = extractPos(content);
      if (pos && !isPhraseItem) lastPos = pos;
      if (content) bolds.push(content);
    } else {
      let clean = part
        .replace(/\*/g, "")
        .replace(/^[；;，,、\s]+/, "")
        .replace(/[；;，,、\s]+$/, "")
        .trim();
      if (isPhraseItem) {
        clean = removePosPrefix(clean);
      }
      if (clean) {
        const withPos = !isPhraseItem && lastPos && !extractPos(clean) ? `${lastPos} ${clean}` : clean;
        nonBolds.push(withPos);
      }
    }
  }

  let primary = bolds.join(" ").trim();
  let secondary = nonBolds.join("；");

  if (isPhraseItem) {
    primary = removePosPrefix(primary);
    secondary = removePosPrefix(secondary);
  }

  if (primary) {
    return { primary, secondary };
  }
  return {
    primary: isPhraseItem ? removePosPrefix(text.trim()) : text.trim(),
    secondary: "",
  };
}

/**
 * 统一获取卡片学习与对照标准释义。
 * 核心原则：学习时答案对照优先参考主要/次要释义，不参考未经清洗提炼的原始释义（back 仅在主次释义均为空时兜底）。
 * 短语自动剥除词性前缀。
 */
export function getCardMeaning(card: {
  front?: string;
  meaning_primary?: string | null;
  meaning_secondary?: string | null;
  back?: string | null;
}): string {
  let primary = card.meaning_primary?.trim() || "";
  let secondary = card.meaning_secondary?.trim() || "";

  const phrase = card.front ? isPhrase(card.front) : false;
  if (phrase) {
    if (primary) primary = removePosPrefix(primary);
    if (secondary) secondary = removePosPrefix(secondary);
  }

  if (primary) {
    return secondary ? `${primary}；${secondary}` : primary;
  }
  if (secondary) {
    return secondary;
  }

  let back = card.back?.trim() || "";
  if (phrase && back) {
    back = removePosPrefix(back);
  }
  return back;
}
