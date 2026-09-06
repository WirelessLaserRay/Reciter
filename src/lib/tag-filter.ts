/**
 * 标签模糊与正则匹配工具
 * 支持：
 * 1. 精确匹配（不区分大小写）
 * 2. 正则表达式（支持 ^, $, |, [], (), \d, .* 等，以及 /pattern/i 字面量语法）
 * 3. Glob 通配符（支持 * 与 ?，如 *四级*, CET*, 初中?）
 * 4. 模糊子串匹配（如“简单”匹配“超简单”、“简单词”）
 */

/**
 * 判断单个标签是否匹配给定的规则模式
 */
export function matchTagPattern(tag: string, pattern: string): boolean {
  const t = (tag || "").trim();
  let p = (pattern || "").trim();
  if (!t || !p) return false;

  // 1. 完全一致（忽略大小写）
  if (t.toLowerCase() === p.toLowerCase()) return true;

  // 支持形如 /pattern/i 的标准正则字面量格式
  let flags = "i";
  const slashMatch = p.match(/^\/(.+)\/([gimsuy]*)$/);
  if (slashMatch) {
    p = slashMatch[1];
    flags = slashMatch[2] || "i";
  }

  // 2. 检测是否为 glob 通配符模式（含 * 或 ?，且未显式使用高级正则语法）
  const hasWildcard = /[*?]/.test(p);
  const hasRegexMeta = /(\.\*|\.\+|\\[dDsSwWbB]|\(\?|\[\^)/.test(p);

  if (hasWildcard && !hasRegexMeta) {
    try {
      // 将通配符 * 转换为 .*，? 转换为 .，转义其它特殊正则符号
      const globRegex = p
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      const re = new RegExp(`^${globRegex}$`, "i");
      return re.test(t);
    } catch {
      // glob 解析失败则继续后续判断
    }
  }

  // 3. 尝试作为正则表达式测试
  if (!hasWildcard || hasRegexMeta) {
    try {
      const re = new RegExp(p, flags);
      // 避免空匹配正则导致无差别命中所有字符串
      if (!re.test("") || p === "^$" || p === "^.*$") {
        if (re.test(t)) return true;
      }
    } catch {
      // 正则语法无效时降级
    }
  }

  // 4. 模糊子串包含（不区分大小写，去除 glob 星号等干扰符号）
  const cleanP = p.replace(/[*?^$]/g, "").toLowerCase();
  if (cleanP && t.toLowerCase().includes(cleanP)) {
    return true;
  }

  return false;
}

/**
 * 判断卡片的 tags JSON 字符串是否命中任一忽略规则
 */
export function isTagIgnored(
  tagsJson: string | null | undefined,
  patterns: string[]
): boolean {
  if (!tagsJson || !patterns || patterns.length === 0) return false;
  let tags: string[] = [];
  try {
    const parsed = typeof tagsJson === "string" ? JSON.parse(tagsJson) : tagsJson;
    if (Array.isArray(parsed)) {
      tags = parsed.map(String);
    } else if (typeof parsed === "string") {
      tags = [parsed];
    }
  } catch {
    tags = [];
  }
  if (tags.length === 0) return false;

  return patterns.some((pattern) => {
    const trimmed = pattern.trim();
    if (!trimmed) return false;
    return tags.some((tag) => matchTagPattern(tag, trimmed));
  });
}

/**
 * 将模糊/正则规则解析为当前数据库中实际存在的具体标签列表
 * 供 SQLite WHERE c.tags NOT LIKE ? 精确快速过滤
 */
export function getMatchingTags(allTags: string[], patterns: string[]): string[] {
  if (!patterns || patterns.length === 0) return [];
  const validPatterns = patterns.map((p) => p.trim()).filter(Boolean);
  if (validPatterns.length === 0) return [];

  const matched = new Set<string>();

  // 1. 从当前已有标签池中找出所有匹配该规则的实际标签
  for (const tag of allTags) {
    if (validPatterns.some((pattern) => matchTagPattern(tag, pattern))) {
      matched.add(tag);
    }
  }

  // 2. 将字面量纯文本规则（不包含正则元字符）也加入精确排除名单，作为静态保底
  for (const p of validPatterns) {
    if (!/[*?+^$()|[\]\\{}]/.test(p)) {
      matched.add(p);
    }
  }

  return Array.from(matched);
}
