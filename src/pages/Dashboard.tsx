import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileUp,
  GraduationCap,
  Newspaper,
  PlayCircle,
  Quote,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Tag,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
import { useStudyStore } from "@/stores/useStudyStore";
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
  formatCompactList,
  type TodayOrchestratedPlan,
} from "@/lib/exam-planner";
import { useSyncStore } from "@/stores/useSyncStore";
import type { Deck } from "@/types";
import ExamPlanDialog from "@/components/study/ExamPlanDialog";
import MarkdownView from "@/components/common/MarkdownView";
import { cn } from "@/lib/utils";

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
      setNextAiTestLabel(next.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
    }

    // 推荐优先级：优先推荐有到期复习卡的词库；若暂无到期，则推荐有新词待学的词库（避免新导入词库无法被推荐）
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
      setOrchestratedPlan((prev) => (prev ? { ...prev, advice, aiGenerated: true } : null));
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

  const aiTestDeck = recommendedDeck ?? decks.find((d) => (cardCounts[d.id] ?? 0) > 0) ?? null;
  const startAiTest = () => {
    if (!aiTestDeck) return;
    navigate(`/study?quiz=${aiTestDeck.id}&ai=1&smart=1&record=1`);
  };

  const lastDeck = lastContext ? decks.find((d) => d.id === lastContext.deckId) ?? null : null;
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

  const STATS = [
    { label: "今日待复习", value: String(dueCount), icon: CalendarClock, hint: "今日到期 · 配额内" },
    { label: "新卡待学", value: String(newCount), icon: GraduationCap, hint: "FSRS state = New" },
    { label: "词库总数", value: String(deckCount), icon: BookOpen, hint: "本地 SQLite" },
    { label: "卡片总数", value: String(cardTotal), icon: GraduationCap, hint: "本地 SQLite" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pb-1">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">今日概览</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{today}</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label} className="transition-all hover:border-border hover:shadow-xs">
            <CardContent className="flex items-center gap-3 p-3.5 sm:p-4">
              <div className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-4 sm:size-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-bold tracking-tight">{s.value}</div>
                <div className="truncate text-xs font-medium text-muted-foreground">{s.label}</div>
                <div className="truncate text-[10px] text-muted-foreground/75 mt-0.5">{s.hint}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 每日一句与每日一文并排响应式展示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 每日一句 */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Quote className="size-4 text-primary" />
              每日一句
              <span className="text-[10px] font-normal text-muted-foreground">
                {quote.source === "zenquotes" ? "ZenQuotes" : quote.source === "quotable" ? "Quotable" : "本地"}
              </span>
            </CardTitle>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleRefreshQuote} disabled={quoteRefreshing}>
              <RotateCcw className={cn("size-3.5 mr-1", quoteRefreshing && "animate-spin")} />
              换一句
            </Button>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center py-2">
            <p className="text-sm font-medium italic leading-relaxed text-foreground">“{quote.text}”</p>
            {quote.translation && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-normal">
                {quote.translation}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground text-right">— {quote.author}</p>
          </CardContent>
        </Card>

        {/* 每日一文 */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Newspaper className="size-4 text-primary" />
              每日一文
            </CardTitle>
            <CardDescription className="text-xs">精选外媒新闻源，支持 AI 出题与生词拆解</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              沉浸式精读，双语对照与生词一键加入词库
            </p>
            <Button size="sm" asChild className="shrink-0 text-xs h-8">
              <Link to="/daily-article">
                <Newspaper className="size-3.5 mr-1" />
                去阅读
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* AI 辅助备考学习编排 */}
      {orchestratedPlan ? (
        <Card className="border-blue-500/40 bg-gradient-to-br from-blue-500/5 via-background to-primary/5 shadow-xs">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <GraduationCap className="size-5 text-blue-600 dark:text-blue-400" />
                <CardTitle className="text-lg font-bold">
                  {orchestratedPlan.examTitle} · 倒计时 {orchestratedPlan.daysUntilExam} 天
                </CardTitle>
                <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400">
                  目标日期 {orchestratedPlan.examDate}
                </Badge>
                <Badge variant="outline" className="text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  平均稳定 {orchestratedPlan.avgStability} 天 · 掌握率 {orchestratedPlan.masteryRate}%
                </Badge>
                {orchestratedPlan.inSprintPhase && (
                  <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30">
                    冲刺期 (新词暂停)
                  </Badge>
                )}
              </div>
              {/* 优雅紧凑列写：目标词库与排除标签 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-xs">
                {/* 目标词库 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <BookOpen className="size-3 text-blue-500 shrink-0" />
                    目标词库:
                  </span>
                  {orchestratedPlan.deckIds.length === 0 ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-xs font-normal bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      全部词库
                    </Badge>
                  ) : (
                    (() => {
                      const deckList = orchestratedPlan.selectedDeckNames?.length
                        ? orchestratedPlan.selectedDeckNames
                        : orchestratedPlan.deckNames.split("、").filter(Boolean);
                      const deckSummary = formatCompactList(deckList, 2);
                      return (
                        <>
                          {deckSummary.displayed.map((name) => (
                            <Badge
                              key={name}
                              variant="outline"
                              className="px-2 py-0.5 text-xs font-normal max-w-[160px] truncate bg-background/70 border-blue-500/30"
                              title={name}
                            >
                              {name}
                            </Badge>
                          ))}
                          {deckSummary.remainingCount > 0 && (
                            <Badge
                              variant="secondary"
                              className="px-2 py-0.5 text-xs font-normal text-muted-foreground cursor-help hover:bg-muted"
                              title={`全部 ${deckSummary.totalCount} 个目标词库：\n${deckSummary.fullText}`}
                            >
                              ……等 {deckSummary.totalCount} 个词库
                            </Badge>
                          )}
                        </>
                      );
                    })()
                  )}
                </div>

                {/* 排除标签 */}
                {orchestratedPlan.ignoredTags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Tag className="size-3 text-amber-500 shrink-0" />
                      排除标签:
                    </span>
                    {(() => {
                      const tagSummary = formatCompactList(orchestratedPlan.ignoredTags, 2);
                      return (
                        <>
                          {tagSummary.displayed.map((t) => (
                            <Badge
                              key={t}
                              variant="secondary"
                              className="px-2 py-0.5 text-xs font-normal border-destructive/30 bg-destructive/10 text-destructive max-w-[130px] truncate"
                              title={t}
                            >
                              {t}
                            </Badge>
                          ))}
                          {tagSummary.remainingCount > 0 && (
                            <Badge
                              variant="secondary"
                              className="px-2 py-0.5 text-xs font-normal border-destructive/20 bg-destructive/15 text-destructive/90 cursor-help hover:bg-destructive/20"
                              title={`全部 ${tagSummary.totalCount} 个排除规则：\n${tagSummary.fullText}`}
                            >
                              ……等 {tagSummary.totalCount} 条规则
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPlanDialogOpen(true)}
              className="shrink-0 text-xs gap-1.5"
            >
              <Settings2 className="size-3.5" />
              调整编排
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* 熟练度全景进度与阶段提示 */}
            <div className="rounded-lg bg-background/80 border p-3 shadow-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Target className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span>词汇熟练度全景</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                    {orchestratedPlan.targetStability > 0
                      ? `目标: 稳定 >= ${orchestratedPlan.targetStability} 天`
                      : "目标: 学完即可"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>
                    平均稳定性: <strong className="text-foreground">{orchestratedPlan.avgStability}</strong> 天
                  </span>
                  <span>
                    掌握率: <strong className="text-emerald-600 dark:text-emerald-400">{orchestratedPlan.masteryRate}%</strong>
                  </span>
                </div>
              </div>

              {/* 多段掌握度进度条 */}
              {orchestratedPlan.totalCards > 0 && (
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{ width: `${(orchestratedPlan.masteredCount / orchestratedPlan.totalCards) * 100}%` }}
                      title={`已掌握: ${orchestratedPlan.masteredCount} 词`}
                    />
                    <div
                      className="bg-blue-500 h-full transition-all"
                      style={{ width: `${(orchestratedPlan.learningCount / orchestratedPlan.totalCards) * 100}%` }}
                      title={`学习中: ${orchestratedPlan.learningCount} 词`}
                    />
                    <div
                      className="bg-amber-500 h-full transition-all"
                      style={{ width: `${(orchestratedPlan.weakCount / orchestratedPlan.totalCards) * 100}%` }}
                      title={`弱词: ${orchestratedPlan.weakCount} 词`}
                    />
                    <div
                      className="bg-slate-300 dark:bg-slate-700 h-full transition-all"
                      style={{ width: `${(orchestratedPlan.remainingNew / orchestratedPlan.totalCards) * 100}%` }}
                      title={`未学: ${orchestratedPlan.remainingNew} 词`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                      已掌握 {orchestratedPlan.masteredCount}
                    </span>
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <span className="size-1.5 rounded-full bg-blue-500 inline-block" />
                      学习中 {orchestratedPlan.learningCount}
                    </span>
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <span className="size-1.5 rounded-full bg-amber-500 inline-block" />
                      弱词 {orchestratedPlan.weakCount}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-slate-400 inline-block" />
                      未学 {orchestratedPlan.remainingNew}
                    </span>
                  </div>
                </div>
              )}

              {/* 冲刺阶段状态条 */}
              {orchestratedPlan.inSprintPhase ? (
                <div className="rounded bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 px-2.5 py-1 text-xs font-medium flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>考前冲刺固化期：每日新词已自动暂停，全力冲刺已学词汇熟练度达标！</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-amber-500/30">
                    冲刺缓冲余 {orchestratedPlan.daysUntilExam} 天
                  </Badge>
                </div>
              ) : orchestratedPlan.targetStability > 0 && orchestratedPlan.daysUntilExam > 0 ? (
                <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>新词稳步攻坚中：按当前节奏将在考前预留的 {orchestratedPlan.sprintBufferDays} 天冲刺期前学完全部新词。</span>
                  <span>距冲刺期余 {Math.max(0, orchestratedPlan.daysUntilExam - orchestratedPlan.sprintBufferDays)} 天</span>
                </div>
              ) : null}
            </div>

            {/* 今日编排目标 4 格看板 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
                <div className="text-2xl font-bold text-primary">{orchestratedPlan.targetNew}</div>
                <div className="text-xs text-muted-foreground">
                  {orchestratedPlan.inSprintPhase
                    ? "新学 (冲刺暂停)"
                    : orchestratedPlan.learnedNewToday > 0
                    ? `待新学 (已学 ${orchestratedPlan.learnedNewToday})`
                    : "今日新学目标"}
                </div>
              </div>
              <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{orchestratedPlan.targetReview}</div>
                <div className="text-xs text-muted-foreground">
                  {orchestratedPlan.reviewedToday > 0
                    ? `待复习 (已复习 ${orchestratedPlan.reviewedToday})`
                    : "今日到期复习"}
                </div>
              </div>
              <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
                <div className="text-2xl font-bold text-foreground">{orchestratedPlan.totalTarget}</div>
                <div className="text-xs text-muted-foreground">今日待学总量</div>
              </div>
              <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
                <div className="text-2xl font-bold text-muted-foreground">{orchestratedPlan.remainingNew}</div>
                <div className="text-xs text-muted-foreground">词库剩余新词</div>
              </div>
            </div>

            {/* AI 今日行动指南与学情评价 */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 text-left space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="size-3.5" />
                  AI 备考规划与学情评价
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                    {orchestratedPlan.aiGenerated ? "AI 深度评估" : "学情智能速评"}
                  </Badge>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerateAdvice}
                  disabled={adviceLoading}
                  className="h-6 px-2 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-500/10"
                >
                  <RefreshCw className={adviceLoading ? "size-3 animate-spin mr-1" : "size-3 mr-1"} />
                  {adviceLoading ? "评估生成中…" : "重新评价与规划"}
                </Button>
              </div>
              <div className="rounded-lg bg-background/80 border border-blue-500/15 p-3.5 shadow-xs">
                <MarkdownView
                  content={orchestratedPlan.advice}
                  className="text-xs leading-relaxed text-foreground"
                />
              </div>
              {adviceError && (
                <p className="text-[11px] text-destructive">{adviceError}</p>
              )}
            </div>

            {/* 今日完成状态与鼓励语 或 启动学习按钮 */}
            {orchestratedPlan.isCompleted ? (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold text-sm">
                    <CheckCircle2 className="size-4 text-green-600" />
                    今日编排任务已达成！
                  </div>
                  <Button size="sm" variant="outline" onClick={handleStartOrchestratedStudy} className="text-xs">
                    <PlayCircle className="size-3.5 mr-1" />
                    再次复习巩固
                  </Button>
                </div>
                {orchestratedPlan.encouragement && (
                  <p className="text-xs text-foreground/90 italic pt-1">
                    “{orchestratedPlan.encouragement}”
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  系统将自动汇总选定词库并剔除排除标签，交错调度复习与新卡。
                </p>
                <Button
                  size="default"
                  onClick={handleStartOrchestratedStudy}
                  disabled={orchestratedPlan.totalTarget === 0}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto"
                >
                  <Sparkles className="size-4" />
                  开始今日 AI 编排任务 ({orchestratedPlan.totalTarget} 词)
                </Button>
              </div>
            )}

            {/* 宏观分阶段计划（若有） */}
            {aiPlan && (
              <details className="text-xs text-muted-foreground group">
                <summary className="cursor-pointer font-medium hover:text-foreground list-none flex items-center gap-1">
                  <span>▸ 查看 AI 分阶段宏观备考规划</span>
                </summary>
                <div className="mt-2 rounded-md bg-muted/40 p-3.5 text-xs text-foreground">
                  <MarkdownView content={aiPlan} className="text-xs" />
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      ) : (
        /* 未配置时的入口卡片 */
        <Card className="border-dashed border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-5 text-primary" />
              AI 辅助学习任务编排
            </CardTitle>
            <CardDescription>
              设置目标考试日期（四六级、考研、雅思等）、选定词库与要忽略的标签（如已掌握标签），AI 将自动安排每日新学与复习，完成后送上专属鼓励语！
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button onClick={() => setPlanDialogOpen(true)} className="gap-2">
              <Sparkles className="size-4" />
              开启 AI 备考任务编排
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AI 智能测试 */}
      <Card className={aiTestDue ? "border-purple-500/40 bg-purple-500/5" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-purple-500" />
            AI 智能测试
          </CardTitle>
          <CardDescription>
            {aiTestDue
              ? "该测试了：AI 根据学习内容和掌握情况出题"
              : `下次测试约 ${nextAiTestLabel}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">覆盖到期与薄弱词，AI 生成语境题和选择题</p>
          <Button onClick={startAiTest} disabled={!aiTestDeck}>
            <Sparkles className="size-4" />
            开始 AI 测试
          </Button>
        </CardContent>
      </Card>

      {/* 智能推荐：到期最多的词库一键开始 */}
      {recommendedDeck ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="size-5 text-primary" />
              今日推荐
            </CardTitle>
            <CardDescription>FSRS-5 调度：今日到期卡片 + 配额内新卡</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{recommendedDeck.name}</p>
              <p className="text-sm text-muted-foreground">
                {(dueByDeck[recommendedDeck.id] ?? 0) > 0
                  ? `${dueByDeck[recommendedDeck.id]} 张到期`
                  : `${newByDeck[recommendedDeck.id] ?? 0} 张新词待学`}
                {(dueByDeck[recommendedDeck.id] ?? 0) > 0 && (newByDeck[recommendedDeck.id] ?? 0) > 0
                  ? ` · ${newByDeck[recommendedDeck.id]} 张新词`
                  : ""}
              </p>
            </div>
            <Button size="lg" onClick={() => startStudy(recommendedDeck.id)}>
              <PlayCircle className="size-4" />
              开始今日学习
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>今日学习</CardTitle>
            <CardDescription>当前没有到期卡片，可浏览词库或导入新内容</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/decks">浏览词库</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/import">
                <FileUp className="size-4" />
                导入词库
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 继续上次学习 */}
      {lastDeck && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="size-4 text-muted-foreground" />
              继续上次
            </CardTitle>
            <CardDescription>跳过选择，直接回到上次的学习位置</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">
                {lastDeck.name}
                {lastContext?.tag ? ` · ${lastContext.tag}` : ""}
                {lastContext?.keyOnly ? " · 仅重点词" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {dueByDeck[lastDeck.id] ?? 0} 张到期
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                startStudy(lastContext!.deckId, lastContext?.tag, lastContext?.keyOnly)
              }
            >
              <RotateCcw className="size-4" />
              继续上次
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 其他词库 + 快捷入口 */}
      {(otherDecks.length > 0 || decks.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>其他词库</CardTitle>
            <CardDescription>按学习进度快速进入</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {otherDecks.length > 0 ? (
              <div className="divide-y divide-border/50">
                {otherDecks.map((d) => {
                  const due = dueByDeck[d.id] ?? 0;
                  const fresh = newByDeck[d.id] ?? 0;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground">{d.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {due > 0 ? `${due} 张到期` : ""}
                          {due > 0 && fresh > 0 ? " · " : ""}
                          {fresh > 0 ? `${fresh} 张新词` : ""}
                          {due === 0 && fresh === 0 ? "暂无待学卡片" : ""}
                        </span>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => startStudy(d.id)}>
                        开始
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2 text-center">暂无其他词库</p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/import">
                  <FileUp className="size-3.5" />
                  导入词库
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/decks">管理词库</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 弱词提醒 */}
      {weakCount > 0 && (
        <Card className="border-amber-500/30">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <p className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              <span>你有 <span className="font-semibold text-amber-500">{weakCount}</span> 个词反复遗忘</span>
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/weak-words">去弱词本</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 今日计划 */}
      <Card>
        <CardHeader>
          <CardTitle>今日计划</CardTitle>
          <CardDescription>学习配额与复习安排</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            今日待复习 <span className="font-medium text-foreground">{dueCount}</span> 张，
            新卡可学 <span className="font-medium text-foreground">{newCount}</span> 张
            （受各词库每日配额限制）。
            进入「学习」页选择词库即可开始。
          </p>
        </CardContent>
      </Card>

      {/* 备考编排弹窗 */}
      <ExamPlanDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        onSaved={loadDashboardData}
      />
    </div>
  );
}
