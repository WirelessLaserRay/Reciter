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
 * 队列交错（P0-①）：每 ratio 张复习卡后插入 1 张新卡，剩余新卡追加到队尾。
 * 交错练习比分块练习的长期记忆保留高约 20-40%（Rohrer & Taylor, 2007）。
 */
export function interleaveQueue(due: StudyCardRow[], fresh: StudyCardRow[], ratio = 5): StudyCardRow[] {
  if (ratio <= 0 || fresh.length === 0) return [...due, ...fresh];
  const result: StudyCardRow[] = [];
  let fi = 0;
  for (let i = 0; i < due.length; i++) {
    result.push(due[i]);
    if ((i + 1) % ratio === 0 && fi < fresh.length) {
      result.push(fresh[fi++]);
    }
  }
  while (fi < fresh.length) result.push(fresh[fi++]);
  return result;
}

/**
 * 按 FSRS due 时间二分插入（P0-②）：
 * Learning/Again 卡的短间隔调度（如 1 分钟）不会被"插到队尾"拖成 30 分钟后。
 */
export function insertByDue(queue: QueueItem[], item: QueueItem): void {
  const due = new Date(item.row.due).getTime();
  let lo = 0;
  let hi = queue.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(queue[mid].row.due).getTime() <= due) lo = mid + 1;
    else hi = mid;
  }
  queue.splice(lo, 0, item);
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
  /** 会话统计 */
  stats: {
    reviewed: number;
    newDone: number;
    again: number;
    hard: number;
    sessionStartTime: number;
    weakWords: string[];
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
  stats: { reviewed: 0, newDone: 0, again: 0, hard: 0, sessionStartTime: 0, weakWords: [] },
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
        stats: { reviewed: 0, newDone: 0, again: 0, hard: 0, sessionStartTime: Date.now(), weakWords: [] },
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

    // 会话统计
    const stats = {
      reviewed: get().stats.reviewed + 1,
      newDone: get().stats.newDone + (wasNew ? 1 : 0),
      again: get().stats.again + (grade === Rating.Again ? 1 : 0),
      hard: get().stats.hard + (grade === Rating.Hard ? 1 : 0),
      sessionStartTime: get().stats.sessionStartTime,
      weakWords:
        grade === Rating.Again
          ? [...get().stats.weakWords, item.row.front]
          : get().stats.weakWords,
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
      insertByDue(queueNext, cur);
    } else {
      queueNext[index] = { ...item, shownAt: Date.now() };
    }

    const nextIndex = index + 1;
    const finished = nextIndex >= queueNext.length;
    set({ queue: queueNext, index: nextIndex, stats, finished });
    return !finished;
  },

  reset: () => {
    set({ deckId: null, deckName: "", tagName: "", keyOnly: false, queue: [], index: 0, finished: false, error: null, stats: { reviewed: 0, newDone: 0, again: 0, hard: 0, sessionStartTime: 0, weakWords: [] } });
  },
}));
