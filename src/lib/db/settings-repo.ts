import { BaseDB } from "./base";

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
    return rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.requireDb().execute(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value]
    );
    for (const listener of this.settingListeners) {
      try {
        listener(key, value);
      } catch (e) {
        console.warn("Setting change listener failed:", e);
      }
    }
  }

  async getAllSettings(): Promise<{ key: string; value: string }[]> {
    return this.requireDb().select("SELECT key, value FROM settings ORDER BY key");
  }

  async restoreSetting(key: string, value: string): Promise<void> {
    await this.requireDb().execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }
}
