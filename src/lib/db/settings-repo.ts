import { BaseDB } from "./base";

export class SettingsRepository extends BaseDB {
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
  }

  async getAllSettings(): Promise<{ key: string; value: string }[]> {
    return this.requireDb().select("SELECT key, value FROM settings ORDER BY key");
  }

  async restoreSetting(key: string, value: string): Promise<void> {
    await this.requireDb().execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }
}
