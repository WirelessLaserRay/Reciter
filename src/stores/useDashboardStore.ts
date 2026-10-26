import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Deck } from "@/types";
import type { LastStudyContext } from "@/lib/study-prefs";
import type { TodayOrchestratedPlan } from "@/lib/exam-planner";
import { getDailyQuote, type DailyQuote } from "@/lib/daily-quotes";

export interface DashboardState {
  dueCount: number;
  newCount: number;
  weakCount: number;
  lastContext: LastStudyContext | null;
  dueByDeck: Record<number, number>;
  newByDeck: Record<number, number>;
  recommendedDeck: Deck | null;
  aiTestDue: boolean;
  nextAiTestLabel: string;
  aiPlan: string;
  orchestratedPlan: TodayOrchestratedPlan | null;
  isLoaded: boolean;
  lastUpdatedAt: number;
  quote: DailyQuote;

  setDashboardData: (
    data: Partial<Omit<DashboardState, "setDashboardData" | "setOrchestratedPlan" | "setQuote">>
  ) => void;
  setOrchestratedPlan: (
    plan:
      | TodayOrchestratedPlan
      | null
      | ((prev: TodayOrchestratedPlan | null) => TodayOrchestratedPlan | null)
  ) => void;
  setQuote: (quote: DailyQuote) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      dueCount: 0,
      newCount: 0,
      weakCount: 0,
      lastContext: null,
      dueByDeck: {},
      newByDeck: {},
      recommendedDeck: null,
      aiTestDue: true,
      nextAiTestLabel: "",
      aiPlan: "",
      orchestratedPlan: null,
      isLoaded: false,
      lastUpdatedAt: 0,
      quote: getDailyQuote(),

      setDashboardData: (data) =>
        set((state) => ({
          ...state,
          ...data,
          lastUpdatedAt: Date.now(),
          isLoaded: true,
        })),

      setOrchestratedPlan: (plan) =>
        set((state) => ({
          ...state,
          orchestratedPlan:
            typeof plan === "function" ? plan(state.orchestratedPlan) : plan,
        })),

      setQuote: (quote) =>
        set((state) => {
          if (
            state.quote.text === quote.text &&
            state.quote.translation === quote.translation &&
            state.quote.author === quote.author &&
            state.quote.source === quote.source
          ) {
            return state;
          }
          return { ...state, quote };
        }),
    }),
    {
      name: "reciter-dashboard-cache",
      partialize: (state) => ({
        dueCount: state.dueCount,
        newCount: state.newCount,
        weakCount: state.weakCount,
        lastContext: state.lastContext,
        dueByDeck: state.dueByDeck,
        newByDeck: state.newByDeck,
        recommendedDeck: state.recommendedDeck,
        aiTestDue: state.aiTestDue,
        nextAiTestLabel: state.nextAiTestLabel,
        aiPlan: state.aiPlan,
        orchestratedPlan: state.orchestratedPlan,
        isLoaded: state.isLoaded,
        lastUpdatedAt: state.lastUpdatedAt,
        quote: state.quote,
      }),
    }
  )
);

/** 检查当前看板缓存是否处于新鲜度有效期（默认 60 秒） */
export function isDashboardFresh(maxAgeMs = 60_000): boolean {
  const { isLoaded, lastUpdatedAt } = useDashboardStore.getState();
  return isLoaded && (lastUpdatedAt || 0) > 0 && Date.now() - (lastUpdatedAt || 0) < maxAgeMs;
}
