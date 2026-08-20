import { create } from "zustand";
import { db, type StudyCardRow } from "@/lib/db";
import { applyReview } from "@/lib/review";
import { fsrsCardToDBState, Rating, State, type Grade } from "@/lib/fsrs";
import { getDayStartDate, parseDayStartHour } from "@/lib/day";
import { getDeckShuffle, getInterleaveRatio, saveLastStudyContext } from "@/lib/study-prefs";

export interface QueueItem {
  row: StudyCardRow;
  /** 计时起点（本次显示时间，用于 response_time_ms） */
  shownAt: number;
  /** 新卡已进入延迟突击测试（首次教学后重插的那条）；测试后再评分不再重插，避免队尾反复出现 */
  tested?: boolean;
}

/**
 * 队列交错（P0-①）：每 ratio 张复习卡后插入 1 张新卡。
 * 复习卡耗尽后，剩余新卡先打乱再追加，避免大段新卡连续堆积在队尾。
 */
export function interleaveQueue(due: StudyCardRow[], fresh: StudyCardRow[], ratio = 5): StudyCardRow[] {
  if (ratio <= 0 || fresh.length === 0) return [...due, ...fresh];
  const result: StudyCardRow[] = [];
  let i = 0;
  let j = 0;
  while (i < due.length && j < fresh.length) {
    let count = 0;
    while (count < ratio && i < due.length) {
      result.push(due[i++]);
      count++;
    }
    result.push(fresh[j++]);
  }
  // 复习卡已用完：剩余新卡打乱后继续（已无复习卡可交错，至少避免顺序单调）
  if (i >= due.length && j < fresh.length) {
    result.push(...shuffleRows(fresh.slice(j)));
  } else {
    while (i < due.length) result.push(due[i++]);
  }
  return result;
}

/**
 * 按“相对时间偏移”估算插入位置（修复学习逻辑分析报告 #1/#4）：
 * 新 due 距离现在越近，插入位置越靠前（按每张卡约 10 秒估算）。
 * 不再使用绝对 due 与历史 due 比较——否则短间隔卡会被所有“已到期”卡排挤到队尾。
 */
export const SECONDS_PER_CARD = 10;

export function insertByOffset(
  queue: QueueItem[],
  item: QueueItem,
  currentIndex: number,
  secondsPerCard = SECONDS_PER_CARD
): void {
  const now = Date.now();
  const deltaSeconds = Math.max(0, (new Date(item.row.due).getTime() - now) / 1000);
  const cardOffset = Math.max(1, Math.ceil(deltaSeconds / secondsPerCard));
  const insertIndex = Math.min(queue.length, currentIndex + cardOffset);
  queue.splice(insertIndex, 0, item);
}

/** Fisher-Yates 洗牌（词库乱序学习） */
export function shuffleRows<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface StudyState {
  deckId: number | null;
  deckName: string;
  /** 当前学习标签（空 = 全部） */
  tagName: string;
  /** 是否仅重点词 */
  keyOnly: boolean;
  queue: QueueItem[];
  index: number;
  loading: boolean;
  error: string | null;
  /** 会话统计（reviewed/again/hard 均为独立卡片数，actions 为总评分次数） */
  stats: {
    reviewed: number;
    newDone: number;
    again: number;
    hard: number;
    actions: number;
    sessionStartTime: number;
    weakWords: string[];
    reviewedCardIds: number[];
    againCardIds: number[];
    hardCardIds: number[];
  };
  finished: boolean;

  loadQueue: (deckId: number, tag?: string, keyOnly?: boolean) => Promise<void>;
  /** 评分当前卡片，返回是否还有下一张；opts 支持 AI 测试来源与题目/答案记录 */
  rate: (
    grade: 1 | 2 | 3 | 4,
    responseTimeMs?: number,
    opts?: { source?: "review" | "quiz" | "ai_test"; aiQuestion?: string | null; aiAnswer?: string | null }
  ) => Promise<boolean>;
  markShown: () => void;
  reset: () => void;
}

