-- Phase: 词库文件夹分类，允许不同文件夹下存在同名词库
CREATE TABLE decks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  new_cards_per_day INTEGER DEFAULT 20,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(folder, name)
);

INSERT INTO decks_new (id, folder, name, description, new_cards_per_day, created_at, updated_at)
  SELECT id, '', name, description, new_cards_per_day, created_at, updated_at FROM decks;

DROP TABLE decks;

ALTER TABLE decks_new RENAME TO decks;
