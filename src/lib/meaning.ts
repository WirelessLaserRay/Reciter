export const CHINESE_POS_MAP: Record<string, string> = {
  名: "n.",
  名词: "n.",
  noun: "n.",
  动: "v.",
  动词: "v.",
  verb: "v.",
  及物: "vt.",
  及物动词: "vt.",
  vt: "vt.",
  不及物: "vi.",
  不及物动词: "vi.",
  vi: "vi.",
  形: "adj.",
  形容词: "adj.",
  adjective: "adj.",
  a: "adj.",
  "a.": "adj.",
  副: "adv.",
  副词: "adv.",
  adverb: "adv.",
  ad: "adv.",
  "ad.": "adv.",
  代: "pron.",
  代词: "pron.",
  pronoun: "pron.",
  介: "prep.",
  介词: "prep.",
  preposition: "prep.",
  连: "conj.",
  连词: "conj.",
  conjunction: "conj.",
  数: "num.",
  数词: "num.",
  numeral: "num.",
  冠: "art.",
  冠词: "art.",
  article: "art.",
  感: "int.",
  感叹: "int.",
  感叹词: "int.",
  叹: "int.",
  interjection: "int.",
  int: "int.",
  助: "aux.",
  助动词: "aux.",
  auxiliary: "aux.",
  aux: "aux.",
  缩: "abbr.",
  缩写: "abbr.",
  abbreviation: "abbr.",
  abbr: "abbr.",
  短语: "phr.",
  词组: "phr.",
  phrase: "phr.",
  phr: "phr.",
};

/** 规范化词性标识符（统一为小写带点标准格式，如 n., vt., vi., adj., adv.） */
export function normalizePosTag(raw?: string): string {
  if (!raw) return "";
  let t = raw.trim().replace(/^[（([【\s]+|[）)\]】\s]+$/g, "").trim().toLowerCase();
  if (CHINESE_POS_MAP[t]) return CHINESE_POS_MAP[t];
  if (t === "a" || t === "a.") return "adj.";
  if (t === "ad" || t === "ad.") return "adv.";
  if (/^[a-z]+$/i.test(t)) {
    if (
      ["n", "v", "vt", "vi", "adj", "adv", "prep", "pron", "conj", "num", "art", "int", "aux", "abbr", "phr"].includes(
        t
      )
    ) {
      return `${t}.`;
    }
  }
  // 复合词性如 v./n. 或 vt.&vi.
  t = t
    .replace(/\s+/g, "")
    .replace(/\b(a)\b/gi, "adj.")
    .replace(/\b(ad)\b/gi, "adv.");
  if (!t.endsWith(".") && !t.includes("/")) t += ".";
  return t;
}