export const useStudyStore = create<StudyState>((set, get) => ({
  deckId: null,
  deckName: "",
  tagName: "",
  keyOnly: false,
  queue: [],
  index: 0,
  loading: false,
  error: null,
  stats: { reviewed: 0, newDone: 0, again: 0, hard: 0, actions: 0, sessionStartTime: 0, weakWords: [], reviewedCardIds: [], againCardIds: [], hardCardIds: [] },
  finished: false,

  /** 加载今日队列：due 卡片 + 新卡配额内卡片（可按标签过滤） */
  loadQueue: async (deckId: number, tag?: string, keyOnly = false) => {
    set({ loading: true, error: null, finished: false });
    try {
      const deck = await db.getDeck(deckId);
      if (!deck) {
        set({ loading: false, error: "词库不存在" });
        return;
      }
      const now = new Date();
      const dayStartHour = parseDayStartHour(await db.getSetting("day_start"));
      const dayStart = getDayStartDate(dayStartHour, now);

      // 1. 到期卡片（Learning/Review/Relearning，可按标签/重点过滤，受每日复习上限约束）
      const reviewLimitRaw = await db.getSetting("daily_review_limit");
      const reviewLimit = reviewLimitRaw ? parseInt(reviewLimitRaw, 10) : 200;
      const todayReviewed = await db.countReviewsToday(dayStart.toISOString());
      const dueLimit = Math.max(0, reviewLimit - todayReviewed);
      const due = dueLimit > 0 ? await db.getDueCards(deckId, now.toISOString(), tag, keyOnly, dueLimit) : [];

      // 2. 新卡配额（配额按词库全局计，标签仅过滤选取范围）
      const learnedToday = await db.countNewLearnedToday(deckId, dayStart.toISOString());
      const newLimit = Math.max(0, deck.new_cards_per_day - learnedToday);
      const fresh = newLimit > 0 ? await db.getNewCards(deckId, newLimit, tag, keyOnly) : [];

      // 3. 队列编排：新卡按比例交错穿插到复习卡中（P0-①，默认每 5 张复习卡插 1 张新卡）
      const interleaveRatio = await getInterleaveRatio();
      let ordered = interleaveQueue(due, fresh, interleaveRatio);

      // 4. 词库乱序学习：按词库偏好打乱整个队列
      if (await getDeckShuffle(deckId)) {
        ordered = shuffleRows(ordered);
      }

      const queue: QueueItem[] = ordered.map((row) => ({ row, shownAt: Date.now() }));
      set({
        deckId,
        deckName: deck.name,
        tagName: tag ?? "",
        keyOnly,
        queue,
        index: 0,
        stats: { reviewed: 0, newDone: 0, again: 0, hard: 0, actions: 0, sessionStartTime: Date.now(), weakWords: [], reviewedCardIds: [], againCardIds: [], hardCardIds: [] },
        loading: false,
        finished: queue.length === 0,
      });
      // 记住本次学习上下文，供 Dashboard「继续上次」使用
      await saveLastStudyContext(deckId, tag, keyOnly).catch(() => {});
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  markShown: () => {
    const { queue, index } = get();
    if (index < queue.length) {
      const q = [...queue];
      q[index] = { ...q[index], shownAt: Date.now() };
      set({ queue: q });
    }
  },

  /** 评分当前卡片：FSRS 更新 + 记录 + 日报；Learning/Again 重插队列尾部 */
  rate: async (
    grade: 1 | 2 | 3 | 4,
    responseTimeMs?: number,
    opts?: { source?: "review" | "quiz" | "ai_test"; aiQuestion?: string | null; aiAnswer?: string | null }
  ) => {
    const { queue, index, deckId } = get();
    if (deckId === null || index >= queue.length) return false;

    const item = queue[index];
    const wasNew = item.row.state === State.New;
    const newFsrs = await applyReview(item.row.card_id, grade as Grade, {
      source: opts?.source ?? "review",
      responseTimeMs: responseTimeMs ?? (Date.now() - item.shownAt),
      aiQuestion: opts?.aiQuestion ?? null,
      aiAnswer: opts?.aiAnswer ?? null,
    });

    // 会话统计：reviewed/again/hard 均为独立卡片数（去重），actions 为总评分次数
    const prevStats = get().stats;
    const cardId = item.row.card_id;
    const isNewReview = !prevStats.reviewedCardIds.includes(cardId);
    const isNewAgain = grade === Rating.Again && !prevStats.againCardIds.includes(cardId);
    const isNewHard = grade === Rating.Hard && !prevStats.hardCardIds.includes(cardId);
    const stats = {
      reviewed: prevStats.reviewed + (isNewReview ? 1 : 0),
      newDone: prevStats.newDone + (wasNew && isNewReview ? 1 : 0),
      again: prevStats.again + (isNewAgain ? 1 : 0),
      hard: prevStats.hard + (isNewHard ? 1 : 0),
      actions: prevStats.actions + 1,
      sessionStartTime: prevStats.sessionStartTime,
      weakWords:
        grade === Rating.Again
          ? [...prevStats.weakWords, item.row.front]
          : prevStats.weakWords,
      reviewedCardIds: isNewReview ? [...prevStats.reviewedCardIds, cardId] : prevStats.reviewedCardIds,
      againCardIds: isNewAgain ? [...prevStats.againCardIds, cardId] : prevStats.againCardIds,
      hardCardIds: isNewHard ? [...prevStats.hardCardIds, cardId] : prevStats.hardCardIds,
    };

    // Learning 或 Again → 按 FSRS 新 due 二分插入正确位置（P0-②，不再一律插队尾）。
    // 已标记 tested 的卡（新卡突击测试后）即使仍处于 Learning 也不再重插当前会话，避免队尾反复出现。
    const reinsert =
      grade === Rating.Again || (newFsrs.state === State.Learning && !item.tested);
    let queueNext = [...get().queue];
    if (reinsert) {
      const updated: QueueItem = {
        ...item,
        tested: true,
        row: { ...item.row, ...fsrsCardToDBState(newFsrs) },
        shownAt: Date.now(),
      };
      queueNext[index] = updated;
      const [cur] = queueNext.splice(index, 1);
      insertByOffset(queueNext, cur, index);
    } else {
      // 非重插卡片也要回写最新 FSRS 状态，避免队列里保留过期状态
      queueNext[index] = {
        ...item,
        row: { ...item.row, ...fsrsCardToDBState(newFsrs) },
        shownAt: Date.now(),
      };
    }

    const nextIndex = index + 1;
    const finished = nextIndex >= queueNext.length;
    set({ queue: queueNext, index: nextIndex, stats, finished });
    return !finished;
  },

  reset: () => {
    set({ deckId: null, deckName: "", tagName: "", keyOnly: false, queue: [], index: 0, finished: false, error: null, stats: { reviewed: 0, newDone: 0, again: 0, hard: 0, actions: 0, sessionStartTime: 0, weakWords: [], reviewedCardIds: [], againCardIds: [], hardCardIds: [] } });
  },
}));
