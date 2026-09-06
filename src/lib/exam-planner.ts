import { db } from "@/lib/db";
import { AIClient, getAIConfig } from "@/lib/ai-client";
import type { Deck } from "@/types";

export interface ExamConfig {
  date: string | null; // YYYY-MM-DD
  deckIds: number[]; // 目标词库 ID，空数组 = 全部词库
  ignoredTags: string[]; // 要忽略的标签，例如 ["简单", "已掌握"]
  title?: string; // 考试名称，例如 "大学英语六级"、"考研英语"
  dailyNewOverride?: number | null; // 手动覆盖每日新词量
}

export interface TodayOrchestratedPlan {
  dateKey: string; // YYYY-MM-DD
  daysUntilExam: number;
  examDate: string;
  examTitle: string;
  deckIds: number[];
  deckNames: string;
  selectedDeckNames: string[];
  ignoredTags: string[];
  remainingNew: number; // 范围内剩余新词总数
  dueToday: number; // 范围内今日到期复习数
  targetNew: number; // 今日安排新词数
  targetReview: number; // 今日安排复习数
  totalTarget: number; // targetNew + targetReview
  advice: string; // AI 或规则生成的今日编排建议与重点
  aiGenerated: boolean; // advice 是否来自 AI
  isCompleted: boolean; // 今日编排任务是否已达成
  encouragement: string | null; // 完成后的鼓励语
}

export const LOCAL_ENCOURAGEMENTS = [
  "星光不问赶路人，时光不负有心人。今天攻克的每一个生词，都是考场上胸有成竹的底气！✨",
  "太棒了！今日备考任务圆满达成！距离目标更近了一步，坚持就是最酷的超能力！🎯",
  "合抱之木，生于毫末；九层之台，起于累土。今天的词汇堡垒又筑厚了一层，好好休息，明天继续！🚀",
  "千里之行，积于跬步。今天你战胜了懈怠、拿下了全部目标，考场上必将旗开得胜！🔥",
  "每一次专注的回忆都是在对抗遗忘，今天你的大脑神经元又建立了更强健的记忆回路。干得漂亮！👏",
  "日拱一卒，功不唐捐！今天的每一步努力都在悄悄沉淀，考场见证你的蜕变！💫",
  "乾坤未定，你我皆是黑马！今天的任务稳稳拿下，继续保持这股冲劲，胜利必将属于你！🏆",
  "自律的顶端是享受！今天又打了一场漂亮的记忆胜仗，给自己倒杯水，享受达成的喜悦吧！☕",
];

/**
 * 格式化紧凑列表展示（过多时用 “……等 N 个” 折叠）
 */
export function formatCompactList(items: string[], maxItems = 2): {
  displayed: string[];
  remainingCount: number;
  totalCount: number;
  compactText: string;
  fullText: string;
} {
  if (!items || items.length === 0) {
    return { displayed: [], remainingCount: 0, totalCount: 0, compactText: "", fullText: "" };
  }
  const totalCount = items.length;
  const fullText = items.join("、");
  if (items.length <= maxItems) {
    return { displayed: items, remainingCount: 0, totalCount, compactText: fullText, fullText };
  }
  const displayed = items.slice(0, maxItems);
  const remainingCount = items.length - maxItems;
  const compactText = `${displayed.join("、")}……等 ${totalCount} 个`;
  return { displayed, remainingCount, totalCount, compactText, fullText };
}

export async function getExamConfig(): Promise<ExamConfig> {
  const [dateRaw, deckIdsRaw, ignoredTagsRaw, titleRaw, dailyNewRaw] = await Promise.all([
    db.getSetting("exam_date"),
    db.getSetting("exam_deck_ids"),
    db.getSetting("exam_ignored_tags"),
    db.getSetting("exam_title"),
    db.getSetting("exam_daily_new_override"),
  ]);
  let deckIds: number[] = [];
  try {
    const parsed = JSON.parse(deckIdsRaw ?? "[]");
    deckIds = Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    deckIds = [];
  }
  let ignoredTags: string[] = [];
  try {
    const parsed = JSON.parse(ignoredTagsRaw ?? "[]");
    ignoredTags = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    ignoredTags = [];
  }
  const dailyNewOverride = dailyNewRaw ? parseInt(dailyNewRaw, 10) : null;
  return {
    date: dateRaw || null,
    deckIds,
    ignoredTags,
    title: titleRaw || "",
    dailyNewOverride: Number.isFinite(dailyNewOverride) ? dailyNewOverride : null,
  };
}

