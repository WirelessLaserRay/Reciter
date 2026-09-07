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

/**
 * 根据中文释义拼写英文单词的匹配比对
 * - 大小写不敏感、自动去除首尾空白与尾部多余标点
 * - 支持带 "/" 的多变体单词（如 programme/program、analyse/analyze），只要匹配其中任意一侧即判定正确
 * - 支持微小拼写错误（编辑距离 <= 1 且长度 >= 4，或相似度 >= 0.82）作为基本匹配
 */
export function matchWordSpelling(userInput: string, targetWord: string): WordSpellingResult {
  const normUser = userInput.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]+$/, "");
  const normTarget = targetWord.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]+$/, "");

  if (!normUser) {
    return {
      match: false,
      exact: false,
      similarity: 0,
      userWord: userInput.trim(),
      targetWord: targetWord.trim(),
    };
  }

  // 1. 如果整体完全相等（含用户可能完整输入了带有斜杠的形式）
  if (normUser === normTarget) {
    return {
      match: true,
      exact: true,
      similarity: 1,
      userWord: userInput.trim(),
      targetWord: targetWord.trim(),
    };
  }

  // 2. 收集目标词的所有候选变体（带 "/" 时拆分为多变体，如 "programme/program" -> ["programme", "program"]）
  const targetCandidates: string[] = [];
  if (targetWord.includes("/")) {
    for (const part of targetWord.split("/")) {
      const p = part.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]+$/, "");
      if (p && !targetCandidates.includes(p)) {
        targetCandidates.push(p);
      }
      // 去除可能存在的括号注释（例如 "programme (英)" -> "programme"）
      const stripped = p.replace(/\s*[(（][^()（）]*[)）]/g, "").trim();
      if (stripped && !targetCandidates.includes(stripped)) {
        targetCandidates.push(stripped);
      }
    }
  }
  if (!targetCandidates.includes(normTarget)) {
    targetCandidates.push(normTarget);
  }

  // 3. 用户输入也同样支持拆分变体
  const userCandidates: string[] = [];
  if (userInput.includes("/")) {
    for (const part of userInput.split("/")) {
      const p = part.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]+$/, "");
      if (p && !userCandidates.includes(p)) {
        userCandidates.push(p);
      }
    }
  }
  if (!userCandidates.includes(normUser)) {
    userCandidates.push(normUser);
  }

  // 4. 优先检查是否存在任意一侧的完全精确匹配
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

  // 5. 模糊比对：在所有用户候选与目标候选组合中计算最优编辑距离与相似度
  let bestSim = 0;
  let bestMatch = false;

  for (const u of userCandidates) {
    for (const t of targetCandidates) {
      const dist = levenshtein(u, t);
      const maxLen = Math.max(u.length, t.length, 1);
      const similarity = Math.max(0, 1 - dist / maxLen);
      const isMatch = (dist <= 1 && maxLen >= 4) || similarity >= 0.82;

      if (similarity > bestSim) {
        bestSim = similarity;
      }
      if (isMatch) {
        bestMatch = true;
      }
    }
  }

  return {
    match: bestMatch,
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
  if (word.includes("/")) {
    return word
      .split("/")
      .map((part) => getWordMaskHint(part.trim(), showMore))
      .join(" / ");
  }

  const parts = word.trim().split(/\s+/);
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

