import type { SQLBackend } from "@/lib/sql/backend";

/**
 * 数据库迁移 SQL（镜像 src-tauri/migrations/*.sql，保持与 Rust 侧一致）
 * Tauri 端由 tauri-plugin-sql 自动执行；Web(sql.js) 端由 init 时手动执行（幂等）。
 */
export interface MigrationDef {
  version: number;
  description: string;
  sql: string;
  /** 迁移已隐式应用的检测（如历史数据已含目标列），返回 true 则跳过 */
  alreadyApplied?: (backend: SQLBackend) => Promise<boolean>;
}

export const MIGRATIONS: MigrationDef[] = [
  { version: 1, description: "create initial tables", sql: "-- Reciter initial schema (Phase 2)\n-- 对齐 PLAN.md / ANALYSIS.md 数据库设计\n\n-- 词库表\nCREATE TABLE IF NOT EXISTS decks (\n  id            INTEGER PRIMARY KEY AUTOINCREMENT,\n  name          TEXT NOT NULL UNIQUE,\n  description   TEXT DEFAULT '',\n  new_cards_per_day INTEGER DEFAULT 20,\n  created_at    TEXT DEFAULT (datetime('now')),\n  updated_at    TEXT DEFAULT (datetime('now'))\n);\n\n-- 卡片表\nCREATE TABLE IF NOT EXISTS cards (\n  id                INTEGER PRIMARY KEY AUTOINCREMENT,\n  deck_id           INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,\n  front             TEXT NOT NULL,\n  back              TEXT NOT NULL,\n  markdown_content  TEXT DEFAULT '',\n  source_type       TEXT DEFAULT 'manual',\n  tags              TEXT DEFAULT '[]',\n  created_at        TEXT DEFAULT (datetime('now')),\n  updated_at        TEXT DEFAULT (datetime('now')),\n  UNIQUE(deck_id, front)\n);\n\n-- FSRS 记忆状态表（与 cards 1:1）\nCREATE TABLE IF NOT EXISTS card_states (\n  card_id           INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,\n  state             INTEGER NOT NULL DEFAULT 0,\n  stability         REAL NOT NULL DEFAULT 0,\n  difficulty        REAL NOT NULL DEFAULT 0,\n  due               TEXT NOT NULL DEFAULT (datetime('now')),\n  last_review       TEXT,\n  elapsed_days      REAL DEFAULT 0,\n  scheduled_days    REAL DEFAULT 0,\n  reps              INTEGER DEFAULT 0,\n  lapses            INTEGER DEFAULT 0,\n  desired_retention REAL DEFAULT 0.9,\n  algorithm_version TEXT DEFAULT 'FSRS-5'\n);\n\n-- 复习记录表\nCREATE TABLE IF NOT EXISTS review_logs (\n  id                INTEGER PRIMARY KEY AUTOINCREMENT,\n  card_id           INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,\n  grade             INTEGER NOT NULL,\n  reviewed_at       TEXT DEFAULT (datetime('now')),\n  response_time_ms  INTEGER,\n  source            TEXT DEFAULT 'review',\n  ai_question       TEXT,\n  ai_answer         TEXT\n);\n\n-- 设置表（KV）\nCREATE TABLE IF NOT EXISTS settings (\n  key   TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n);\n\n-- 学习统计日报表\nCREATE TABLE IF NOT EXISTS daily_stats (\n  date              TEXT PRIMARY KEY,\n  new_count         INTEGER DEFAULT 0,\n  review_count      INTEGER DEFAULT 0,\n  again_count       INTEGER DEFAULT 0,\n  total_time_ms     INTEGER DEFAULT 0,\n  retention_rate    REAL DEFAULT 0\n);\n\nCREATE INDEX IF NOT EXISTS idx_cards_deck_id ON cards(deck_id);\nCREATE INDEX IF NOT EXISTS idx_card_states_due ON card_states(due);\nCREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON review_logs(card_id);\nCREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at);\n" },
  {
    version: 2,
    description: "add learning_steps",
    sql: "-- Phase 3: ts-fsrs v5 Card.learning_steps 持久化（Learning 步骤进度，重启不丢）\nALTER TABLE card_states ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0;\n",
    // 兼容：IndexedDB 中已存在 learning_steps 列（历史加载过）时跳过 ALTER
    alreadyApplied: async (backend) => {
      const cols = await backend.select<{ name: string }[]>("PRAGMA table_info(card_states)");
      return cols.some((c) => c.name === "learning_steps");
    },
  },
  { version: 3, description: "normalize timestamps", sql: "-- Phase 3 修复：统一时间格式为 ISO-8601 UTC（'T' 分隔 + 'Z'）\n-- 避免 'YYYY-MM-DD HH:MM:SS'（SQLite datetime('now')）与\n-- 'YYYY-MM-DDTHH:MM:SS.sssZ'（ts-fsrs toISOString）字符串比较错乱\nUPDATE card_states SET due = replace(due, ' ', 'T') || 'Z' WHERE due LIKE '% %';\nUPDATE card_states SET last_review = replace(last_review, ' ', 'T') || 'Z' WHERE last_review LIKE '% %';\nUPDATE review_logs SET reviewed_at = replace(reviewed_at, ' ', 'T') || 'Z' WHERE reviewed_at LIKE '% %';\nUPDATE cards SET created_at = replace(created_at, ' ', 'T') || 'Z' WHERE created_at LIKE '% %';\nUPDATE cards SET updated_at = replace(updated_at, ' ', 'T') || 'Z' WHERE updated_at LIKE '% %';\nUPDATE decks SET created_at = replace(created_at, ' ', 'T') || 'Z' WHERE created_at LIKE '% %';\nUPDATE decks SET updated_at = replace(updated_at, ' ', 'T') || 'Z' WHERE updated_at LIKE '% %';\n" },
];

const META_TABLE = "_reciter_migrations";

/** 执行未应用的迁移（web 端，幂等：记录已应用版本 + 兼容隐式应用） */
export async function runMigrations(backend: SQLBackend): Promise<void> {
  await backend.execute(
    "CREATE TABLE IF NOT EXISTS " + META_TABLE + " (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))"
  );
  const rows = await backend.select<{ version: number }[]>("SELECT version FROM " + META_TABLE);
  const applied = new Set(rows.map((r) => r.version));

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    if (m.alreadyApplied) {
      try {
        if (await m.alreadyApplied(backend)) {
          await backend.execute("INSERT OR IGNORE INTO " + META_TABLE + " (version) VALUES (?)", [m.version]);
          continue;
        }
      } catch {
        // 检测失败则按正常迁移执行
      }
    }
    await backend.execute(m.sql);
    await backend.execute("INSERT OR IGNORE INTO " + META_TABLE + " (version) VALUES (?)", [m.version]);
  }
}
