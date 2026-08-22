-- Phase: 弱词本删除标记（1=已从弱词本移除）
ALTER TABLE cards ADD COLUMN weak_dismissed INTEGER NOT NULL DEFAULT 0;
