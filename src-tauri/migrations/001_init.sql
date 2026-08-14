-- Reciter initial schema (Phase 2)
-- 对齐 PLAN.md / ANALYSIS.md 数据库设计

-- 词库表
CREATE TABLE IF NOT EXISTS decks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT DEFAULT '',
  new_cards_per_day INTEGER DEFAULT 20,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 卡片表
CREATE TABLE IF NOT EXISTS cards (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id           INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front             TEXT NOT NULL,
  back              TEXT NOT NULL,
  markdown_content  TEXT DEFAULT '',
  source_type       TEXT DEFAULT 'manual',
  tags              TEXT DEFAULT '[]',
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(deck_id, front)
);

-- FSRS 记忆状态表（与 cards 1:1）
CREATE TABLE IF NOT EXISTS card_states (
  card_id           INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  state             INTEGER NOT NULL DEFAULT 0,
  stability         REAL NOT NULL DEFAULT 0,
  difficulty        REAL NOT NULL DEFAULT 0,
  due               TEXT NOT NULL DEFAULT (datetime('now')),
  last_review       TEXT,
  elapsed_days      REAL DEFAULT 0,
  scheduled_days    REAL DEFAULT 0,
  reps              INTEGER DEFAULT 0,
  lapses            INTEGER DEFAULT 0,
  desired_retention REAL DEFAULT 0.9,
  algorithm_version TEXT DEFAULT 'FSRS-5'
);

-- 复习记录表
CREATE TABLE IF NOT EXISTS review_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id           INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grade             INTEGER NOT NULL,
  reviewed_at       TEXT DEFAULT (datetime('now')),
  response_time_ms  INTEGER,
  source            TEXT DEFAULT 'review',
  ai_question       TEXT,
  ai_answer         TEXT
);

-- 设置表（KV）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 学习统计日报表
CREATE TABLE IF NOT EXISTS daily_stats (
  date              TEXT PRIMARY KEY,
  new_count         INTEGER DEFAULT 0,
  review_count      INTEGER DEFAULT 0,
  again_count       INTEGER DEFAULT 0,
  total_time_ms     INTEGER DEFAULT 0,
  retention_rate    REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_card_states_due ON card_states(due);
CREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON review_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at);
