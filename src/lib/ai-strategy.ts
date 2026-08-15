import type { CardState } from "@/types";

export type AIStrategy = "teach" | "recognition" | "production" | "deep_drill";

/** 根据 FSRS 状态决定 AI 出题策略 */
export function getAIStrategy(state: CardState): AIStrategy {
  if (state.state === 0 || state.reps === 0) return "teach";
  if (state.lapses >= 3) return "deep_drill";
  if (state.stability > 30) return "production";
  return "recognition";
}

/** 构建注入到 AI system prompt 中的学习上下文 */
export function buildLearnerContext(state: CardState): string {
  return [
    "学习者当前状态：",
    `- 该词已复习 ${state.reps} 次`,
    `- 遗忘次数: ${state.lapses}`,
    `- 记忆稳定性: ${state.stability.toFixed(1)} 天`,
    `- 难度系数: ${state.difficulty.toFixed(2)}`,
    state.lapses >= 3 ? "- ⚠️ 这是一个顽固词，请采用多角度记忆策略" : "",
    state.reps === 0 ? "- 🆕 这是首次学习，请先教学后练习" : "",
  ]
    .filter(Boolean)
    .join("\n");
}
