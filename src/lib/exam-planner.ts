import { db } from "@/lib/db";
import { AIClient, getAIConfig } from "@/lib/ai-client";
import type { Deck } from "@/types";

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
  const unlearned =
    cfg.deckIds.length > 0
      ? await db.getNewCountByDecks(cfg.deckIds)
      : await db.getGlobalNewCount();
  return Math.ceil(unlearned / days);
}

/** 已保存的 AI 学习计划（settings: exam_ai_plan） */
export async function getSavedAIStudyPlan(): Promise<string> {
  return (await db.getSetting("exam_ai_plan")) ?? "";
}

export async function saveAIStudyPlan(plan: string): Promise<void> {
  await db.setSetting("exam_ai_plan", plan);
}

export async function clearAIStudyPlan(): Promise<void> {
  await db.setSetting("exam_ai_plan", "");
}

/**
 * 生成 AI 学习计划：
 * 基于考试日期、剩余天数、所选词库的新卡/到期卡数量与当前学习偏好，
 * 让 AI 输出一份可执行的中文备考计划。
 */
export async function generateAIStudyPlan(config: ExamConfig, decks: Deck[]): Promise<string> {
  if (!config.date) throw new Error("请先设置考试日期");
  const days = getDaysUntilExam(config.date);
  if (days <= 0) throw new Error("考试日期已过或就在今天，无需规划");

  const aiCfg = await getAIConfig();
  if (!aiCfg.enabled || !aiCfg.baseURL.trim() || !aiCfg.model.trim()) {
    throw new Error("请先在「AI 配置」中完成接口设置");
  }

  const selected = decks.filter((d) => config.deckIds.includes(d.id));
  const deckNames =
    selected.length > 0
      ? selected.map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name)).join("、")
      : "全部词库";

  const newCount =
    config.deckIds.length > 0
      ? await db.getNewCountByDecks(config.deckIds)
      : await db.getGlobalNewCount();

  const dueMap = await db.getDeckDueCounts(new Date().toISOString());
  const dueCount =
    config.deckIds.length > 0
      ? config.deckIds.reduce((sum, id) => sum + (dueMap[id] ?? 0), 0)
      : Object.values(dueMap).reduce((a, b) => a + b, 0);

  const cardCounts = await db.getDeckCardCounts();
  const totalCards =
    config.deckIds.length > 0
      ? config.deckIds.reduce((sum, id) => sum + (cardCounts[id] ?? 0), 0)
      : Object.values(cardCounts).reduce((a, b) => a + b, 0);

  const [reviewLimitRaw, defaultNewRaw, maxSessionRaw] = await Promise.all([
    db.getSetting("daily_review_limit"),
    db.getSetting("default_new_per_day"),
    db.getSetting("max_session_cards"),
  ]);
  const reviewLimit = reviewLimitRaw ? parseInt(reviewLimitRaw, 10) : 200;
  const defaultNewPerDay = defaultNewRaw ? parseInt(defaultNewRaw, 10) : 20;
  const maxSessionCards = maxSessionRaw ? parseInt(maxSessionRaw, 10) : 100;

  const client = new AIClient(aiCfg);
  const prompt = [
    "你是 Reciter 英语学习应用的备考规划助手。请根据以下信息，为考试倒计时制定一份可执行的中文学习计划。",
    "",
    `考试日期：${config.date}`,
    `剩余天数：${days} 天`,
    `目标词库：${deckNames}`,
    `词库卡片总数：${totalCards}`,
    `未学新卡数：${newCount}`,
    `当前到期复习卡数：${dueCount}`,
    `全局每日复习上限：${reviewLimit} 张`,
    `默认每日新卡上限：${defaultNewPerDay} 张`,
    `单轮最大学习量：${maxSessionCards} 张`,
    "",
    "要求：",
    "1. 给出每日新学/复习建议量（考虑剩余天数和当前未学/到期数量，若无法在期限内学完请说明）。",
    "2. 按周给出阶段安排（如基础期、强化期、冲刺期），明确每周重点。",
    "3. 给出针对到期卡与弱词的处理建议。",
    "4. 使用简洁的 Markdown 列表，不要输出 JSON，不要输出与计划无关的内容。",
  ].join("\n");

  return client.chat([
    { role: "system", content: "你是 Reciter 的备考规划助手，只输出简洁、可执行的中文学习计划。" },
    { role: "user", content: prompt },
  ]);
}
