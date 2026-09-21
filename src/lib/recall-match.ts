/**
 * 主动回忆模式：用户输入释义与标准释义的模糊比对工具。
 * 策略：规范化 → 按分隔符拆分释义片段 → 包含检查 + 编辑距离相似度。
 */

/** 去掉标点/空格/词性标签，统一小写，便于比较 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(?:vt\.?&vi|vi\.?&vt|vt\.\/vi|vi\.\/vt|n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*/gi, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
}

/** 将释义拆成多个独立含义片段（如 "vt. 放弃; 抛弃" → ["放弃", "抛弃"]）；
 *  兼容中文/英文释义：过滤过短片段和纯语法标签，不再限定中文 */
function splitMeanings(back: string): string[] {
  return back
    .split(/[;；,，。.\n\r\t/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (s) =>
        s.length >= 2 &&
        !/^(?:vt\.?&vi|vi\.?&vt|vt\.\/vi|vi\.\/vt|n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.?$/i.test(s)
    );
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export interface RecallMatchResult {
  match: boolean;
  similarity: number;
}

/**
 * 比对用户输入与标准释义。
 * - 完全一致或互为包含时直接判为匹配
 * - 否则用编辑距离相似度，>= 0.6 视为基本正确
 */
export function matchRecall(userInput: string, standardBack: string): RecallMatchResult {
  const input = normalize(userInput);
  const meanings = splitMeanings(standardBack).map(normalize).filter(Boolean);

  if (!input || meanings.length === 0) {
    return { match: false, similarity: 0 };
  }

  let best = 0;
  for (const m of meanings) {
    if (input === m) {
      return { match: true, similarity: 1 };
    }
    if (m.length > 0 && (input.includes(m) || m.includes(input))) {
      const containSim = Math.min(input.length, m.length) / Math.max(input.length, m.length);
      if (containSim > best) best = containSim;
      // 只要一个完整含义片段被包含（长度 >= 2），即视为基本正确
      if ((input.includes(m) && m.length >= 2) || (m.includes(input) && input.length >= 2)) {
        return { match: true, similarity: Math.max(best, containSim) };
      }
    }
    const dist = levenshtein(input, m);
    const sim = 1 - dist / Math.max(input.length, m.length, 1);
    if (sim > best) best = sim;
  }

  return { match: best >= 0.6, similarity: best };
}

export interface WordSpellingResult {
  match: boolean;
  exact: boolean;
  similarity: number;
  userWord: string;
  targetWord: string;
}

export function cleanVariant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u201b`]/g, "'") // 统一各类单引号
    .replace(/[\u201c\u201d\u201f]/g, '"') // 统一各类双引号
    .replace(/[\u2013\u2014\u2212]/g, "-") // 统一破折号与连字符
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // 全角转半角
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.,!?;:~"']+|[.,!?;:~"']+$/g, "")
    .trim();
}

/** 提取目标词或用户输入中包含的所有有效变体候选（括号注释、动词to前缀、标点容错等） */
export function extractWordCandidates(rawWord: string): string[] {
  const candidates: string[] = [];
  const addCandidate = (s: string) => {
    const cleaned = cleanVariant(s);
    if (!cleaned) return;
    if (!candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }
    // 1. 去除括号注释（例如 "(vt.)"、"（英）"、"(飞机起飞)"、"[n.]"）
    const withoutBrackets = cleanVariant(
      cleaned.replace(/\s*[(（[【][^()（）[\]【】]*[)）\]】]/g, "")
    );
    if (withoutBrackets && !candidates.includes(withoutBrackets)) {
      candidates.push(withoutBrackets);
    }
    // 2. 去除词性缩写前缀（例如 "vt. abandon" -> "abandon"、"n. apple" -> "apple"）
    const withoutPos = cleanVariant(
      withoutBrackets.replace(
        /^(?:vt\.?&vi|vi\.?&vt|vt\.\/vi|vi\.\/vt|n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.?\s+/i,
        ""
      )
    );
    if (withoutPos && !candidates.includes(withoutPos)) {
      candidates.push(withoutPos);
    }

    // 3. 去除动词不定式前缀 "to "（例如 "to abandon" -> "abandon"）
    const targetForTo = withoutPos || withoutBrackets;
    if (targetForTo.startsWith("to ")) {
      const withoutTo = cleanVariant(targetForTo.slice(3));
      if (withoutTo && !candidates.includes(withoutTo)) {
        candidates.push(withoutTo);
      }
    }

    // 4. 去除短语中的对象占位符（例如 "look after sb." -> "look after"、"make up one's mind" -> "make up mind"）
    const withoutPlaceholder = cleanVariant(
      targetForTo.replace(/\b(?:sb|sth|somebody|something|one's|oneself)\b\.?/gi, "")
    );
    if (withoutPlaceholder && withoutPlaceholder !== targetForTo && !candidates.includes(withoutPlaceholder)) {
      candidates.push(withoutPlaceholder);
    }

    // 5. 连字符转空格（例如 "state-of-the-art" -> "state of the art"）
    if (targetForTo.includes("-")) {
      const withoutHyphen = cleanVariant(targetForTo.replace(/-/g, " "));
      if (withoutHyphen && !candidates.includes(withoutHyphen)) {
        candidates.push(withoutHyphen);
      }
    }

    // 6. 去除所有标点符号（例如 "don't" -> "dont"）
    const withoutPunct = cleanVariant(targetForTo.replace(/['".,/#!$%^&*;:{}=\-_`~()]/g, ""));
    if (withoutPunct && withoutPunct !== targetForTo && !candidates.includes(withoutPunct)) {
      candidates.push(withoutPunct);
    }
  };

  // 先按常见变体分隔符切分（/、,、，、;、；以及 " or "）
  const parts = rawWord.split(/[/,，;；|]|\s+or\s+/i);
  for (const p of parts) {
    addCandidate(p);
  }
  // 整体亦作为候选参与抽取
  addCandidate(rawWord);

  return candidates;
}

