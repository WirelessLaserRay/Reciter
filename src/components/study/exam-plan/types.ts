export interface ExamPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export const QUICK_EXAM_PRESETS = [
  "大学英语四级 (CET-4)",
  "大学英语六级 (CET-6)",
  "考研英语",
  "雅思 (IELTS)",
  "托福 (TOEFL)",
  "GRE",
  "高考英语",
] as const;

export interface PreviewStats {
  remainingNew: number;
  dueToday: number;
  recommendedDailyNew: number;
  avgStability: number;
  masteryRate: number;
  mastered: number;
  learning: number;
  weak: number;
  total: number;
  inSprintPhase: boolean;
  sprintBufferDays: number;
}
