import type { SQLBackend } from "@/lib/sql/backend";
import { getMatchingTags } from "@/lib/tag-filter";

export class BaseDB {
  protected backend: SQLBackend | null = null;
  protected tagsCache: { tags: string[]; time: number } | null = null;
  protected tagsCacheByDecks: Map<string, { tags: string[]; time: number }> = new Map();

  /** 标签缓存失效 */
  invalidateTagsCache(): void {
    this.tagsCache = null;
    this.tagsCacheByDecks.clear();
  }

  /** 获取全部词库（或指定词库）中的所有非例句标签（去重） */
  async getAllTags(deckIds?: number[]): Promise<string[]> {
    if (deckIds && deckIds.length > 0) {
      const placeholders = deckIds.map(() => "?").join(",");
      const rows = await this.requireDb().select<{ tag: string }[]>(
        `SELECT DISTINCT j.value AS tag FROM cards c, json_each(c.tags) j
         WHERE c.deck_id IN (${placeholders}) AND j.value NOT LIKE 'ex:%' AND j.value NOT LIKE '例句:%' AND j.value NOT LIKE '例句：%' ORDER BY tag`,
        deckIds
      );
      return rows.map((r) => r.tag).filter(Boolean);
    }
    const rows = await this.requireDb().select<{ tag: string }[]>(
      `SELECT DISTINCT j.value AS tag FROM cards c, json_each(c.tags) j
       WHERE j.value NOT LIKE 'ex:%' AND j.value NOT LIKE '例句:%' AND j.value NOT LIKE '例句：%' ORDER BY tag`
    );
    return rows.map((r) => r.tag).filter(Boolean);
  }

  /**
   * 将忽略标签规则列表（支持精确、通配符 glob、正则表达式、模糊子串）解析为当前数据库中实际存在的具体标签列表
   * 确保 SQLite 中的 c.tags NOT LIKE ? 能够 100% 准确过滤，避免在 SQL 层因正则不被原生支持而漏算
   */
  async resolveMatchingTags(patterns: string[], deckIds?: number[]): Promise<string[]> {
    if (!patterns || patterns.length === 0) return [];
    const valid = patterns.map((p) => p.trim()).filter(Boolean);
    if (valid.length === 0) return [];

    const now = Date.now();
    const cacheKey = deckIds && deckIds.length > 0 ? [...deckIds].sort().join(",") : "all";
    let allTags: string[] | undefined;

    if (cacheKey === "all") {
      if (this.tagsCache && now - this.tagsCache.time < 3000) {
        allTags = this.tagsCache.tags;
      }
    } else {
      const cached = this.tagsCacheByDecks.get(cacheKey);
      if (cached && now - cached.time < 3000) {
        allTags = cached.tags;
      }
    }

    if (!allTags) {
      allTags = await this.getAllTags(deckIds && deckIds.length > 0 ? deckIds : undefined);
      if (cacheKey === "all") {
        this.tagsCache = { tags: allTags, time: now };
      } else {
        this.tagsCacheByDecks.set(cacheKey, { tags: allTags, time: now });
      }
    }

    return getMatchingTags(allTags, valid);
  }

  /** 在单个事务中执行回调（后端实现 BEGIN/COMMIT/ROLLBACK） */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.requireDb().transaction(fn);
  }

  protected requireDb(): SQLBackend {
    if (!this.backend) throw new Error("数据库未初始化，请先调用 db.init()");
    return this.backend;
  }
}