export async function saveExamConfig(config: ExamConfig): Promise<void> {
  await db.setSetting("exam_date", config.date ?? "");
  await db.setSetting("exam_deck_ids", JSON.stringify(config.deckIds));
  await db.setSetting("exam_ignored_tags", JSON.stringify(config.ignoredTags ?? []));
  await db.setSetting("exam_title", config.title ?? "");
  await db.setSetting(
    "exam_daily_new_override",
    config.dailyNewOverride ? String(config.dailyNewOverride) : ""
  );
}

export function getDaysUntilExam(dateStr: string, now: Date = new Date()): number {
  const target = new Date(dateStr + "T00:00:00");
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export async function getDailyNewTarget(): Promise<number | null> {
  const cfg = await getExamConfig();
  if (!cfg.date) return null;
  if (cfg.dailyNewOverride && cfg.dailyNewOverride > 0) {
    return cfg.dailyNewOverride;
  }
  const days = getDaysUntilExam(cfg.date);
  if (days <= 0) return null;
  const unlearned = await db.getNewCountByDecks(cfg.deckIds, cfg.ignoredTags);
  return Math.ceil(unlearned / days);
}

/** 获取并计算今日 AI 编排学习任务 */
export async function getTodayOrchestratedPlan(decks: Deck[]): Promise<TodayOrchestratedPlan | null> {
  const cfg = await getExamConfig();
  if (!cfg.date) return null;
  const days = getDaysUntilExam(cfg.date);
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  const selectedDecks = decks.filter((d) => cfg.deckIds.length === 0 || cfg.deckIds.includes(d.id));
  const deckNames =
    cfg.deckIds.length === 0
      ? "全部词库"
      : selectedDecks.map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name)).join("、") || "全部词库";

  const [remainingNew, dueToday, reviewLimitRaw, completedDate, savedEncouragement, savedAdvice] =
    await Promise.all([
      db.getNewCountByDecks(cfg.deckIds, cfg.ignoredTags),
      db.getDueCountByDecks(cfg.deckIds, now.toISOString(), cfg.ignoredTags),
      db.getSetting("daily_review_limit"),
      db.getSetting("exam_last_completed_date"),
      db.getSetting("exam_last_encouragement"),
      db.getSetting(`exam_today_advice_${dateKey}`),
    ]);

  const reviewLimit = reviewLimitRaw ? parseInt(reviewLimitRaw, 10) : 200;
  const targetReview = Math.min(dueToday, reviewLimit);

  let targetNew = 0;
  if (remainingNew > 0) {
    if (cfg.dailyNewOverride && cfg.dailyNewOverride > 0) {
      targetNew = Math.min(remainingNew, cfg.dailyNewOverride);
    } else if (days > 0) {
      targetNew = Math.min(remainingNew, Math.max(5, Math.ceil(remainingNew / days)));
    } else {
      targetNew = Math.min(remainingNew, 30);
    }
  }

  const isCompleted = completedDate === dateKey;
  let encouragement: string | null = null;
  if (isCompleted) {
    encouragement = savedEncouragement || LOCAL_ENCOURAGEMENTS[0];
  }

  // 检查并获取今日学情建议与规划
  let advice = savedAdvice || "";
  let aiGenerated = (await db.getSetting(`exam_today_advice_ai_${dateKey}`)) === "true";

  const planContext = {
    dateKey,
    daysUntilExam: days,
    examDate: cfg.date,
    examTitle: cfg.title || "目标考试",
    deckIds: cfg.deckIds,
    deckNames,
    selectedDeckNames: selectedDecks.map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name)),
    ignoredTags: cfg.ignoredTags,
    remainingNew,
    dueToday,
    targetNew,
    targetReview,
    totalTarget: targetNew + targetReview,
  };

  // 若今日尚未生成建议，则自动触发学情评估并生成今日规划（支持每日自动更新）
  if (!advice) {
    const situation = await getRecentStudySituation();
    let generated = "";

    try {
      const aiCfg = await getAIConfig();
      if (aiCfg.enabled && aiCfg.baseURL.trim() && aiCfg.model.trim()) {
        generated = await generateAIOrchestrationAdvice(planContext);
        aiGenerated = true;
      }
    } catch {
      // 忽略自动 AI 失败，平滑降级到本地启发式学情评价
    }

    if (!generated) {
      generated = generateHeuristicStudyAdvice(planContext, situation);
      aiGenerated = false;
      await Promise.all([
        db.setSetting(`exam_today_advice_${dateKey}`, generated),
        db.setSetting(`exam_today_advice_ai_${dateKey}`, "false"),
      ]);
    }
    advice = generated;
  }

  return {
    ...planContext,
    advice,
    aiGenerated,
    isCompleted,
    encouragement,
  };
}

