import type { CardState } from "@/types";

export type AIStrategy = "teach" | "recognition" | "production" | "deep_drill";

/** 根据 FSRS 状态决定 AI 出题策略（P1-⑤：顽固词阈值与 Leech 阈值统一，默认 3） */
export function getAIStrategy(state: CardState, leechThreshold = 3): AIStrategy {
  if (state.state === 0 || state.reps === 0) return "teach";
  if (state.lapses >= leechThreshold) return "deep_drill";
  if (state.stability > 30) return "production";
  return "recognition";
}

/** 构建注入到 AI system prompt 中的学习上下文 */
export function buildLearnerContext(state: CardState): string {
  return [
    "【学习者状态】",
    `- 累计复习：${state.reps} 次`,
    `- 遗忘次数：${state.lapses} 次`,
    `- 记忆稳定性：${state.stability.toFixed(1)} 天（越高越牢固）`,
    `- 难度系数：${state.difficulty.toFixed(2)}（越高越难记）`,
    state.lapses >= 3 ? "- ⚠️ 顽固词：该词反复遗忘，请采用助记法、多角度例句、易混辨析等强化策略" : "",
    state.reps === 0 ? "- 🆕 首次学习：请以教学为主，先讲清含义和用法，再给简单练习检验理解" : "",
  ]
    .filter(Boolean)
    .join("\n");
}
