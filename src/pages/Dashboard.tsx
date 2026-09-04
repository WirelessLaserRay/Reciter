import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, CalendarClock, FileUp, GraduationCap, Newspaper, PlayCircle, Quote, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
import { useStudyStore } from "@/stores/useStudyStore";
import { getDayStartDate, parseDayStartHour, toDateKey } from "@/lib/day";
import { getLeechThreshold } from "@/lib/settings";
import {
  AI_TEST_INTERVAL_MS,
  getIgnoredTags,
  getLastAiTestAt,
  getLastStudyContext,
  type LastStudyContext,
} from "@/lib/study-prefs";
import { fetchDailyQuote, getDailyQuote, refreshDailyQuote } from "@/lib/daily-quotes";
import { getDailyNewTarget, getDaysUntilExam, getExamConfig, getSavedAIStudyPlan } from "@/lib/exam-planner";
import type { Deck } from "@/types";

export default function Dashboard() {
  const dbReady = useDbStore((s) => s.ready);
  const navigate = useNavigate();
  const { decks, cardCounts, refresh } = useDeckStore();
  const loadQueue = useStudyStore((s) => s.loadQueue);
  const [dueCount, setDueCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [lastContext, setLastContext] = useState<LastStudyContext | null>(null);
  const [dueByDeck, setDueByDeck] = useState<Record<number, number>>({});
  const [recommendedDeck, setRecommendedDeck] = useState<Deck | null>(null);
  const [weakCount, setWeakCount] = useState(0);
  const [aiTestDue, setAiTestDue] = useState(true);
  const [nextAiTestLabel, setNextAiTestLabel] = useState("");
  const [quote, setQuote] = useState(() => getDailyQuote());
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [examInfo, setExamInfo] = useState<{ date: string; days: number; dailyTarget: number | null } | null>(null);
  const [aiPlan, setAiPlan] = useState("");
  const [currentDateKey, setCurrentDateKey] = useState(() => toDateKey(new Date()));

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

  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      await refresh();
      const hour = parseDayStartHour(await db.getSetting("day_start"));
      const now = new Date();
      const dayStart = getDayStartDate(hour, now);
      const currentDecks = useDeckStore.getState().decks;
      const ignoredTags = await getIgnoredTags();
      const reviewLimitRaw = await db.getSetting("daily_review_limit");
      const reviewLimit = reviewLimitRaw ? parseInt(reviewLimitRaw, 10) : 200;
      const todayReviewed = await db.countReviewsToday(dayStart.toISOString());
      const remainingLimit = Math.max(0, reviewLimit - todayReviewed);
      const deckDue = await db.getDeckDueCounts(now.toISOString(), ignoredTags);
      const leech = await getLeechThreshold();
      const [due, fresh, last, weak] = await Promise.all([
        db.getGlobalDueCount(now.toISOString(), ignoredTags),
        db.getGlobalNewCount(ignoredTags),
        getLastStudyContext(),
        db.getGlobalWeakCount(leech),
      ]);
      setDueCount(Math.min(due, remainingLimit));
      setNewCount(fresh);
      setLastContext(last);
      setWeakCount(weak);
      setDueByDeck(deckDue);
      setQuote(await fetchDailyQuote());

      const examCfg = await getExamConfig();
      setAiPlan(await getSavedAIStudyPlan());
      if (examCfg.date) {
        setExamInfo({
          date: examCfg.date,
          days: getDaysUntilExam(examCfg.date),
          dailyTarget: await getDailyNewTarget(),
        });
      } else {
        setExamInfo(null);
      }

      const lastAiTest = await getLastAiTestAt();
      const aiDue = lastAiTest === 0 || Date.now() - lastAiTest >= AI_TEST_INTERVAL_MS;
      setAiTestDue(aiDue);
      if (!aiDue) {
        const next = new Date(lastAiTest + AI_TEST_INTERVAL_MS);
        setNextAiTestLabel(next.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
      }

      const top = currentDecks
        .filter((d) => (deckDue[d.id] ?? 0) > 0)
        .sort((a, b) => (deckDue[b.id] ?? 0) - (deckDue[a.id] ?? 0))[0] ?? null;
      setRecommendedDeck(top);
    })().catch(() => {});
  }, [dbReady, refresh, currentDateKey]);

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
  const otherDecks = decks.filter(
    (d) => (dueByDeck[d.id] ?? 0) > 0 && d.id !== recommendedDeck?.id
  );

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
    { label: "今日待复习", value: String(dueCount), icon: CalendarClock, hint: "此刻已到期 · 配额内" },
    { label: "新卡待学", value: String(newCount), icon: GraduationCap, hint: "FSRS state = New" },
    { label: "词库总数", value: String(deckCount), icon: BookOpen, hint: "本地 SQLite" },
    { label: "卡片总数", value: String(cardTotal), icon: GraduationCap, hint: "本地 SQLite" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">你好 👋</h2>
        <p className="text-muted-foreground">{today}</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <s.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="truncate text-xs text-muted-foreground">{s.label}</div>
                <div className="truncate text-[10px] text-muted-foreground/70">{s.hint}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 每日一句 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Quote className="size-4 text-primary" />
            每日一句
            <span className="text-[10px] font-normal text-muted-foreground">
              {quote.source === "zenquotes" ? "ZenQuotes" : quote.source === "quotable" ? "Quotable" : "本地"}
            </span>
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={handleRefreshQuote} disabled={quoteRefreshing}>
            <RotateCcw className={quoteRefreshing ? "size-4 animate-spin" : "size-4"} />
            换一句
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-base font-medium italic leading-relaxed">“{quote.text}”</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {quote.translation || "（未配置 AI，暂无中文翻译）"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">— {quote.author}</p>
        </CardContent>
      </Card>

      {/* 每日一文 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="size-4 text-primary" />
            每日一文
          </CardTitle>
          <CardDescription>CGTN / CNN / Guardian / NPR / BBC + 自定义 RSS，AI 出题 + 生词识别</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">每天读一篇，AI 帮你出题和讲解生词</p>
          <Button asChild>
            <Link to="/daily-article">
              <Newspaper className="size-4" />
              去阅读
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* 考试倒计时 */}
      {examInfo && (
        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-blue-500" />
              距离考试还有 {examInfo.days} 天
            </CardTitle>
            <CardDescription>
              目标日期 {examInfo.date}
              {examInfo.dailyTarget !== null && ` · 建议每日新学 ${examInfo.dailyTarget} 张`}
            </CardDescription>
          </CardHeader>
          {aiPlan && (
            <CardContent>
              <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
                {aiPlan}
              </pre>
            </CardContent>
          )}
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
                {dueByDeck[recommendedDeck.id] ?? 0} 张到期
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

      {/* 其他到期词库 + 快捷入口 */}
      {(otherDecks.length > 0 || decks.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>其他词库</CardTitle>
            <CardDescription>按今日到期数快速进入</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {otherDecks.length > 0 ? (
              otherDecks.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {d.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {dueByDeck[d.id] ?? 0} 张到期
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => startStudy(d.id)}>
                    开始
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">暂无其他到期词库</p>
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
            <p className="text-sm">
              ⚠️ 你有 <span className="font-semibold text-amber-500">{weakCount}</span> 个词反复遗忘
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

    </div>
  );
}
