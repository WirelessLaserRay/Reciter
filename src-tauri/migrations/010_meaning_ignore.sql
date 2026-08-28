-- 主要/次要释义 + 学习忽略标记
ALTER TABLE cards ADD COLUMN meaning_primary TEXT DEFAULT '';
ALTER TABLE cards ADD COLUMN meaning_secondary TEXT DEFAULT '';
ALTER TABLE cards ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0;
