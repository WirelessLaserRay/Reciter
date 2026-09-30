import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsBackend } from "@/lib/sql/sqljs-backend";
import { ReciterDB } from "@/lib/db";
import { runMigrations, MIGRATIONS } from "@/lib/migrations";

describe("db - 数据库迁移与核心 CRUD / 学习队列集成测试", () => {
  let backend: SqlJsBackend;
  let testDb: ReciterDB;

  beforeAll(async () => {
    backend = new SqlJsBackend(() => initSqlJs());
    testDb = new ReciterDB();
    await testDb.init(backend);
  });

  it("全量 001-010 迁移幂等性测试", async () => {
    // 再次执行 runMigrations，验证已经应用的迁移绝不重复执行且不报错
    await expect(runMigrations(backend)).resolves.not.toThrow();

    // 检查迁移元表中的记录数量应等于 MIGRATIONS 的长度
    const applied = await backend.select<{ version: number }[]>(
      "SELECT version FROM _reciter_migrations ORDER BY version ASC"
    );
    expect(applied.length).toBe(MIGRATIONS.length);
  });

  it("词库 (Deck) CRUD 链路", async () => {
    const deckId = await testDb.createDeck(
      "测试四级核心词库",
      "用于单元测试的词库",
      15,
      "英语/大学"
    );
    expect(deckId).toBeGreaterThan(0);

    const decks = await testDb.getDecks();
    const created = decks.find((d) => d.id === deckId);
    expect(created).toBeDefined();
    expect(created?.name).toBe("测试四级核心词库");
    expect(created?.folder).toBe("英语/大学");
    expect(created?.new_cards_per_day).toBe(15);

    // 重命名测试
    await testDb.updateDeck(deckId, { name: "测试四级核心词库_重命名" });
    const updated = await testDb.getDeck(deckId);
    expect(updated?.name).toBe("测试四级核心词库_重命名");
  });

  it("卡片 (Card) 批量导入与卡片状态联动", async () => {
    const deckId = await testDb.createDeck("词汇测试专区");

    const result1 = await testDb.upsertCard({
      deckId: deckId,
      front: "abandon",
      back: "vt. 放弃，抛弃",
      phonetic: "/əˈbændən/",
      tags: ["cet4", "high-frequency"],
      isKey: 1,
      meaningPrimary: "放弃，抛弃",
      meaningSecondary: "",
    });
    expect(result1.created).toBe(true);
    expect(result1.cardId).toBeGreaterThan(0);

    // 验证对应 card_states 是否已自动初始化
    const state = await testDb.getCardState(result1.cardId);
    expect(state).toBeDefined();
    expect(state?.card_id).toBe(result1.cardId);
    expect(state?.state).toBe(0); // State.New
    expect(state?.stability).toBe(0);

    // 更新卡片（传入 existing 集合以进行复用判定）
    const existing = await testDb.getExistingFronts(deckId);
    const result2 = await testDb.upsertCard(
      {
        deckId: deckId,
        front: "abandon",
        back: "vt. 放弃，抛弃；沉溺",
        meaningPrimary: "放弃，抛弃",
        meaningSecondary: "沉溺",
      },
      existing
    );
    expect(result2.created).toBe(false);
    expect(result2.cardId).toBe(result1.cardId);
  });

  it("新卡配额 (getNewCards) 查询与截取", async () => {
    const deckId = await testDb.createDeck("配额测试词库", "", 2);

    // 插入 3 张新卡
    for (let i = 1; i <= 3; i++) {
      await testDb.upsertCard({
        deckId: deckId,
        front: `quota_word_${i}`,
        back: `释义 ${i}`,
      });
    }

    // 查询新卡配额：请求 limit = 2，只获取 2 张新卡
    const newCards = await testDb.getNewCards(deckId, 2);
    expect(newCards.length).toBe(2);
    expect(newCards[0].front).toBe("quota_word_1");
    expect(newCards[1].front).toBe("quota_word_2");
  });

  it("daily_stats 历史教训保障：ON CONFLICT 累加而非覆盖", async () => {
    const today = "2026-09-21";
    // 第一次写入
    await testDb.updateDailyStats(today, {
      new_count: 5,
      review_count: 10,
      again_count: 1,
      total_time_ms: 60000,
    });

    // 第二次增量写入
    await testDb.updateDailyStats(today, {
      new_count: 3,
      review_count: 7,
      again_count: 2,
      total_time_ms: 40000,
    });

    const stats = await testDb.getDailyStatsRange(today, today);
    expect(stats.length).toBe(1);
    expect(stats[0].new_count).toBe(8);
    expect(stats[0].review_count).toBe(17);
    expect(stats[0].again_count).toBe(3);
    expect(stats[0].total_time_ms).toBe(100000);
  });

  it("设置变更监听 (onSettingChange) 与生命周期刷盘 (flush)", async () => {
    const changes: { key: string; value: string }[] = [];
    const unsub = testDb.onSettingChange((key, value) => {
      changes.push({ key, value });
    });

    await testDb.setSetting("easy_days_enabled", "1");
    await testDb.setSetting("daily_review_limit", "300");

    expect(changes).toEqual([
      { key: "easy_days_enabled", value: "1" },
      { key: "daily_review_limit", value: "300" },
    ]);

    unsub();
    await testDb.setSetting("easy_days_enabled", "0");
    expect(changes.length).toBe(2); // 取消订阅后不再触发

    // 验证 flush 不抛错
    await expect(testDb.flush()).resolves.not.toThrow();
  });

  it("自指定时间戳检查未同步复习 (hasReviewsSince) 冲突保护", async () => {
    const beforeTime = new Date("2026-09-01T00:00:00.000Z").toISOString();
    const afterTime = new Date("2099-01-01T00:00:00.000Z").toISOString();

    const deckId = await testDb.createDeck("复习检测测试");
    const { cardId } = await testDb.upsertCard({ deckId, front: "test_sync", back: "测试同步" });

    // 添加一条复习记录
    await testDb.addReviewLog({
      card_id: cardId,
      grade: 3,
      response_time_ms: 1000,
    });

    // 早于复习时间，应当检测到存在未同步复习
    const hasReviews = await testDb.hasReviewsSince(beforeTime);
    expect(hasReviews).toBe(true);

    // 晚于当前时间，应当检测为无未同步复习
    const noReviews = await testDb.hasReviewsSince(afterTime);
    expect(noReviews).toBe(false);
  });
});