/** 用户真实近期学情指标 */
export interface RecentStudySituation {
  daysActive7: number;
  totalNew7: number;
  totalReview7: number;
  totalAgain7: number;
  avgNewPerDay: number;
  retentionRate7: number;
  weakCount: number;
}

/** 获取最近 7 天的真实学情数据用于科学评价 */
export async function getRecentStudySituation(): Promise<RecentStudySituation> {
  const now = new Date();
  const past7 = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const [stats7, weakCount] = await Promise.all([
    db.getDailyStatsRange(past7, todayStr).catch(() => []),
    db.getGlobalWeakCount().catch(() => 0),
  ]);

  let daysActive7 = 0;
  let totalNew7 = 0;
  let totalReview7 = 0;
  let totalAgain7 = 0;

  for (const s of stats7) {
    if (s.new_count > 0 || s.review_count > 0) daysActive7++;
    totalNew7 += s.new_count || 0;
    totalReview7 += s.review_count || 0;
    totalAgain7 += s.again_count || 0;
  }

  const avgNewPerDay = daysActive7 > 0 ? Math.round(totalNew7 / daysActive7) : 0;
  const attempts = totalReview7;
  const retentionRate7 = attempts > 0 ? Math.max(0, Math.min(100, Math.round(((attempts - totalAgain7) / attempts) * 100))) : 92;

  return {
    daysActive7,
    totalNew7,
    totalReview7,
    totalAgain7,
    avgNewPerDay,
    retentionRate7,
    weakCount,
  };
}

/** 本地启发式智能学情评价与今日规划（输出结构清晰的 Markdown） */
export function generateHeuristicStudyAdvice(
  plan: Omit<TodayOrchestratedPlan, "advice" | "aiGenerated" | "isCompleted" | "encouragement">,
  situation: RecentStudySituation
): string {
  const { daysUntilExam, examTitle, remainingNew, targetNew, targetReview } = plan;
  const { daysActive7, avgNewPerDay, retentionRate7, weakCount, totalReview7 } = situation;

  // 1. 备考紧迫度阶段诊断
  let stageTitle = "稳步筑基期";
  let stageAdvice = "当前备考时间充裕，保持每日平摊新词吸收，配合 FSRS 间隔复习稳扎稳打。";
  if (daysUntilExam <= 7) {
    stageTitle = "考前决胜冲刺期";
    stageAdvice = "考期在即，进入最后收官阶段。重点在于将已学词汇 100% 保持在熟练状态，不宜大量死磕未学新词。";
  } else if (daysUntilExam <= 30) {
    stageTitle = "强化突击与提速期";
    stageAdvice = "进入关键突破阶段，必须保持较高专注度，确保每日新词与复习任务双清零。";
  }

  // 2. 学情与节奏诊断
  let paceEvaluation = "";
  if (daysActive7 >= 5) {
    paceEvaluation = `近 7 天坚持打卡 **${daysActive7}** 天，日均新学 **${avgNewPerDay}** 词，自律性极高，保持良好学习势头！`;
  } else if (daysActive7 >= 2) {
    paceEvaluation = `近 7 天活跃 **${daysActive7}** 天，日均推进 **${avgNewPerDay}** 词，建议进一步保持打卡连贯性，避免复习曲线陡增。`;
  } else {
    paceEvaluation = `近期打卡频次较低，建议今日尽快启动学习，唤醒大脑记忆激活回路。`;
  }

  // 3. 记忆健康度诊断
  let memoryEvaluation = "";
  if (totalReview7 === 0) {
    memoryEvaluation = `新的一天，今日共有 **${targetReview}** 张复习卡等待巩固。`;
  } else if (retentionRate7 >= 88) {
    memoryEvaluation = `近期复习保持率达到 **${retentionRate7}%**，记忆网络相当稳固！`;
  } else {
    memoryEvaluation = `近期复习保持率约为 **${retentionRate7}%**，记忆出现轻度遗忘，建议放慢单轮节奏，加深释义语境理解。`;
  }

  let weakComment = "";
  let weakAction = "对连续遗忘的卡片及时点击“弱词”标记，善用主动回忆与释义对照加深印记。";
  if (weakCount > 15) {
    weakComment = `当前系统已识别并归集 **${weakCount}** 个弱词；`;
    weakAction = `弱词本目前已积累 **${weakCount}** 词，建议今日安排 15 分钟弱词本专项击破。`;
  } else if (weakCount > 0) {
    weakComment = `弱词本目前收录 **${weakCount}** 个词，属于健康可控范围；`;
  } else {
    weakComment = `当前无突出弱词堆积，掌握状态良好；`;
  }

  return [
    `### 📊 学情速评：${stageTitle}`,
    `- **进度诊断**：距离【${examTitle}】还剩 **${daysUntilExam}** 天，目标词库范围内待学新词剩余 **${remainingNew}** 词。${paceEvaluation}`,
    `- **记忆稳固度**：${memoryEvaluation} ${weakComment}`,
    "",
    "### 🎯 今日备考规划与突破建议",
    `1. **复习优先原则**：首要完成今日 **${targetReview}** 张到期复习，确保既有记忆稳固，坚决不积压到次日。`,
    `2. **新词平摊消化**：按节奏完成今日 **${targetNew}** 张新词配额，多结合上下文例句与发音联想，提高单词辨识敏感度。`,
    `3. **应试突破锦囊**：${stageAdvice} ${weakAction}`,
  ].join("\n");
}

