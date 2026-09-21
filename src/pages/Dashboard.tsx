import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/db";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
import { useStudyStore } from "@/stores/useStudyStore";
import { useSyncStore } from "@/stores/useSyncStore";
import { getDayStartDate, getDayEndDate, parseDayStartHour, toDateKey } from "@/lib/day";
import { getLeechThreshold } from "@/lib/settings";
import {
  AI_TEST_INTERVAL_MS,
  getIgnoredTags,
  getLastAiTestAt,
  getLastStudyContext,
  type LastStudyContext,
} from "@/lib/study-prefs";
import { fetchDailyQuote, getDailyQuote, refreshDailyQuote } from "@/lib/daily-quotes";
import {
  generateAIOrchestrationAdvice,
  getSavedAIStudyPlan,
  getTodayOrchestratedPlan,
  type TodayOrchestratedPlan,
} from "@/lib/exam-planner";
import type { Deck } from "@/types";
import ExamPlanDialog from "@/components/study/ExamPlanDialog";
import {
  DashboardStatsGrid,
  DashboardQuoteArticle,
  DashboardOrchestratedCard,
  DashboardAiTestCard,
  DashboardDeckSections,
} from "./dashboard-view";

export default function Dashboard() {
  const dbReady = useDbStore((s) => s.ready);
  const navigate = useNavigate();
  const { decks, cardCounts, refresh } = useDeckStore();
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime);
  const loadQueue = useStudyStore((s) => s.loadQueue);
  const loadOrchestratedQueue = useStudyStore((s) => s.loadOrchestratedQueue);
  const [dueCount, setDueCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [lastContext, setLastContext] = useState<LastStudyContext | null>(null);
  const [dueByDeck, setDueByDeck] = useState<Record<number, number>>({});
  const [newByDeck, setNewByDeck] = useState<Record<number, number>>({});
  const [recommendedDeck, setRecommendedDeck] = useState<Deck | null>(null);
  const [weakCount, setWeakCount] = useState(0);
  const [aiTestDue, setAiTestDue] = useState(true);
  const [nextAiTestLabel, setNextAiTestLabel] = useState("");
  const [quote, setQuote] = useState(() => getDailyQuote());
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [aiPlan, setAiPlan] = useState("");
  const [currentDateKey, setCurrentDateKey] = useState(() => toDateKey(new Date()));

  // AI 辅助编排任务状态
  const [orchestratedPlan, setOrchestratedPlan] = useState<TodayOrchestratedPlan | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  // 跨午夜日界检测 / 窗口重新聚焦时自动刷新（确保每日一句与学习统计跨天自动更新）
  useEffect(() => {
    const checkDateChange = () => {
      const today = toDateKey(new Date());
      if (today !== currentDateKey) {
        setCurrentDateKey(today);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkDateChange();
      }
    };

    window.addEventListener("focus", checkDateChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(checkDateChange, 60_000);

    return () => {
      window.removeEventListener("focus", checkDateChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(timer);
    };
  }, [currentDateKey]);

  const loadDashboardData = useCallback(async () => {
    if (!dbReady) return;
    await refresh();
    const hour = parseDayStartHour(await db.getSetting("day_start"));
    const now = new Date();
    const dayStart = getDayStartDate(hour, now);
    const dayEnd = getDayEndDate(hour, now);
    const currentDecks = useDeckStore.getState().decks;
    const ignoredTags = await getIgnoredTags();
    const reviewLimitRaw = await db.getSetting("daily_review_limit");
    const reviewLimit = reviewLimitRaw ? parseInt(reviewLimitRaw, 10) : 200;
    const todayReviewed = await db.countReviewsToday(dayStart.toISOString());
    const remainingLimit = Math.max(0, reviewLimit - todayReviewed);
    const leech = await getLeechThreshold();
    const [due, fresh, last, weak, deckDue, deckNew, plan] = await Promise.all([
      db.getGlobalDueCount(dayEnd.toISOString(), ignoredTags),
      db.getGlobalNewCount(ignoredTags),
      getLastStudyContext(),
      db.getGlobalWeakCount(leech),
      db.getDeckDueCounts(dayEnd.toISOString(), ignoredTags),
      db.getDeckNewCounts(ignoredTags),
      getTodayOrchestratedPlan(currentDecks),
    ]);
    setDueCount(Math.min(due, remainingLimit));
    setNewCount(fresh);
    setLastContext(last);
    setWeakCount(weak);
    setDueByDeck(deckDue);
    setNewByDeck(deckNew);
    setOrchestratedPlan(plan);
    setQuote(await fetchDailyQuote());
    setAiPlan(await getSavedAIStudyPlan());

    const lastAiTest = await getLastAiTestAt();
    const aiDue = lastAiTest === 0 || Date.now() - lastAiTest >= AI_TEST_INTERVAL_MS;
    setAiTestDue(aiDue);
    if (!aiDue) {
      const next = new Date(lastAiTest + AI_TEST_INTERVAL_MS);
      setNextAiTestLabel(
        next.toLocaleString("zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }

    // 推荐优先级：优先推荐有到期复习卡的词库；若暂无到期，则推荐有新词待学的词库
    const decksWithDue = currentDecks
      .filter((d) => (deckDue[d.id] ?? 0) > 0)
      .sort((a, b) => (deckDue[b.id] ?? 0) - (deckDue[a.id] ?? 0));
    const decksWithNew = currentDecks
      .filter((d) => (deckNew[d.id] ?? 0) > 0)
      .sort((a, b) => (deckNew[b.id] ?? 0) - (deckNew[a.id] ?? 0));
    const top = decksWithDue[0] ?? decksWithNew[0] ?? null;
    setRecommendedDeck(top);
  }, [dbReady, refresh]);

  useEffect(() => {
    loadDashboardData().catch(() => {});
  }, [loadDashboardData, currentDateKey, lastSyncTime]);

  const handleStartOrchestratedStudy = async () => {
    if (!orchestratedPlan) return;
    useStudyStore.getState().reset();
    await loadOrchestratedQueue({
      deckIds: orchestratedPlan.deckIds,
      ignoredTags: orchestratedPlan.ignoredTags,
      targetNew: orchestratedPlan.targetNew,
      targetReview: orchestratedPlan.targetReview,
      title: `${orchestratedPlan.examTitle} · 今日任务`,
    });
    navigate("/study");
  };

  const handleGenerateAdvice = async () => {
    if (!orchestratedPlan) return;
    setAdviceLoading(true);
    setAdviceError(null);
    try {
      const advice = await generateAIOrchestrationAdvice(orchestratedPlan);
      setOrchestratedPlan((prev) =>
        prev ? { ...prev, advice, aiGenerated: true } : null
      );
    } catch (e) {
      setAdviceError(String(e));
    } finally {
      setAdviceLoading(false);
    }
  };

  const startStudy = async (deckId: number, tag?: string, keyOnly?: boolean) => {
    useStudyStore.getState().reset();
    await loadQueue(deckId, tag, keyOnly);
    navigate("/study");
  };

  const aiTestDeck =
    recommendedDeck ?? decks.find((d) => (cardCounts[d.id] ?? 0) > 0) ?? null;
  const startAiTest = () => {
    if (!aiTestDeck) return;
    navigate(`/study?quiz=${aiTestDeck.id}&ai=1&smart=1&record=1`);
  };

  const lastDeck = lastContext
    ? decks.find((d) => d.id === lastContext.deckId) ?? null
    : null;
  const otherDecks = decks.filter((d) => d.id !== recommendedDeck?.id);

  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const handleRefreshQuote = async () => {
    setQuoteRefreshing(true);
    try {
      setQuote(await refreshDailyQuote());
    } finally {
      setQuoteRefreshing(false);
    }
  };

  const deckCount = decks.length;
  const cardTotal = Object.values(cardCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pb-1">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">今日概览</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{today}</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <DashboardStatsGrid
        dueCount={dueCount}
        newCount={newCount}
        deckCount={deckCount}
        cardTotal={cardTotal}
      />

      {/* 每日一句与每日一文并排响应式展示 */}
      <DashboardQuoteArticle
        quote={quote}
        quoteRefreshing={quoteRefreshing}
        onRefreshQuote={handleRefreshQuote}
      />

      {/* AI 辅助备考学习编排 */}
      <DashboardOrchestratedCard
        orchestratedPlan={orchestratedPlan}
        aiPlan={aiPlan}
        adviceLoading={adviceLoading}
        adviceError={adviceError}
        onOpenPlanDialog={() => setPlanDialogOpen(true)}
        onStartOrchestratedStudy={handleStartOrchestratedStudy}
        onGenerateAdvice={handleGenerateAdvice}
      />

      {/* AI 智能测试 */}
      <DashboardAiTestCard
        aiTestDue={aiTestDue}
        nextAiTestLabel={nextAiTestLabel}
        aiTestDeck={aiTestDeck}
        onStartAiTest={startAiTest}
      />

      {/* 词库、上次复习、弱词及今日计划卡片 */}
      <DashboardDeckSections
        recommendedDeck={recommendedDeck}
        lastDeck={lastDeck}
        lastContext={lastContext}
        otherDecks={otherDecks}
        decks={decks}
        dueByDeck={dueByDeck}
        newByDeck={newByDeck}
        weakCount={weakCount}
        dueCount={dueCount}
        newCount={newCount}
        onStartStudy={startStudy}
      />

      {/* 备考编排弹窗 */}
      <ExamPlanDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        onSaved={loadDashboardData}
      />
    </div>
  );
}