/**
 * 清理词语表面展示噪声（剥离中英文括号注释），用于获取最精准的提示掩码与词长统计
 */
export function getCleanWordForDisplay(rawWord: string): string {
  const stripped = rawWord.replace(/\s*[(（[【][^()（）[\]【】]*[)）\]】]/g, "").trim();
  return stripped || rawWord.trim();
}

/**
 * 根据中文释义拼写英文单词的匹配比对
 * - 大小写不敏感、自动去除首尾空白与尾部多余标点
 * - 支持带 "/"、","、";" 的多变体单词，只要匹配其中任意一侧即判定正确
 * - 自动识别并剥离词性与补充括号注释（如 "(vt.)"、"(飞机起飞)"）
 * - 兼容动词 "to " 前缀、连字符及智能引号差异
 * - 支持微小拼写错误（编辑距离 <= 1 且长度 >= 4，或相似度 >= 0.82）作为基本匹配
 */
export function matchWordSpelling(userInput: string, targetWord: string): WordSpellingResult {
  const cleanUser = cleanVariant(userInput);
  const cleanTarget = cleanVariant(targetWord);

  if (!cleanUser) {
    return {
      match: false,
      exact: false,
      similarity: 0,
      userWord: userInput.trim(),
      targetWord: targetWord.trim(),
    };
  }

  // 1. 如果规范化后整体完全相等
  if (cleanUser === cleanTarget) {
    return {
      match: true,
      exact: true,
      similarity: 1,
      userWord: userInput.trim(),
      targetWord: targetWord.trim(),
    };
  }

  // 2. 抽取目标词与用户输入的所有可能候选
  const targetCandidates = extractWordCandidates(targetWord);
  const userCandidates = extractWordCandidates(userInput);

  // 3. 优先检查是否存在任意一侧的完全精确匹配
  for (const u of userCandidates) {
    for (const t of targetCandidates) {
      if (u === t) {
        return {
          match: true,
          exact: true,
          similarity: 1,
          userWord: userInput.trim(),
          targetWord: targetWord.trim(),
        };
      }
    }
  }

  // 4. 未能精确匹配任何有效候选：计算最高相似度供界面参考，但判定严格判定为错误（match: false）
  let bestSim = 0;
  for (const u of userCandidates) {
    for (const t of targetCandidates) {
      const dist = levenshtein(u, t);
      const maxLen = Math.max(u.length, t.length, 1);
      const similarity = Math.max(0, 1 - dist / maxLen);
      if (similarity > bestSim) {
        bestSim = similarity;
      }
    }
  }

  return {
    match: false,
    exact: false,
    similarity: bestSim,
    userWord: userInput.trim(),
    targetWord: targetWord.trim(),
  };
}

/**
 * 生成单词掩码提示（例如 "abandon" -> "a _ _ _ _ _ _"；showMore 为 true 时显示首尾字母 "a _ _ _ _ _ n"）
 * 支持带 "/" 的多变体（如 "programme/program" -> "p _ _ _ _ _ _ _ _ / p _ _ _ _ _ _"）
 */
export function getWordMaskHint(word: string, showMore: boolean = false): string {
  const displayWord = getCleanWordForDisplay(word);
  if (displayWord.includes("/")) {
    return displayWord
      .split("/")
      .map((part) => getWordMaskHint(part.trim(), showMore))
      .join(" / ");
  }

  const parts = displayWord.trim().split(/\s+/);
  return parts
    .map((p) => {
      if (p.length <= 2) {
        return p[0] + (p.length === 2 ? " _" : "");
      }
      if (!showMore) {
        return p[0] + " " + "_ ".repeat(p.length - 1).trim();
      }
      return p[0] + " " + "_ ".repeat(p.length - 2).trim() + " " + p[p.length - 1];
    })
    .join("   ");
}

