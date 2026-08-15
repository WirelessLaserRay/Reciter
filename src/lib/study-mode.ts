/**
 * Phase 6C · 统一学习流模式引擎
 * 废除「学习 / 测试」二元分裂：同一队列中按卡片 FSRS 状态自适应切换学习模式。
 */
import { State } from "@/lib/fsrs";
import type { AIStrategy } from "@/lib/ai-strategy";
import type { CardState } from "@/types";

export type StudyMode =
  | "new_teach"   // 新卡：先教学（释义 + 原文语境 + AI 讲解）→ 简单识别测试 → 评分
  | "recall"      // 常规复习卡：主动回忆（先回忆再翻面）
  | "quick_test"  // 熟练卡：直接快速测试（选择/填空），秒答自动 Good
  | "ai_drill"    // 弱词：强制 AI 深度攻克（AI 启用时）
  | "classic";    // 经典翻转（主动回忆关闭时的降级模式）

export interface StudyModeConfig {
  mode: StudyMode;
  /** 对应的 AI 策略；null = AI 未启用（不注入 AI 教学） */
  aiStrategy: AIStrategy | null;
  /** 是否展示 Markdown 原文语境 */
  showMarkdown: boolean;
  /** 是否启用主动回忆 */
  autoRecall: boolean;
}

/**
 * 决定当前卡片的学习模式。
 * 判定顺序：新卡 → 弱词(AI) → 熟练卡 → 主动回忆/经典翻转。
 */
export function resolveStudyMode(
  state: CardState,
  aiEnabled: boolean,
  activeRecallEnabled: boolean
): StudyModeConfig {
  const isNew = state.state === State.New || state.reps === 0;
  const isWeak = state.lapses >= 4;
  const isStable = state.stability >= 10;

  if (isNew) {
    return {
      mode: "new_teach",
      aiStrategy: aiEnabled ? "teach" : null,
      showMarkdown: true,
      autoRecall: false, // 新卡不需要回忆，先教后测
    };
  }

  if (isWeak && aiEnabled) {
    return {
      mode: "ai_drill",
      aiStrategy: "deep_drill",
      showMarkdown: true,
      autoRecall: false,
    };
  }

  if (isStable) {
    return {
      mode: "quick_test",
      aiStrategy: aiEnabled ? "production" : null,
      showMarkdown: false,
      autoRecall: false, // 熟练卡直接快速测试
    };
  }

  return {
    mode: activeRecallEnabled ? "recall" : "classic",
    aiStrategy: aiEnabled ? "recognition" : null,
    showMarkdown: false,
    autoRecall: activeRecallEnabled,
  };
}

/** 模式中文标签（UI 徽标用） */
export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  new_teach: "新卡教学",
  recall: "主动回忆",
  quick_test: "快速测试",
  ai_drill: "AI 深度攻克",
  classic: "经典翻转",
};
