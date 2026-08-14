// ============ Reciter 全局类型定义 ============
// Phase 1: 类型骨架（与 PLAN.md 数据库 Schema 对齐）
// Phase 2 起逐步补充并接入 SQLite

/** 词库 */
export interface Deck {
  id: number;
  name: string;
  description: string;
  new_cards_per_day: number;
  created_at: string;
  updated_at: string;
}

/** 卡片 */
export interface Card {
  id: number;
  deck_id: number;
  front: string; // 单词/短语
  back: string; // 释义/例句
  markdown_content: string;
  source_type: "markdown" | "csv" | "manual";
  tags: string; // JSON 数组字符串（如 '["熟词生义"]'），使用前需 JSON.parse
  created_at: string;
  updated_at: string;
}

/** FSRS 记忆状态（与 cards 1:1） */
export interface CardState {
  card_id: number;
  state: number; // 0:New 1:Learning 2:Review 3:Relearning
  stability: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number; // ts-fsrs v5 学习步骤进度
  desired_retention: number;
  algorithm_version: string; // 'FSRS-5'
}

/** 复习记录 */
export interface ReviewLog {
  id: number;
  card_id: number;
  grade: 1 | 2 | 3 | 4; // 1:Again 2:Hard 3:Good 4:Easy
  reviewed_at: string;
  response_time_ms: number | null;
  source: "review" | "ai_test";
  ai_question: string | null;
  ai_answer: string | null;
}

/** 学习统计日报 */
export interface DailyStats {
  date: string; // 'YYYY-MM-DD'
  new_count: number;
  review_count: number;
  again_count: number;
  total_time_ms: number;
  retention_rate: number;
}

/** 设置（KV） */
export interface AppSettings {
  [key: string]: string;
}

/** 学习队列中的卡片 */
export interface StudyCard {
  card: Card;
  state: CardState;
}