/** 调用 AI 深度评价当前学情并生成今日针对性备考规划（严格 Markdown 格式输出） */
export async function generateAIOrchestrationAdvice(
  plan: Omit<TodayOrchestratedPlan, "advice" | "aiGenerated" | "isCompleted" | "encouragement">
): Promise<string> {
  const aiCfg = await getAIConfig();
  if (!aiCfg.enabled || !aiCfg.baseURL.trim() || !aiCfg.model.trim()) {
    throw new Error("请先在「AI 配置」中完成接口设置");
  }

  const situation = await getRecentStudySituation();
  const client = new AIClient(aiCfg);

  const prompt = [
    "你是 Reciter 智能词汇学习架构师兼资深英语备考总教练。请根据用户精准的【备考目标】与【近期真实学情数据】，输出一份专业权威、直击重点的【今日学情评价与备考规划】。",
    "",
    "## 备考档案与今日目标",
    `- 目标考试：${plan.examTitle}`,
    `- 考试日期：${plan.examDate}（倒计时剩余 ${plan.daysUntilExam} 天）`,
    `- 涉及词库：${plan.deckNames}`,
    `- 排除标签/规则：${plan.ignoredTags.length > 0 ? plan.ignoredTags.join("、") : "无"}`,
    `- 词库待学新词总量：${plan.remainingNew} 词`,
    `- 今日到期复习卡片：${plan.dueToday} 词`,
    `- 今日编排任务配额：新学 ${plan.targetNew} 词 + 复习 ${plan.targetReview} 词（合计 ${plan.totalTarget} 词）`,
    "",
    "## 用户真实近期学情数据",
    `- 近 7 天打卡天数：${situation.daysActive7} / 7 天`,
    `- 近 7 天累计新学：${situation.totalNew7} 词（日均 ${situation.avgNewPerDay} 词/活跃天）`,
    `- 近 7 天累计复习：${situation.totalReview7} 词`,
    `- 近期复习保持率：约 ${situation.retentionRate7}%（Again 遗忘次数：${situation.totalAgain7} 次）`,
    `- 当前系统弱词本积累量：${situation.weakCount} 词`,
    "",
    "## 输出要求",
    "1. **必须严格使用结构清晰的 Markdown 格式输出**，包含以下三个小节：",
    "   - `### 📊 学情客观诊断`：客观评价当前学习节奏（如稳步推进/节奏滞后/冲刺高效）、近期复习保持率与弱词风险，指出当前优势与潜在隐患；",
    "   - `### 🎯 今日备考规划`：针对今日任务（复习与新学先后顺序、建议用时分配、重点应对策略）给出明确指令；",
    "   - `### 💡 提分突破锦囊`：针对该考试类型与当前记忆阶段，给出 1~2 条提分记忆实用技巧（如语境串联、词根助记、错词自查）。",
    "2. 语言干练、亲切专业、充满行动力，拒绝泛泛而谈的废话套话，字数在 200~350 字之间。",
    "3. 直接输出 Markdown 内容，不要带有额外的外部代码块包装（如不要用 ```markdown ... ``` 外框）。",
  ].join("\n");

  const res = await client.chat([
    { role: "system", content: "你是精通认知科学与 FSRS 记忆曲线的资深英语备考教练，输出精炼专业的 Markdown 备考分析与规划。" },
    { role: "user", content: prompt },
  ]);

  const clean = res.replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (clean) {
    await Promise.all([
      db.setSetting(`exam_today_advice_${plan.dateKey}`, clean),
      db.setSetting(`exam_today_advice_ai_${plan.dateKey}`, "true"),
    ]);
  }
  return clean;
}

