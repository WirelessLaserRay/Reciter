import type { StudyCardRow } from "@/lib/db";
import type { CardState } from "@/types";

export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec < 60) return sec + " 秒";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
}

export function rowToState(row: StudyCardRow): CardState {
  return {
    card_id: row.card_id,
    state: row.state,
    stability: row.stability,
    difficulty: row.difficulty,
    due: row.due,
    last_review: row.last_review,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    learning_steps: row.learning_steps,
    desired_retention: row.desired_retention,
    algorithm_version: row.algorithm_version,
  };
}
