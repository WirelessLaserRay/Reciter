import { BaseDB } from "./base";
import { syncSettingToPrivateMirror } from "@/lib/private-settings-guard";
import {
  isSensitiveSettingKey,
  isEncryptedValue,
  encryptSensitiveValue,
  decryptSensitiveValue,
} from "@/lib/crypto";

export type SettingChangeListener = (key: string, value: string) => void;

export class SettingsRepository extends BaseDB {
  private settingListeners: Set<SettingChangeListener> = new Set();

  /** 注册全局设置变更监听器 */
  onSettingChange(listener: SettingChangeListener): () => void {
    this.settingListeners.add(listener);
    return () => this.settingListeners.delete(listener);
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.requireDb().select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = ?",
      [key]
    );
    const raw = rows[0]?.value ?? null;
    if (!raw) return null;
    if (isSensitiveSettingKey(key)) {
      return decryptSensitiveValue(raw);
    }
    return raw;
  }

  async setSetting(key: string, value: string): Promise<void> {
    let storedValue = value;
    if (isSensitiveSettingKey(key) && value) {
      storedValue = await encryptSensitiveValue(value);
    }

    await this.requireDb().execute(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, storedValue]
    );
    syncSettingToPrivateMirror(key, storedValue);
    for (const listener of this.settingListeners) {
      try {
        listener(key, value);
      } catch (e) {
        console.warn("Setting change listener failed:", e);
      }
    }
  }

  async getAllSettings(): Promise<{ key: string; value: string }[]> {
    const rows = await this.requireDb().select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings ORDER BY key"
    );
    const result: { key: string; value: string }[] = [];
    for (const r of rows) {
      if (isSensitiveSettingKey(r.key) && r.value) {
        result.push({ key: r.key, value: await decryptSensitiveValue(r.value) });
      } else {
        result.push(r);
      }
    }
    return result;
  }

  async restoreSetting(key: string, value: string): Promise<void> {
    let storedValue = value;
    if (isSensitiveSettingKey(key) && value && !isEncryptedValue(value)) {
      storedValue = await encryptSensitiveValue(value);
    }
    await this.requireDb().execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, storedValue]);
    syncSettingToPrivateMirror(key, storedValue);
  }

  /**
   * 自动迁移：将现有 SQLite 数据库中的旧版明文敏感凭据平滑升级加密为 AES-256-GCM 密文
   */
  async migratePlaintextSensitiveSettings(): Promise<number> {
    let migratedCount = 0;
    try {
      const rows = await this.requireDb().select<{ key: string; value: string }[]>(
        "SELECT key, value FROM settings"
      );
      for (const r of rows) {
        if (isSensitiveSettingKey(r.key) && r.value && !isEncryptedValue(r.value)) {
          const encrypted = await encryptSensitiveValue(r.value);
          await this.requireDb().execute(
            "UPDATE settings SET value = ? WHERE key = ?",
            [encrypted, r.key]
          );
          syncSettingToPrivateMirror(r.key, encrypted);
          migratedCount++;
        }
      }
      if (migratedCount > 0) {
        console.info(`[Security] 已将本地 ${migratedCount} 项旧版明文敏感凭据自动升级为 AES-256-GCM 密文`);
      }
    } catch (e) {
      console.warn("迁移旧版敏感凭据失败:", e);
    }
    return migratedCount;
  }
}
