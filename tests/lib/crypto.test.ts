import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsBackend } from "@/lib/sql/sqljs-backend";
import { db } from "@/lib/db";
import {
  isSensitiveSettingKey,
  isEncryptedValue,
  encryptSensitiveValue,
  decryptSensitiveValue,
  ENCRYPTED_PREFIX,
} from "@/lib/crypto";

describe("Local sensitive credentials AES-256-GCM encryption tests", () => {
  beforeAll(async () => {
    const backend = new SqlJsBackend(() => initSqlJs());
    await db.init(backend);
  });

  beforeEach(async () => {
    await db.clearAllData();
    const all = await db.getAllSettings();
    for (const s of all) {
      await db.restoreSetting(s.key, "");
    }
  });

  it("isSensitiveSettingKey accurately classifies sensitive keys", () => {
    expect(isSensitiveSettingKey("ai_api_key")).toBe(true);
    expect(isSensitiveSettingKey("deepl_api_key")).toBe(true);
    expect(isSensitiveSettingKey("sync_token")).toBe(true);
    expect(isSensitiveSettingKey("custom_provider_api_key")).toBe(true);

    expect(isSensitiveSettingKey("ai_base_url")).toBe(false);
    expect(isSensitiveSettingKey("ai_model")).toBe(false);
    expect(isSensitiveSettingKey("exam_title")).toBe(false);
    expect(isSensitiveSettingKey("day_start")).toBe(false);
  });

  it("encrypts and decrypts sensitive values with AES-256-GCM correctly", async () => {
    const plain = "sk-063aea96cb96435a84a2183b89c6e765";
    const encrypted = await encryptSensitiveValue(plain);

    expect(encrypted.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(isEncryptedValue(encrypted)).toBe(true);
    expect(encrypted).not.toContain(plain);

    const decrypted = await decryptSensitiveValue(encrypted);
    expect(decrypted).toBe(plain);
  });

  it("encryption is idempotent and ignores already encrypted values", async () => {
    const plain = "my-secret-token-12345";
    const enc1 = await encryptSensitiveValue(plain);
    const enc2 = await encryptSensitiveValue(enc1);

    expect(enc2).toBe(enc1);
  });

  it("decryptSensitiveValue handles legacy plain text gracefully without corruption", async () => {
    const legacyPlain = "sk-legacy-unencrypted-key";
    const decrypted = await decryptSensitiveValue(legacyPlain);

    expect(decrypted).toBe(legacyPlain);
  });

  it("transparent database storage: stores ciphertext in sqlite, returns plaintext via getSetting", async () => {
    const secretKey = "sk-antigravity-private-vault-test";
    await db.setSetting("ai_api_key", secretKey);

    // 1. 底层 SQL 直查，验证数据库中实际存储的是 enc:v1: 密文，磁盘上绝无明文
    const rawRows = await (db as any).requireDb().select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = 'ai_api_key'"
    );
    expect(rawRows.length).toBe(1);
    const rawVal = rawRows[0].value;
    expect(rawVal.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(rawVal).not.toContain(secretKey);

    // 2. 业务层通过 getSetting 读取，透明解密还原明文
    const readBack = await db.getSetting("ai_api_key");
    expect(readBack).toBe(secretKey);

    // 3. getAllSettings 同样透明解密
    const all = await db.getAllSettings();
    const found = all.find((s) => s.key === "ai_api_key");
    expect(found?.value).toBe(secretKey);
  });

  it("migrates legacy plaintext settings to AES-256-GCM ciphertext seamlessly", async () => {
    const oldPlainKey = "sk-old-unencrypted-key-from-v0.16.0";
    // 模拟旧版本数据库中直接存入的明文
    await (db as any).requireDb().execute(
      "INSERT INTO settings (key, value) VALUES ('deepl_api_key', ?)",
      [oldPlainKey]
    );

    // 确认写入的是明文
    const unmigrated = await (db as any).requireDb().select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = 'deepl_api_key'"
    );
    expect(unmigrated[0].value).toBe(oldPlainKey);

    // 触发自动加密迁移
    const migratedCount = await db.migratePlaintextSensitiveSettings();
    expect(migratedCount).toBe(1);

    // 迁移后底层数据库已变为密文
    const migrated = await (db as any).requireDb().select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = 'deepl_api_key'"
    );
    expect(migrated[0].value.startsWith(ENCRYPTED_PREFIX)).toBe(true);

    // 业务层仍可正常解密使用
    expect(await db.getSetting("deepl_api_key")).toBe(oldPlainKey);
  });
});
