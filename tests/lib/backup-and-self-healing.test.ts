import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsBackend } from "@/lib/sql/sqljs-backend";
import { db } from "@/lib/db";
import { restoreBackupData, type BackupData } from "@/lib/backup";
import {
  selfHealPrivateSettings,
  getPrivateSettingsMirror,
  clearPrivateSettingsMirror,
} from "@/lib/private-settings-guard";
import { autoPullIfRemoteNewer } from "@/lib/sync";

describe("Settings protection, backup restoration and self-healing tests", () => {
  beforeAll(async () => {
    const backend = new SqlJsBackend(() => initSqlJs());
    await db.init(backend);
  });

  beforeEach(async () => {
    clearPrivateSettingsMirror();
    await db.clearAllData();
    // 清空 settings 表供单测隔离测试
    const all = await db.getAllSettings();
    for (const s of all) {
      await db.restoreSetting(s.key, "");
    }
  });

  it("clearAllData clears business entities but preserves settings table", async () => {
    // 准备数据
    await db.createDeck("测试词库", "描述");
    const decks = await db.getDecks();
    expect(decks.length).toBe(1);

    await db.setSetting("ai_api_key", "sk-test-ai-key-123456");
    await db.setSetting("ai_base_url", "https://api.example.com/v1");
    await db.setSetting("exam_title", "考研英语");

    // 调用 clearAllData
    await db.clearAllData();

    // 验证词库已被清空
    const decksAfter = await db.getDecks();
    expect(decksAfter.length).toBe(0);

    // 验证 settings 表依然完好无损
    const aiKey = await db.getSetting("ai_api_key");
    const aiUrl = await db.getSetting("ai_base_url");
    const examTitle = await db.getSetting("exam_title");
    expect(aiKey).toBe("sk-test-ai-key-123456");
    expect(aiUrl).toBe("https://api.example.com/v1");
    expect(examTitle).toBe("考研英语");
  });

  it("restoreBackupData with preserveSettings: true protects all local settings unconditionally", async () => {
    // 本地已有配置
    await db.setSetting("ai_api_key", "sk-local-secret-key");
    await db.setSetting("ai_model", "deepseek-v3");
    await db.setSetting("sync_endpoint", "https://sync.example.com");
    await db.setSetting("custom_local_preference", "user-val");

    // 模拟来自云端快照的数据（云端快照排除了私有配置，且有新词库）
    const remoteBackup: BackupData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      decks: [{ id: 101, name: "云端词库A", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
      cards: [],
      reviewLogs: [],
      settings: [
        { key: "exam_title", value: "云端备考计划" },
      ],
      dailyStats: [],
    };

    const res = await restoreBackupData(remoteBackup, {
      preserveSettings: true,
      skipSafetyBackup: true,
    });

    expect(res.ok).toBe(true);
    // 词库更新为云端数据
    const decks = await db.getDecks();
    expect(decks.length).toBe(1);
    expect(decks[0].name).toBe("云端词库A");

    // 本地所有私有配置与原有设置均完好保留，决不被覆盖或清空
    expect(await db.getSetting("ai_api_key")).toBe("sk-local-secret-key");
    expect(await db.getSetting("ai_model")).toBe("deepseek-v3");
    expect(await db.getSetting("sync_endpoint")).toBe("https://sync.example.com");
    expect(await db.getSetting("custom_local_preference")).toBe("user-val");
  });

  it("restoreBackupData with preserveSettings: false never overwrites private device settings", async () => {
    // 本地已有私有配置
    await db.setSetting("ai_api_key", "sk-local-private-key");
    await db.setSetting("sync_token", "local-token-xyz");

    // 模拟备份文件中尝试覆盖私有配置
    const backup: BackupData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      decks: [],
      cards: [],
      reviewLogs: [],
      settings: [
        { key: "ai_api_key", value: "sk-malicious-override" },
        { key: "sync_token", value: "remote-token" },
        { key: "exam_title", value: "新备考目标" },
      ],
      dailyStats: [],
    };

    const res = await restoreBackupData(backup, {
      preserveSettings: false,
      skipSafetyBackup: true,
    });

    expect(res.ok).toBe(true);
    // 私有配置绝对被本地原有值保护
    expect(await db.getSetting("ai_api_key")).toBe("sk-local-private-key");
    expect(await db.getSetting("sync_token")).toBe("local-token-xyz");
    // 业务配置正常更新
    expect(await db.getSetting("exam_title")).toBe("新备考目标");
  });

  it("selfHealPrivateSettings restores missing SQLite settings from offline mirror", async () => {
    // 写入私有设置，此时离线镜像自动同步
    await db.setSetting("ai_api_key", "sk-important-key-777");
    await db.setSetting("ai_base_url", "https://api.openai.com/v1");

    const mirror = getPrivateSettingsMirror();
    expect(mirror["ai_api_key"].startsWith("enc:v1:")).toBe(true);

    // 模拟极端情况下 SQLite 中的 key 被意外删除丢失
    await (db as any).requireDb().execute("DELETE FROM settings WHERE key = 'ai_api_key'");
    expect(await db.getSetting("ai_api_key")).toBe(null);

    // 触发自愈
    const result = await selfHealPrivateSettings();
    expect(result.healedCount).toBeGreaterThanOrEqual(1);

    // 验证配置已被自愈写回 SQLite
    expect(await db.getSetting("ai_api_key")).toBe("sk-important-key-777");
  });

  it("autoPullIfRemoteNewer deduplicates concurrent invocations", async () => {
    // 未配置同步时返回 synced: false，但两个并发调用返回同一个 Promise
    const p1 = autoPullIfRemoteNewer();
    const p2 = autoPullIfRemoteNewer();
    expect(p1).toBe(p2);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.synced).toBe(false);
    expect(r2.synced).toBe(false);
  });
});
