import { create } from "zustand";
import { db, type StudyCardRow } from "@/lib/db";
import { applyReview } from "@/lib/review";
import { fsrsCardToDBState, Rating, State, type Grade } from "@/lib/fsrs";
import { getDayStartDate, parseDayStartHour } from "@/lib/day";
import { saveLastStudyContext } from "@/lib/study-prefs";

export interface QueueItem {
  row: StudyCardRow;
  /** 计时起点（本次显示时间，用于 response_time_ms） */
  shownAt: number;
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

      const queue: QueueItem[] = [...due, ...fresh].map((row) => ({ row, shownAt: Date.now() }));
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

    // 5. Learning 或 Again → 重插队列尾部（同 session 内重复）
    const reinsert = newFsrs.state === State.Learning || grade === Rating.Again;
    let queueNext = [...get().queue];
    if (reinsert) {
      // 更新为最新状态后移到队尾
      queueNext[index] = { ...item, row: { ...item.row, ...fsrsCardToDBState(newFsrs) }, shownAt: Date.now() };
      const [cur] = queueNext.splice(index, 1);
      queueNext.push(cur);
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
