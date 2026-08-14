-- Phase: 重点词标记（Markdown 黑体释义识别）
ALTER TABLE cards ADD COLUMN is_key INTEGER NOT NULL DEFAULT 0;
