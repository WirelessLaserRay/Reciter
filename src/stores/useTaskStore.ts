import { create } from "zustand";
import { db } from "@/lib/db";
import { fetchPhonetic } from "@/lib/dictionary";
import { aiSplitMeaning } from "@/lib/vocab";
import { matchExamplesForCard, setCardExamplesToTags, getCardExamples } from "@/lib/card-examples";

export type TaskType = "phonetic" | "meaning_split" | "match_examples";
export type TaskStatus = "running" | "completed" | "error" | "cancelled";

export interface TaskItem {
  id: string;
  type: TaskType;
  deckId: number;
  deckName: string;
  title: string;
  status: TaskStatus;
  done: number;
  total: number;
  currentWord?: string;
  message?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

interface TaskStore {
  tasks: Record<string, TaskItem>;
  startPhoneticEnrichment: (deckId: number, deckName: string) => Promise<void>;
  startMeaningSplit: (deckId: number, deckName: string) => Promise<void>;
  startExampleMatching: (deckId: number, deckName: string, forceAll?: boolean) => Promise<void>;
  cancelTask: (taskId: string) => void;
  clearTask: (taskId: string) => void;
  getTask: (type: TaskType, deckId: number) => TaskItem | undefined;
  getActiveTasks: () => TaskItem[];
}

const abortControllers = new Map<string, AbortController>();

function notifyDeckUpdated(deckId: number) {
  try {
    window.dispatchEvent(new CustomEvent("reciter:deck-data-updated", { detail: { deckId } }));
  } catch {
    // ignore
  }
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: {},

  getTask: (type: TaskType, deckId: number) => {
    const id = `${type}_${deckId}`;
    return get().tasks[id];
  },

  getActiveTasks: () => {
    return Object.values(get().tasks).filter((t) => t.status === "running");
  },

  cancelTask: (taskId: string) => {
    const ctrl = abortControllers.get(taskId);
    if (ctrl) {
      ctrl.abort();
      abortControllers.delete(taskId);
    }
    set((state) => {
      const existing = state.tasks[taskId];
      if (!existing) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...existing,
            status: "cancelled",
            message: "任务已取消",
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  clearTask: (taskId: string) => {
    set((state) => {
      const copy = { ...state.tasks };
      delete copy[taskId];
      return { tasks: copy };
    });
  },

  startPhoneticEnrichment: async (deckId: number, deckName: string) => {
    const id = `phonetic_${deckId}`;
    const current = get().tasks[id];
    if (current && current.status === "running") return;

    const controller = new AbortController();
    abortControllers.set(id, controller);

    try {
      const cards = await db.getCardsByDeck(deckId);
      const missing = cards.filter((c) => !c.phonetic);
      if (missing.length === 0) {
        set((state) => ({
          tasks: {
            ...state.tasks,
            [id]: {
              id,
              type: "phonetic",
              deckId,
              deckName,
              title: "补齐音标",
              status: "completed",
              done: 0,
              total: 0,
              message: "词库中所有卡片均已有音标",
              startedAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
        }));
        return;
      }

      set((state) => ({
        tasks: {
          ...state.tasks,
          [id]: {
            id,
            type: "phonetic",
            deckId,
            deckName,
            title: "补齐音标",
            status: "running",
            done: 0,
            total: missing.length,
            message: `开始为「${deckName}」补齐音标...`,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      }));

      let doneCount = 0;
      let filledCount = 0;
      const concurrency = 3;

      for (let i = 0; i < missing.length; i += concurrency) {
        if (controller.signal.aborted) break;
        const batch = missing.slice(i, i + concurrency);

        await Promise.all(
          batch.map(async (card) => {
            if (controller.signal.aborted) return;
            try {
              const phonetic = await fetchPhonetic(card.front);
              if (phonetic && !controller.signal.aborted) {
                await db.updateCard(card.id, { phonetic });
                filledCount++;
              }
            } catch {
              // 单个单词查询失败跳过
            } finally {
              doneCount++;
              set((state) => {
                const t = state.tasks[id];
                if (!t || t.status !== "running") return state;
                return {
                  tasks: {
                    ...state.tasks,
                    [id]: {
                      ...t,
                      done: doneCount,
                      currentWord: card.front,
                      updatedAt: Date.now(),
                    },
                  },
                };
              });
            }
          })
        );

        notifyDeckUpdated(deckId);
      }

      if (!controller.signal.aborted) {
        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: "completed",
                done: missing.length,
                currentWord: undefined,
                message: filledCount > 0 ? `已成功补齐 ${filledCount} 个单词音标` : "未找到可补齐的新音标",
                updatedAt: Date.now(),
              },
            },
          };
        });
        notifyDeckUpdated(deckId);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: "error",
                error: String(err),
                message: "音标补齐过程发生错误",
                updatedAt: Date.now(),
              },
            },
          };
        });
      }
    } finally {
      abortControllers.delete(id);
    }
  },

  startMeaningSplit: async (deckId: number, deckName: string) => {
    const id = `meaning_split_${deckId}`;
    const current = get().tasks[id];
    if (current && current.status === "running") return;

    const controller = new AbortController();
    abortControllers.set(id, controller);

    try {
      const cards = await db.getCardsByDeck(deckId);
      if (cards.length === 0) return;

      set((state) => ({
        tasks: {
          ...state.tasks,
          [id]: {
            id,
            type: "meaning_split",
            deckId,
            deckName,
            title: "释义分类",
            status: "running",
            done: 0,
            total: cards.length,
            message: `正在为「${deckName}」进行 AI 释义主次分类...`,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      }));

      let doneCount = 0;
      let splitCount = 0;

      for (const card of cards) {
        if (controller.signal.aborted) break;

        try {
          const { primary, secondary } = await aiSplitMeaning(card.front, card.back);
          if (!controller.signal.aborted) {
            await db.updateCard(card.id, {
              meaning_primary: primary,
              meaning_secondary: secondary,
            });
            splitCount++;
          }
        } catch {
          // 单张跳过
        }

        doneCount++;
        set((state) => {
          const t = state.tasks[id];
          if (!t || t.status !== "running") return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                done: doneCount,
                currentWord: card.front,
                updatedAt: Date.now(),
              },
            },
          };
        });

        if (doneCount % 5 === 0) {
          notifyDeckUpdated(deckId);
        }
      }

      if (!controller.signal.aborted) {
        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: "completed",
                done: cards.length,
                currentWord: undefined,
                message: `已完成 ${splitCount} 张卡片的释义分类整理`,
                updatedAt: Date.now(),
              },
            },
          };
        });
        notifyDeckUpdated(deckId);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: "error",
                error: String(err),
                message: "释义分类过程发生错误",
                updatedAt: Date.now(),
              },
            },
          };
        });
      }
    } finally {
      abortControllers.delete(id);
    }
  },

  startExampleMatching: async (deckId: number, deckName: string, forceAll = false) => {
    const id = `match_examples_${deckId}`;
    const current = get().tasks[id];
    if (current && current.status === "running") return;

    const controller = new AbortController();
    abortControllers.set(id, controller);

    try {
      const allCards = await db.getCardsByDeck(deckId);
      const targetCards = forceAll
        ? allCards
        : allCards.filter((c) => getCardExamples(c.tags).length === 0);

      if (targetCards.length === 0) {
        set((state) => ({
          tasks: {
            ...state.tasks,
            [id]: {
              id,
              type: "match_examples",
              deckId,
              deckName,
              title: "匹配例句",
              status: "completed",
              done: 0,
              total: 0,
              message: "所有卡片均已包含匹配例句",
              startedAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
        }));
        return;
      }

      set((state) => ({
        tasks: {
          ...state.tasks,
          [id]: {
            id,
            type: "match_examples",
            deckId,
            deckName,
            title: "匹配例句",
            status: "running",
            done: 0,
            total: targetCards.length,
            message: `正在为「${deckName}」匹配多释义例句（最多3句）...`,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      }));

      let doneCount = 0;
      let matchedCount = 0;

      for (const card of targetCards) {
        if (controller.signal.aborted) break;

        try {
          const examples = await matchExamplesForCard(card);
          if (examples.length > 0 && !controller.signal.aborted) {
            const updatedTags = setCardExamplesToTags(card.tags, examples);
            await db.updateCard(card.id, {
              tags: JSON.stringify(updatedTags),
            });
            matchedCount++;
          }
        } catch {
          // 单张失败跳过
        }

        doneCount++;
        set((state) => {
          const t = state.tasks[id];
          if (!t || t.status !== "running") return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                done: doneCount,
                currentWord: card.front,
                updatedAt: Date.now(),
              },
            },
          };
        });

        if (doneCount % 3 === 0) {
          notifyDeckUpdated(deckId);
        }
      }

      if (!controller.signal.aborted) {
        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: "completed",
                done: targetCards.length,
                currentWord: undefined,
                message: `例句匹配完成，已为 ${matchedCount} 张卡片写入多释义例句标签`,
                updatedAt: Date.now(),
              },
            },
          };
        });
        notifyDeckUpdated(deckId);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: "error",
                error: String(err),
                message: "例句匹配过程发生错误",
                updatedAt: Date.now(),
              },
            },
          };
        });
      }
    } finally {
      abortControllers.delete(id);
    }
  },
}));
