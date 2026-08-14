-- Phase 3 修复：统一时间格式为 ISO-8601 UTC（'T' 分隔 + 'Z'）
-- 避免 'YYYY-MM-DD HH:MM:SS'（SQLite datetime('now')）与
-- 'YYYY-MM-DDTHH:MM:SS.sssZ'（ts-fsrs toISOString）字符串比较错乱
UPDATE card_states SET due = replace(due, ' ', 'T') || 'Z' WHERE due LIKE '% %';
UPDATE card_states SET last_review = replace(last_review, ' ', 'T') || 'Z' WHERE last_review LIKE '% %';
UPDATE review_logs SET reviewed_at = replace(reviewed_at, ' ', 'T') || 'Z' WHERE reviewed_at LIKE '% %';
UPDATE cards SET created_at = replace(created_at, ' ', 'T') || 'Z' WHERE created_at LIKE '% %';
UPDATE cards SET updated_at = replace(updated_at, ' ', 'T') || 'Z' WHERE updated_at LIKE '% %';
UPDATE decks SET created_at = replace(created_at, ' ', 'T') || 'Z' WHERE created_at LIKE '% %';
UPDATE decks SET updated_at = replace(updated_at, ' ', 'T') || 'Z' WHERE updated_at LIKE '% %';
