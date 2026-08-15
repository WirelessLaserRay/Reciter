/**
 * 主动回忆模式：用户输入释义与标准释义的模糊比对工具。
 * 策略：规范化 → 按分隔符拆分释义片段 → 包含检查 + 编辑距离相似度。
 */

/** 去掉标点/空格/词性标签，统一小写，便于比较 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(?:n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\./g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
}

/** 将释义拆成多个独立含义片段（如 "vt. 放弃; 抛弃" → ["放弃", "抛弃"]） */
function splitMeanings(back: string): string[] {
  return back
    .split(/[;；,，。.]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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
