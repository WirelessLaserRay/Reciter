/**
 * 形近词（orthographic neighbor）选择器
 * 用于选择题干扰项：优先挑选与目标单词拼写相似的词，提高干扰项迷惑性。
 *
 * 实现依据（拼写检查/混淆词研究的标准做法）：
 * - Levenshtein 编辑距离作为核心相似度（删除/插入/替换）
 * - 辅以前缀重叠、后缀重叠、长度差加权，贴近母语者对形近词的直觉
 */

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLen(a: string, b: string): number {
  let i = 0;
  while (
    i < a.length &&
    i < b.length &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) i++;
  return i;
}

export interface SimilarWord {
  word: string;
  /** 编辑距离（越小越像） */
  distance: number;
  /** 0-1 相似度（越大越像） */
  score: number;
}

/**
 * 计算形近分数：
 * score = 1 - distance/maxLen（编辑距离）
 *       + 0.2 * prefix/maxLen（前缀重叠）
 *       + 0.15 * suffix/maxLen（后缀重叠）
 *       - 0.1 * |lenA-lenB|/maxLen（长度差轻微惩罚）
 * 截断到 [0,1]。
 */
export function orthographicScore(target: string, candidate: string): number {
  const a = target.trim().toLowerCase();
  const b = candidate.trim().toLowerCase();
  if (!a || !b || a === b) return a === b ? 1 : 0;
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  const base = Math.max(0, 1 - distance / maxLen);
  const prefix = commonPrefixLen(a, b) / maxLen;
  const suffix = commonSuffixLen(a, b) / maxLen;
  const lengthPenalty = Math.abs(a.length - b.length) / maxLen;
  return Math.min(1, Math.max(0, base + 0.2 * prefix + 0.15 * suffix - 0.1 * lengthPenalty));
}

/** 单次候选打分（内部用） */
function scoreCandidate(target: string, candidate: string): SimilarWord {
  const a = target.trim().toLowerCase();
  const b = candidate.trim().toLowerCase();
  return {
    word: candidate.trim(),
    distance: levenshtein(a, b),
    score: orthographicScore(a, b),
  };
}

/**
 * 从候选词中挑选最像的 N 个形近词。
 * - 优先编辑距离小、前后缀重叠多、长度接近的词
 * - 候选不足时返回全部（仍按相似度排序）
 */
export function pickSimilarWords(
  target: string,
  candidates: string[],
  count = 3
): string[] {
  const t = target.trim().toLowerCase();
  const seen = new Set<string>();
  const scored = candidates
    .map((c) => c.trim())
    .filter((c) => {
      if (!c || c.toLowerCase() === t || seen.has(c.toLowerCase())) return false;
      seen.add(c.toLowerCase());
      return true;
    })
    .map((c) => scoreCandidate(t, c))
    .sort((x, y) => {
      if (x.distance !== y.distance) return x.distance - y.distance;
      const lenDiffX = Math.abs(x.word.length - t.length);
      const lenDiffY = Math.abs(y.word.length - t.length);
      if (lenDiffX !== lenDiffY) return lenDiffX - lenDiffY;
      const px = commonPrefixLen(t, x.word.toLowerCase());
      const py = commonPrefixLen(t, y.word.toLowerCase());
      if (px !== py) return py - px;
      return x.word.localeCompare(y.word);
    })
    .slice(0, count);
  return scored.map((s) => s.word);
}
