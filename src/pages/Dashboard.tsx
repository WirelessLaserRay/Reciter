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
} from "@/lib/study-prefs";
import { fetchDailyQuote, refreshDailyQuote } from "@/lib/daily-quotes";
import {
  generateAIOrchestrationAdvice,
  getSavedAIStudyPlan,
  getTodayOrchestratedPlan,
} from "@/lib/exam-planner";
import { useDashboardStore } from "@/stores/useDashboardStore";
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

  // 全局持久化看板状态（切换页面切回即刻秒开，名言与数据绝不闪跳）
  const {
    dueCount,
    newCount,
    weakCount,
    lastContext,
    dueByDeck,
    newByDeck,
    recommendedDeck,
    aiTestDue,
    nextAiTestLabel,
    aiPlan,
    orchestratedPlan,
    quote,
    setQuote,
    setDashboardData,
    setOrchestratedPlan,
  } = useDashboardStore();

  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [currentDateKey, setCurrentDateKey] = useState(() => toDateKey(new Date()));

  // 弹窗与交互局态
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

    let currentDecks = useDeckStore.getState().decks;
    if (currentDecks.length === 0) {
      await refresh();
      currentDecks = useDeckStore.getState().decks;
    } else {
      // 已有词库数据时后台静默刷新，不阻塞首屏
      refresh().catch(() => {});
    }

    // 1. 并发获取基础配置与参数
    const [
      hourRaw,
      ignoredTags,
      reviewLimitRaw,
      leech,
      aiPlanSaved,
      lastAiTest,
    ] = await Promise.all([
      db.getSetting("day_start"),
      getIgnoredTags(),
      db.getSetting("daily_review_limit"),
      getLeechThreshold(),
      getSavedAIStudyPlan(),
      getLastAiTestAt(),
    ]);

    const hour = parseDayStartHour(hourRaw);
    const now = new Date();
    const dayStart = getDayStartDate(hour, now);
    const dayEnd = getDayEndDate(hour, now);
    const reviewLimit = reviewLimitRaw ? parseInt(reviewLimitRaw, 10) : 200;

    // 2. 并发获取各项学习指标与统计
    const [due, fresh, last, weak, deckDue, deckNew, plan, todayReviewed] = await Promise.all([
      db.getGlobalDueCount(dayEnd.toISOString(), ignoredTags),
      db.getGlobalNewCount(ignoredTags),
      getLastStudyContext(),
      db.getGlobalWeakCount(leech),
      db.getDeckDueCounts(dayEnd.toISOString(), ignoredTags),
      db.getDeckNewCounts(ignoredTags),
      getTodayOrchestratedPlan(currentDecks),
      db.countReviewsToday(dayStart.toISOString()),
    ]);

    const remainingLimit = Math.max(0, reviewLimit - todayReviewed);

    const aiDue = lastAiTest === 0 || Date.now() - lastAiTest >= AI_TEST_INTERVAL_MS;
    let nextAiTestLabel = "";
    if (!aiDue) {
      const next = new Date(lastAiTest + AI_TEST_INTERVAL_MS);
      nextAiTestLabel = next.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // 推荐优先级：优先推荐有到期复习卡的词库；若暂无到期，则推荐有新词待学的词库
    const decksWithDue = currentDecks
      .filter((d) => (deckDue[d.id] ?? 0) > 0)
      .sort((a, b) => (deckDue[b.id] ?? 0) - (deckDue[a.id] ?? 0));
    const decksWithNew = currentDecks
      .filter((d) => (deckNew[d.id] ?? 0) > 0)
      .sort((a, b) => (deckNew[b.id] ?? 0) - (deckNew[a.id] ?? 0));
    const top = decksWithDue[0] ?? decksWithNew[0] ?? null;

    setDashboardData({
      dueCount: Math.min(due, remainingLimit),
      newCount: fresh,
      lastContext: last,
      weakCount: weak,
      dueByDeck: deckDue,
      newByDeck: deckNew,
      orchestratedPlan: plan,
      aiPlan: aiPlanSaved,
      aiTestDue: aiDue,
      nextAiTestLabel,
      recommendedDeck: top,
    });

    // 每日一句后台静默拉取，绝不阻断界面秒开
    void fetchDailyQuote()
      .then((q) => setQuote(q))
      .catch(() => {});
  }, [dbReady, refresh, setDashboardData]);

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
