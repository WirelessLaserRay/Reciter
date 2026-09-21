import type { Deck } from "@/types";
import { SettingsRepository } from "./settings-repo";
import { nowIso } from "./helpers";

export class DeckRepository extends SettingsRepository {
  async getDecks(): Promise<Deck[]> {
    return this.requireDb().select<Deck[]>("SELECT * FROM decks ORDER BY created_at DESC, id DESC");
  }

  async getDeck(id: number): Promise<Deck | null> {
    const rows = await this.requireDb().select<Deck[]>("SELECT * FROM decks WHERE id = ?", [id]);
    return rows[0] ?? null;
  }

  async getDeckIdByName(name: string, folder = ""): Promise<number | null> {
    const rows = await this.requireDb().select<{ id: number }[]>(
      "SELECT id FROM decks WHERE folder = ? AND name = ?",
      [folder, name]
    );
    return rows[0]?.id ?? null;
  }

  /** 返回所有同名词库（跨文件夹，供重名冲突选择） */
  async getDecksByName(name: string): Promise<Deck[]> {
    return this.requireDb().select<Deck[]>("SELECT * FROM decks WHERE name = ? ORDER BY folder ASC, id ASC", [name]);
  }

  /** 在指定文件夹内生成不重名的词库名：已存在则追加 _1/_2 */
  async getUniqueDeckName(name: string, folder = ""): Promise<string> {
    const escaped = name.replace(/([%_\\])/g, "\\$1");
    const existing = await this.requireDb().select<{ name: string }[]>(
      "SELECT name FROM decks WHERE (folder = ? AND name = ?) OR (folder = ? AND name LIKE ? ESCAPE '\\')",
      [folder, name, folder, escaped + "\\_%"]
    );
    const names = new Set(existing.map((r) => r.name));
    if (!names.has(name)) return name;
    let i = 1;
    while (names.has(`${name}_${i}`)) i++;
    return `${name}_${i}`;
  }

  /** 创建词库；已存在同名（同文件夹）则直接返回其 id；新建时应用全局默认每日新卡配额设置 */
  async createDeck(name: string, description = "", newPerDay?: number, folder = ""): Promise<number> {
    const db = this.requireDb();
    let quota = newPerDay;
    if (quota === undefined) {
      const raw = await this.getSetting("default_new_per_day");
      const parsed = raw ? parseInt(raw, 10) : NaN;
      quota = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
    }
    await db.execute(
      "INSERT OR IGNORE INTO decks (folder, name, description, new_cards_per_day, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [folder, name, description, quota, nowIso(), nowIso()]
    );
    const rows = await db.select<{ id: number }[]>(
      "SELECT id FROM decks WHERE folder = ? AND name = ?",
      [folder, name]
    );
    return rows[0].id;
  }

  async updateDeck(
    id: number,
    data: Partial<Pick<Deck, "name" | "description" | "new_cards_per_day" | "folder">>
  ): Promise<void> {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (data.name !== undefined) { sets.push("name = ?"); params.push(data.name); }
    if (data.description !== undefined) { sets.push("description = ?"); params.push(data.description); }
    if (data.new_cards_per_day !== undefined) { sets.push("new_cards_per_day = ?"); params.push(data.new_cards_per_day); }
    if (data.folder !== undefined) { sets.push("folder = ?"); params.push(data.folder); }
    if (sets.length === 0) return;
    params.push(nowIso());
    sets.push("updated_at = ?");
    params.push(id);
    await this.requireDb().execute(`UPDATE decks SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async deleteDeck(id: number): Promise<void> {
    const db = this.requireDb();
    await db.execute("DELETE FROM settings WHERE key = ?", [`deck_shuffle_${id}`]);
    const last = await this.getSetting("last_study_deck_id");
    if (last === String(id)) await this.setSetting("last_study_deck_id", "");
    await db.execute("DELETE FROM decks WHERE id = ?", [id]);
  }

  /** 各词库卡片数 { deck_id: count } */
  async getDeckCardCounts(): Promise<Record<number, number>> {
    const rows = await this.requireDb().select<{ deck_id: number; cnt: number }[]>(
      "SELECT deck_id, COUNT(*) AS cnt FROM cards GROUP BY deck_id"
    );
    const map: Record<number, number> = {};
    for (const r of rows) map[r.deck_id] = r.cnt;
    return map;
  }

  async getTotalCardCount(): Promise<number> {
    const rows = await this.requireDb().select<{ cnt: number }[]>("SELECT COUNT(*) AS cnt FROM cards");
    return rows[0]?.cnt ?? 0;
  }

  async restoreDeck(d: Deck): Promise<void> {
    await this.requireDb().execute(
      "INSERT INTO decks (id, folder, name, description, new_cards_per_day, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        d.id,
        d.folder ?? "",
        d.name ?? "未命名词库",
        d.description ?? "",
        d.new_cards_per_day ?? 20,
        d.created_at ?? nowIso(),
        d.updated_at ?? nowIso(),
      ]
    );
  }
}
