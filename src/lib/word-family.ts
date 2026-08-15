/**
 * 简易词族匹配（P3-⑬）：
 * 从词库卡片中找到与当前词共享词干的单词，帮助建立词族网络。
 */

const SUFFIX_RE =
  /(ing|ings|ed|tion|tions|ment|ments|ness|able|ible|ful|less|ous|ious|ive|ly|er|est|al|ity|ies|ied|s)$/i;

/** 提取词干（去常见派生后缀）；词干过短（<3）不参与匹配 */
export function stemOf(front: string): string {
  const stem = front.trim().replace(SUFFIX_RE, "");
  return stem.length >= 3 ? stem.toLowerCase() : "";
}

/** 在同词库卡片中查找共享词干的同族词（排除自身，最多 limit 个，按字母序） */
export function findRelatedWords(front: string, allFronts: string[], limit = 5): string[] {
  const stem = stemOf(front);
  if (!stem) return [];
  const target = front.trim().toLowerCase();
  return allFronts
    .map((f) => f.trim())
    .filter((f) => f && f.toLowerCase() !== target)
    .filter((f) => {
      const otherStem = stemOf(f);
      // 同词干，或互相以词干为前缀（覆盖 abandon/abandoned 这类词干变化）
      return (
        otherStem === stem ||
        f.toLowerCase().startsWith(stem) ||
        target.startsWith(otherStem)
      );
    })
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}
