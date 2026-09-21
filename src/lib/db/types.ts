export interface UpsertResult {
  cardId: number;
  created: boolean;
}

/** 学习队列行（cards JOIN card_states 扁平化） */
export interface StudyCardRow {
  card_id: number;
  deck_id: number;
  front: string;
  back: string;
  markdown_content: string;
  phonetic: string;
  tags: string;
  is_key: number;
  meaning_primary: string;
  meaning_secondary: string;
  ignored: number;
  state: number;
  stability: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  desired_retention: number;
  algorithm_version: string;
}

export interface ReviewLogInsert {
  card_id: number;
  grade: 1 | 2 | 3 | 4;
  response_time_ms?: number | null;
  source?: "review" | "quiz" | "ai_test";
  ai_question?: string | null;
  ai_answer?: string | null;
}

/** 词库掌握度分布（Phase 6C 掌握度全景；四类互斥，合计 = total） */
export interface MasteryDistribution {
  mastered: number;  // 已掌握：stability >= 7 且 lapses < threshold
  learning: number;  // 学习中：0 < stability < 7 且 lapses < threshold
  weak: number;      // 弱词：lapses >= threshold
  unlearned: number; // 未学习：state = 0 且 lapses < threshold
  total: number;
}

/** 多词库或全词库掌握度与熟练度统计 */
export interface MultiDeckMasteryStats {
  mastered: number;     // 达到目标熟练度（stability >= targetStability 且 lapses < threshold）
  learning: number;     // 学习中
  weak: number;         // 弱词
  unlearned: number;    // 未学
  total: number;
  learnedTotal: number; // 已学总数（state != 0）
  avgStability: number; // 已学卡片平均记忆稳定性（天）
  masteryRate: number;  // 掌握率百分比 (0-100)
}

/** 词库 TOP 弱词（掌握度全景用） */
export interface DeckWeakWord {
  front: string;
  lapses: number;
  stability: number;
  weak_source: string;
}

/** 全局卡片搜索结果项 */
export interface GlobalSearchResult {
  id: number;
  deck_id: number;
  deck_name: string;
  front: string;
  back: string;
  phonetic: string;
  markdown_content: string;
  tags: string;
  is_key: number;
  weak_source: string;
  weak_dismissed: number;
  meaning_primary: string;
  meaning_secondary: string;
  ignored: number;
  created_at: string;
  updated_at: string;
  state: number | null;
  stability: number | null;
  difficulty: number | null;
  due: string | null;
  reps: number | null;
  lapses: number | null;
  last_review: string | null;
}

export interface SearchCardsOptions {
  query: string;
  limit?: number;
  offset?: number;
  deckId?: number;
  scope?: "all" | "front" | "back" | "tag";
  isKeyOnly?: boolean;
  isWeakOnly?: boolean;
  showIgnored?: boolean;
}
