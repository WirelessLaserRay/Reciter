import type { StudyCardRow } from "@/lib/db";
import type { IntervalPreview } from "@/lib/fsrs";
import type { StudyModeConfig } from "@/lib/study-mode";

// ============ 评分常量（三档默认 / 四档可选） ============

export const RATINGS_4 = [
  { grade: 1 as const, label: "忘了", emoji: null, hint: "Again", desc: "没想起来 → 立即重学" },
  { grade: 2 as const, label: "困难", emoji: null, hint: "Hard", desc: "很吃力 → 较短间隔" },
  { grade: 3 as const, label: "已掌握", emoji: null, hint: "Good", desc: "良好 / 基本掌握 → 正常安排" },
  { grade: 4 as const, label: "简单", emoji: null, hint: "Easy", desc: "非常轻松 → 大幅延长间隔" },
];

export const RATINGS_3 = [
  { grade: 1 as const, label: "不记得", emoji: null, hint: "Again", desc: "没想起来 → 立即重学" },
  { grade: 2 as const, label: "模糊", emoji: null, hint: "Hard", desc: "不确定 → 较短间隔" },
  { grade: 3 as const, label: "已掌握", emoji: null, hint: "Good", desc: "记得 / 基本掌握 → 正常安排" },
];

/** 回忆时限提示：超过该秒数仍想不起来时给出柔和建议 */
export const RECALL_HINT_SECONDS = 10;

/** 干扰项/词族来源：词库卡片精简结构 */
export interface Distractor {
  front: string;
  back: string;
  meaning_primary?: string;
  meaning_secondary?: string;
}

export const FALLBACK_DISTRACTOR_WORDS = [
  "acquire", "benefit", "concept", "diverse", "evident",
  "feature", "glimpse", "horizon", "impact", "journey",
  "logical", "method", "notion", "obtain", "precise",
  "quality", "reveal", "stable", "thrive", "urgent",
  "valid", "welfare", "yield", "zeal", "adapt",
  "balance", "crucial", "demand", "evolve", "fluent",
];

export const FALLBACK_DISTRACTOR_MEANINGS = [
  "v. 获得；取得；学到",
  "n. 利益；好处 v. 有益于",
  "n. 概念；观念；想法",
  "adj. 不同的；多种多样的",
  "adj. 明显的；明白的",
  "n. 特征；特色；容貌",
  "n. 一瞥；微光 v. 瞥见",
  "n. 地平线；视野；眼界",
  "n. 影响；冲击 v. 产生影响",
  "n. 旅行；历程 v. 旅行",
  "adj. 符合逻辑的；合理的",
  "n. 方法；条理",
  "n. 概念；见解；打算",
  "v. 获得；得到",
  "adj. 精确的；准确的",
];

export interface ModeViewProps {
  row: StudyCardRow;
  config: StudyModeConfig;
  ratingMode: "3" | "4";
  preview: IntervalPreview | null;
  retrievability: number | null;
  busy: boolean;
  /** 全词库卡片精简池（选择题干扰项 + 同族词匹配） */
  distractors: Distractor[];
  /** 熟练卡秒答阈值（毫秒），可在设置中调整 */
  quickMs: number;
  /** 单词音标（优先外部词典获取，缺省用卡片字段） */
  phonetic?: string;
  onReveal: () => void;
  onRate: (grade: 1 | 2 | 3 | 4) => void;
  onRateReadyChange: (ready: boolean) => void;
}

export interface StudyCardProps {
  row: StudyCardRow;
  config: StudyModeConfig;
  ratingMode: "3" | "4";
  preview: IntervalPreview | null;
  retrievability: number | null;
  busy: boolean;
  /** 全词库卡片精简池（选择题干扰项 + 同族词） */
  distractors: Distractor[];
  /** 熟练卡秒答阈值（毫秒） */
  quickMs: number;
  /** 单词音标（外部词典获取后传入） */
  phonetic?: string;
  /** 揭示答案：父组件据此计算间隔预览与可检索度 */
  onReveal: () => void;
  onRate: (grade: 1 | 2 | 3 | 4) => void;
  onRateReadyChange: (ready: boolean) => void;
}
