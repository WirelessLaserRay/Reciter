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
      quote: getDailyQuote(),

      setDashboardData: (data) =>
        set((state) => ({
          ...state,
          ...data,
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
        quote: state.quote,
      }),
    }
  )
);
