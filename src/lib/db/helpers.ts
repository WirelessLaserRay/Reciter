/** 当前时间 ISO-8601 UTC（所有时间写入统一格式） */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 标签过滤 SQL 片段（tags 为 JSON 数组字符串，精确匹配引号包裹的标签） */
export function tagWhere(tag?: string): string {
  return tag ? " AND c.tags LIKE ?" : "";
}

export function tagParam(tag?: string): string[] {
  return tag ? ['%"' + tag + '"%'] : [];
}

/** 忽略标签 SQL 片段：排除带这些标签的卡片 */
export function ignoredTagsWhere(tags: string[]): string {
  return tags.map(() => " AND c.tags NOT LIKE ?").join("");
}

export function ignoredTagsParams(tags: string[]): string[] {
  return tags.map((t) => '%"' + t + '"%');
}
