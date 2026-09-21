import type { DailyStats } from "@/types";
import { StudyRepository } from "./study-repo";
import { nowIso } from "./helpers";

export class StatsRepository extends StudyRepository {
  /** 清空全部业务数据（恢复前调用，注意外键顺序） */
  async clearAllData(): Promise<void> {
    const db = this.requireDb();
    await db.execute("DELETE FROM review_logs");
    await db.execute("DELETE FROM card_states");
    await db.execute("DELETE FROM cards");
    await db.execute("DELETE FROM decks");
    await db.execute("DELETE FROM daily_stats");
    await db.execute("DELETE FROM settings");
  }

  /** 危险区：重置学习进度（保留词库与卡片，清空 FSRS 状态 / 复习记录 / 日报） */
  async resetLearningProgress(): Promise<void> {
    const db = this.requireDb();
    await db.execute(
      `UPDATE card_states SET
         state = 0, stability = 0, difficulty = 0, due = ?,
         last_review = NULL, elapsed_days = 0, scheduled_days = 0,
         learning_steps = 0, reps = 0, lapses = 0`,
      [nowIso()]
    );
    await db.execute("DELETE FROM review_logs");
    await db.execute("DELETE FROM daily_stats");
  }

  /** 危险区：仅重置统计数据（清空复习记录与日报，保留 FSRS 记忆进度） */
  async resetStatistics(): Promise<void> {
    const db = this.requireDb();
    await db.execute("DELETE FROM review_logs");
    await db.execute("DELETE FROM daily_stats");
  }

  /** 累加式更新日报（date: 'YYYY-MM-DD'）；新行直接写入增量，已有行累加（excluded 模式） */
  async updateDailyStats(
    date: string,
    delta: Partial<Pick<DailyStats, "new_count" | "review_count" | "again_count" | "total_time_ms">>
  ): Promise<void> {
    const v = {
      new_count: delta.new_count ?? 0,
      review_count: delta.review_count ?? 0,
      again_count: delta.again_count ?? 0,
      total_time_ms: delta.total_time_ms ?? 0,
    };
    await this.requireDb().execute(
      `INSERT INTO daily_stats (date, new_count, review_count, again_count, total_time_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         new_count = daily_stats.new_count + excluded.new_count,
         review_count = daily_stats.review_count + excluded.review_count,
         again_count = daily_stats.again_count + excluded.again_count,
         total_time_ms = daily_stats.total_time_ms + excluded.total_time_ms`,
      [date, v.new_count, v.review_count, v.again_count, v.total_time_ms]
    );
  }

  async getDailyStatsRange(from: string, to: string): Promise<DailyStats[]> {
    return this.requireDb().select<DailyStats[]>(
      "SELECT * FROM daily_stats WHERE date BETWEEN ? AND ? ORDER BY date ASC",
      [from, to]
    );
  }

  async getAllDailyStats(): Promise<DailyStats[]> {
    return this.requireDb().select("SELECT * FROM daily_stats ORDER BY date");
  }

  async restoreDailyStat(s: DailyStats): Promise<void> {
    await this.requireDb().execute(
      `INSERT OR REPLACE INTO daily_stats (date, new_count, review_count, again_count, total_time_ms, retention_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        s.date,
        s.new_count ?? 0,
        s.review_count ?? 0,
        s.again_count ?? 0,
        s.total_time_ms ?? 0,
        s.retention_rate ?? 0,
      ]
    );
  }
}