/** 完成任务时生成/获取鼓励语 */
export async function generateCompletionEncouragement(context: {
  examTitle?: string;
  daysUntil: number;
  newDone: number;
  reviewedTotal: number;
}): Promise<string> {
  try {
    const aiCfg = await getAIConfig();
    if (aiCfg.enabled && aiCfg.baseURL.trim() && aiCfg.model.trim()) {
      const client = new AIClient(aiCfg);
      const prompt = [
        "你是一位既温暖又有力量的英语备考私教。用户刚刚达成了今日的学习编排任务！",
        "",
        `目标考试：${context.examTitle || "英语考试"}`,
        `距离考试：还有 ${context.daysUntil} 天`,
        `今日学习成果：新学 ${context.newDone} 词，复习 ${context.reviewedTotal} 张卡片`,
        "",
        "请写一段 40~80 字真挚、振奋人心、充满正能量的专属鼓励语（包含 1~2 个 Emoji）。",
        "要求：",
        "1. 表扬今日踏实的坚持与高效完成；",
        "2. 给予明天继续前行的信心和情绪价值；",
        "3. 亲切自然，拒绝死板空话；",
        "4. 直接输出鼓励语正文，不要包含引号、前言或额外解释。",
      ].join("\n");
      const res = await client.chat([
        { role: "system", content: "你是充满正能量与亲和力的英语备考教练，只输出真诚激励人心的鼓励语。" },
        { role: "user", content: prompt },
      ]);
      const clean = res.replace(/["“”]/g, "").trim();
      if (clean.length >= 15) return clean;
    }
  } catch {
    // 降级使用优质离线鼓励语
  }
  const idx = Math.floor(Math.random() * LOCAL_ENCOURAGEMENTS.length);
  return LOCAL_ENCOURAGEMENTS[idx];
}

/** 标记今日任务已完成并持久化鼓励语 */
export async function markTodayPlanCompleted(encouragement: string): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10);
  await Promise.all([
    db.setSetting("exam_last_completed_date", todayKey),
    db.setSetting("exam_last_encouragement", encouragement),
  ]);
}

/** 已保存的 AI 宏观学习计划（settings: exam_ai_plan） */
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
 * 生成宏观分阶段 AI 学习计划：
 * 基于考试日期、剩余天数、所选词库与忽略标签，让 AI 输出一份分阶段中文备考计划。
 */
export async function generateAIStudyPlan(config: ExamConfig, decks: Deck[]): Promise<string> {
  if (!config.date) throw new Error("请先设置考试日期");
  const days = getDaysUntilExam(config.date);
  if (days <= 0) throw new Error("考试日期已过或就在今天，无需规划");

  const aiCfg = await getAIConfig();
  if (!aiCfg.enabled || !aiCfg.baseURL.trim() || !aiCfg.model.trim()) {
    throw new Error("请先在「AI 配置」中完成接口设置");
  }

  const selected = decks.filter((d) => config.deckIds.length === 0 || config.deckIds.includes(d.id));
  const deckNames =
    config.deckIds.length === 0
      ? "全部词库"
      : selected.map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name)).join("、") || "全部词库";

  const newCount = await db.getNewCountByDecks(config.deckIds, config.ignoredTags);
  const dueCount = await db.getDueCountByDecks(config.deckIds, new Date().toISOString(), config.ignoredTags);

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
    `考试名称：${config.title || "目标考试"}`,
    `考试日期：${config.date}`,
    `剩余天数：${days} 天`,
    `目标词库：${deckNames}`,
    `已排除忽略标签：${config.ignoredTags.length > 0 ? config.ignoredTags.join("、") : "无"}`,
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
