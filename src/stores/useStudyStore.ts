import { create } from "zustand";
import { db, type StudyCardRow } from "@/lib/db";
import { fsrsCardToDBState, reviewCard, Rating, State, type Grade } from "@/lib/fsrs";
import type { CardState } from "@/types";
import { getDayStartDate, parseDayStartHour, todayKey } from "@/lib/day";

/** 读取用户设置的目标记忆率（未设置返回 undefined → 用默认值） */
export async function getEffectiveRetention(): Promise<number | undefined> {
  const raw = await db.getSetting("desired_retention");
  const v = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(v) ? v : undefined;
}

export interface QueueItem {
  row: StudyCardRow;
  /** 计时起点（本次显示时间，用于 response_time_ms） */
  shownAt: number;
}

interface StudyState {
  deckId: number | null;
  deckName: string;
  queue: QueueItem[];
  index: number;
  loading: boolean;
  error: string | null;
  /** 会话统计 */
  stats: { reviewed: number; newDone: number; again: number };
  finished: boolean;

  loadQueue: (deckId: number) => Promise<void>;
  /** 评分当前卡片，返回是否还有下一张 */
  rate: (grade: 1 | 2 | 3 | 4, responseTimeMs?: number) => Promise<boolean>;
  markShown: () => void;
  reset: () => void;
}

export const useStudyStore = create<StudyState>((set, get) => ({
  deckId: null,
  deckName: "",
  queue: [],
  index: 0,
  loading: false,
  error: null,
  stats: { reviewed: 0, newDone: 0, again: 0 },
  finished: false,

  /** 加载今日队列：due 卡片 + 新卡配额内卡片 */
  loadQueue: async (deckId: number) => {
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

      // 1. 到期卡片（Learning/Review/Relearning）
      const due = await db.getDueCards(deckId, now.toISOString());

      // 2. 新卡配额
      const learnedToday = await db.countNewLearnedToday(deckId, dayStart.toISOString());
      const newLimit = Math.max(0, deck.new_cards_per_day - learnedToday);
      const fresh = newLimit > 0 ? await db.getNewCards(deckId, newLimit) : [];

      const queue: QueueItem[] = [...due, ...fresh].map((row) => ({ row, shownAt: Date.now() }));
      set({
        deckId,
        deckName: deck.name,
        queue,
        index: 0,
        stats: { reviewed: 0, newDone: 0, again: 0 },
        loading: false,
        finished: queue.length === 0,
      });
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
  rate: async (grade: 1 | 2 | 3 | 4, responseTimeMs?: number) => {
    const { queue, index, deckId } = get();
    if (deckId === null || index >= queue.length) return false;

    const item = queue[index];
    const state: CardState = {
      card_id: item.row.card_id,
      state: item.row.state,
      stability: item.row.stability,
      difficulty: item.row.difficulty,
      due: item.row.due,
      last_review: item.row.last_review,
      elapsed_days: item.row.elapsed_days,
      scheduled_days: item.row.scheduled_days,
      reps: item.row.reps,
      lapses: item.row.lapses,
      learning_steps: item.row.learning_steps,
      desired_retention: item.row.desired_retention,
      algorithm_version: item.row.algorithm_version,
    };

    const wasNew = state.state === State.New;
    const now = new Date();
    const retention = await getEffectiveRetention();
    const { card: newFsrs } = await reviewCard(state, grade as Grade, now, retention);

    // 1. 持久化新状态
    await db.updateCardState(item.row.card_id, fsrsCardToDBState(newFsrs));

    // 2. 复习记录
    await db.addReviewLog({
      card_id: item.row.card_id,
      grade,
      response_time_ms: responseTimeMs ?? (now.getTime() - item.shownAt),
      source: "review",
    });

    // 3. 日报
    const hour = parseDayStartHour(await db.getSetting("day_start"));
    await db.updateDailyStats(todayKey(hour, now), {
      new_count: wasNew ? 1 : 0,
      review_count: 1,
      again_count: grade === Rating.Again ? 1 : 0,
    });

    // 4. 会话统计
    const stats = {
      reviewed: get().stats.reviewed + 1,
      newDone: get().stats.newDone + (wasNew ? 1 : 0),
      again: get().stats.again + (grade === Rating.Again ? 1 : 0),
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
    set({ deckId: null, deckName: "", queue: [], index: 0, finished: false, error: null, stats: { reviewed: 0, newDone: 0, again: 0 } });
  },
}));
