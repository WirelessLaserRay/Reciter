import { db } from "@/lib/db";

export interface ExamConfig {
  date: string | null; // YYYY-MM-DD
  deckIds: number[];
}

export async function getExamConfig(): Promise<ExamConfig> {
  const [dateRaw, deckIdsRaw] = await Promise.all([
    db.getSetting("exam_date"),
    db.getSetting("exam_deck_ids"),
  ]);
  let deckIds: number[] = [];
  try {
    const parsed = JSON.parse(deckIdsRaw ?? "[]");
    deckIds = Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    deckIds = [];
  }
  return { date: dateRaw || null, deckIds };
}

export async function saveExamConfig(config: ExamConfig): Promise<void> {
  await db.setSetting("exam_date", config.date ?? "");
  await db.setSetting("exam_deck_ids", JSON.stringify(config.deckIds));
}

export function getDaysUntilExam(dateStr: string, now: Date = new Date()): number {
  const target = new Date(dateStr + "T00:00:00");
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export async function getDailyNewTarget(): Promise<number | null> {
  const cfg = await getExamConfig();
  if (!cfg.date) return null;
  const days = getDaysUntilExam(cfg.date);
  if (days <= 0) return null;
  const unlearned = await db.getGlobalNewCount();
  return Math.ceil(unlearned / days);
}