/** 词性正则（与 markdown-parser 保持一致） */
export const POS_RE =
  /\b(?:vt\.?&vi|vi\.?&vt|vt\.\/vi|vi\.\/vt|n|vt|vi|v|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*/i;

const SUFFIX_POS_RE =
  /[([（【]\s*([a-zA-Z]+(?:\.[a-zA-Z]+)*\.?|名|名词|动|动词|及物|不及物|形|形容词|副|副词|代|代词|介|介词|连|连词|数|数词|冠|冠词|感|叹|感叹词|noun|verb|adjective|adverb)\s*[)\]）】]\s*$/i;

const BRACKET_PREFIX_RE =
  /^\s*[([（【]\s*([a-zA-Z]+(?:\.[a-zA-Z]+)*\.?|名|名词|动|动词|及物|不及物|形|形容词|副|副词|代|代词|介|介词|连|连词|数|数词|冠|冠词|感|叹|感叹词|noun|verb|adjective|adverb)\s*[)\]）】]\s*/i;

const POS_PREFIX_RE =
  /^\s*((?:(?:interj|abbr|adj|adv|art|aux|phr|prep|pron|conj|num|int|vt|vi|ad|noun|verb|adjective|adverb)\b\.?|[avn]\.)(?:\s*[/&+,、]\s*(?:(?:interj|abbr|adj|adv|art|aux|phr|prep|pron|conj|num|int|vt|vi|ad|noun|verb|adjective|adverb)\b\.?|[avn]\.))*)\s*/i;

const INLINE_POS_SPLIT_RE =
  /(?:^|[；;,，\s]|(?<=[\u4e00-\u9fff]))((?:(?:interj|abbr|adj|adv|art|aux|phr|prep|pron|conj|num|int|vt|vi|ad)\b\.?|[avn]\.)(?:\s*[/&+,、]\s*(?:(?:interj|abbr|adj|adv|art|aux|phr|prep|pron|conj|num|int|vt|vi|ad)\b\.?|[avn]\.))*)\s*/gi;

export function extractPos(text: string): string {
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
 * 解析单条释义文本中的词性与纯释义
 */
function parseSingleDefItem(rawText: string): { pos: string; meaning: string } {
  const text = String(rawText || "").trim();
  if (!text) return { pos: "", meaning: "" };

  // 1. 后置括号词性，如 "远程的 (adj.)"、"遥控器 (noun)"、"取消 (vt.)"
  const suffixM = text.match(SUFFIX_POS_RE);
  if (suffixM) {
    const pos = normalizePosTag(suffixM[1]);
    const meaning = text
      .slice(0, suffixM.index)
      .trim()
      .replace(/^[；;,，\s]+|[；;,，\s]+$/g, "");
    return { pos, meaning };
  }

  // 2. 前置中括号词性，如 "[n.] 苹果"、"[名] 苹果"、"【动】奔跑"
  const bracketM = text.match(BRACKET_PREFIX_RE);
  if (bracketM) {
    const pos = normalizePosTag(bracketM[1]);
    const meaning = text
      .slice(bracketM[0].length)
      .trim()
      .replace(/^[；;,，\s]+|[；;,，\s]+$/g, "");
    return { pos, meaning };
  }

  // 3. 标准前置词性，如 "n. 苹果"、"adj. 重要的"、"v./n. 放纵"
  const prefixM = text.match(POS_PREFIX_RE);
  if (prefixM) {
    const pos = normalizePosTag(prefixM[1]);
    const meaning = text
      .slice(prefixM[0].length)
      .trim()
      .replace(/^[；;,，\s]+|[；;,，\s]+$/g, "");
    return { pos, meaning };
  }

  return { pos: "", meaning: text };
}

/**
 * 结构化提取与规范化释义与词性
 */
export function extractAndNormalizeMeaning(
  front: string,
  rawInput: unknown,
  explicitPos?: string
): {
  pos: string;
  back: string;
  meaningPrimary: string;
  meaningSecondary: string;
} {
  const isPhraseWord = isPhrase(front);
  const normExplicit = normalizePosTag(explicitPos);

  if (isPhraseWord) {
    let rawStr = Array.isArray(rawInput)
      ? rawInput.map(String).join("；")
      : String(rawInput ?? "").trim();
    rawStr = removePosPrefix(rawStr);
    const meaning = splitMeaningText(rawStr, front);
    return {
      pos: "",
      back: rawStr,
      meaningPrimary: meaning.primary,
      meaningSecondary: meaning.secondary,
    };
  }

  // 若传入的是数组形式，逐项解析规整
  if (Array.isArray(rawInput)) {
    const parsedItems = rawInput
      .map((item) => parseSingleDefItem(String(item)))
      .filter((p) => p.meaning || p.pos);

    if (parsedItems.length === 0) {
      return { pos: normExplicit, back: "", meaningPrimary: "", meaningSecondary: "" };
    }

    const poses: string[] = [];
    const formattedParts: string[] = [];
    for (const p of parsedItems) {
      const pPos = p.pos || normExplicit;
      if (pPos && !poses.includes(pPos)) poses.push(pPos);
      if (pPos && p.meaning) {
        formattedParts.push(`${pPos} ${p.meaning}`);
      } else if (p.meaning) {
        formattedParts.push(p.meaning);
      }
    }
    const finalBack = formattedParts.join("；");
    const mainPos = poses[0] || normExplicit || "";
    const meaning = splitMeaningText(finalBack, front);
    return {
      pos: mainPos,
      back: finalBack,
      meaningPrimary: meaning.primary,
      meaningSecondary: meaning.secondary,
    };
  }

  const rawStr = String(rawInput ?? "").trim();
  if (!rawStr) {
    return { pos: normExplicit, back: "", meaningPrimary: "", meaningSecondary: "" };
  }

  // 探测行内复合词性（如 "n. 行为，行动；法令,vt. 扮演,vi. 行动" 或 "n. 工作vt. 使工作"）
  const matches: { pos: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  INLINE_POS_SPLIT_RE.lastIndex = 0;
  while ((m = INLINE_POS_SPLIT_RE.exec(rawStr)) !== null) {
    const posStr = m[1];
    const tagIdx = m.index + m[0].indexOf(posStr);
    matches.push({ pos: posStr, start: tagIdx, end: tagIdx + posStr.length });
  }

  if (matches.length > 1) {
    const poses: string[] = [];
    const formattedParts: string[] = [];
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const start = cur.end;
      const end = i + 1 < matches.length ? matches[i + 1].start : rawStr.length;
      const cleanMeaning = rawStr
        .slice(start, end)
        .trim()
        .replace(/^[；;,，\s]+|[；;,，\s]+$/g, "");
      const tag = normalizePosTag(cur.pos);
      if (tag && !poses.includes(tag)) poses.push(tag);
      if (cleanMeaning) {
        formattedParts.push(`${tag} ${cleanMeaning}`);
      }
    }
    const finalBack = formattedParts.join("；");
    const mainPos = poses[0] || "";
    const meaning = splitMeaningText(finalBack, front);
    return {
      pos: mainPos,
      back: finalBack,
      meaningPrimary: meaning.primary,
      meaningSecondary: meaning.secondary,
    };
  }

  // 单条释义解析
  const single = parseSingleDefItem(rawStr);
  const pos = single.pos || normExplicit;
  const back =
    pos && single.meaning && !single.meaning.startsWith(pos)
      ? `${pos} ${single.meaning}`
      : single.meaning || rawStr;
  const meaning = splitMeaningText(back, front);
  return {
    pos,
    back,
    meaningPrimary: meaning.primary,
    meaningSecondary: meaning.secondary,
  };
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
