-- Phase 3: ts-fsrs v5 Card.learning_steps 持久化（Learning 步骤进度，重启不丢）
ALTER TABLE card_states ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0;
