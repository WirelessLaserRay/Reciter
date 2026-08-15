-- Phase 6A: 学习偏好默认值（利用 settings KV，无需建表）
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('rating_mode', '3'),
  ('active_recall_enabled', 'true'),
  ('session_summary_interval', '10');
