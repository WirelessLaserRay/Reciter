/**
 * 简易词族匹配（P3-⑬）：
 * 从词库卡片中找到与当前词共享词干的单词，帮助建立词族网络。
 *
 * 规则：
 * 1. 循环剥离常见派生/屈折后缀得到词干（保留长度 >= 3）
 * 2. 只有「词干完全相等」才算同族词
 *    —— 不再使用前缀包含兜底，避免 journey ↔ journal 这类误判
 */

const SUFFIXES = [
  "ation", "ition", "tion", "sion", "ment", "ness", "ity",
  "able", "ible", "ful", "less", "ous", "ious", "ive",
  "ing", "ed", "er", "est", "ly", "es", "s",
  "al", "ic", "or", "ist", "ism", "ship", "hood",
];

/** 提取词干（循环剥离派生后缀）；词干过短（<3）不参与匹配 */
export function stemOf(front: string): string {
  let stem = front.trim().toLowerCase();
  if (stem.length < 3) return "";

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SUFFIXES) {
      if (
        stem.length > suffix.length &&
        stem.endsWith(suffix) &&
        stem.length - suffix.length >= 3
      ) {
        stem = stem.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return stem.length >= 3 ? stem : "";
}

/** 在同词库卡片中查找共享词干的同族词（排除自身，最多 limit 个，按字母序） */
export function findRelatedWords(front: string, allFronts: string[], limit = 5): string[] {
  const stem = stemOf(front);
  if (!stem) return [];
  const target = front.trim().toLowerCase();
  return allFronts
    .map((f) => f.trim())
    .filter((f) => f && f.toLowerCase() !== target && stemOf(f) === stem)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}
