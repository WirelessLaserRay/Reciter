-- Phase: 弱词来源标记（''=自动遗忘阈值收录，'manual'=手动加入弱词本）
ALTER TABLE cards ADD COLUMN weak_source TEXT NOT NULL DEFAULT '';
