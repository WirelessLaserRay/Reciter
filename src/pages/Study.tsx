import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Keyboard,
  Layers,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Shuffle,
  Sparkles,
  Star,
  Tag,
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
import { Switch } from "@/components/ui/switch";
import { db, type StudyCardRow } from "@/lib/db";
import { previewIntervals, getRetrievability, type IntervalPreview } from "@/lib/fsrs";
import { getEffectiveRetention, getLeechThreshold } from "@/lib/settings";
import { getAIConfig } from "@/lib/ai-client";
import {
  getActiveRecallEnabled,
  getDeckShuffle,
  getLearningSteps,
  getQuickTestMs,
  getRatingMode,
  getSummaryInterval,
  saveDeckShuffle,
  saveLastAiTestAt,
} from "@/lib/study-prefs";
import { resolveStudyMode } from "@/lib/study-mode";
import { fetchExamples, fetchPhonetic } from "@/lib/dictionary";
import StudyCard from "@/components/study/StudyCard";
import { useStudyStore } from "@/stores/useStudyStore";
import { useDeckStore } from "@/stores/useDeckStore";
import type { CardState } from "@/types";
import QuizSession from "@/components/quiz/QuizSession";
import AIChatPanel from "@/components/ai/AIChatPanel";

function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec < 60) return sec + " 秒";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
}

function rowToState(row: StudyCardRow): CardState {
  return {
    card_id: row.card_id,
    state: row.state,
    stability: row.stability,
    difficulty: row.difficulty,
    due: row.due,
    last_review: row.last_review,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    learning_steps: row.learning_steps,
    desired_retention: row.desired_retention,
    algorithm_version: row.algorithm_version,
  };
}

type SessionStats = {
  reviewed: number;
  newDone: number;
  again: number;
  hard: number;
  weakWords: string[];
};

/** 学习会话中的迷你小结：每 N 张插入一次 */
function SessionMiniSummary({
  stats,
  onContinue,
  onAIReview,
}: {
  stats: SessionStats;
  onContinue: () => void;
  onAIReview: (words: string[]) => void;
}) {
  const remembered = Math.max(0, stats.reviewed - stats.again - stats.hard);
  return (
    <Card className="mx-auto max-w-2xl border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>📊 本轮小结</CardTitle>
        <CardDescription>
          已学习 {stats.reviewed} 张 · 新卡 {stats.newDone} 张
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-2xl font-bold text-green-600">{remembered}</p>
            <p className="text-xs text-muted-foreground">记得</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-2xl font-bold text-amber-500">{stats.hard}</p>
            <p className="text-xs text-muted-foreground">模糊</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-2xl font-bold text-red-500">{stats.again}</p>
            <p className="text-xs text-muted-foreground">忘记</p>
          </div>
        </div>

        {stats.weakWords.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">本轮薄弱词：</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(stats.weakWords)].slice(0, 8).map((w) => (
                <Badge key={w} variant="destructive">{w}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onContinue}>
            <RefreshCw className="size-4" />
            继续学习
          </Button>
          <Button variant="outline" onClick={() => onAIReview(stats.weakWords)} disabled={stats.weakWords.length === 0}>
            <Sparkles className="size-4" />
            AI 帮我巩固
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** 学习主界面（Phase 6C：统一学习流，多模式自适应） */
function StudySession({
  onStartTagQuiz,
}: {
  /** 标签学习完成后的针对性测试入口（选择/填空为主） */
  onStartTagQuiz?: (deckId: number, tag: string) => void;
}) {
  const { deckId, deckName, tagName, keyOnly, queue, index, stats, finished, rate, markShown, reset } = useStudyStore();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<IntervalPreview | null>(null);
  const [retrievability, setRetrievability] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Phase 6A 学习偏好 + Phase 6C AI 状态
  const [ratingMode, setRatingMode] = useState<"3" | "4">("3");
  const [activeRecallEnabled, setActiveRecallEnabled] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState(10);
  const [showMiniSummary, setShowMiniSummary] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [rateReady, setRateReady] = useState(false);
  // 弱词阈值（设置页可调，默认 3）
  const [leechThreshold, setLeechThreshold] = useState(3);
  // 当前单词音标（优先卡片字段，其次词典接口）
  const [phoneticText, setPhoneticText] = useState("");
  // P2-⑨：熟练卡秒答阈值（毫秒，可在设置中调整）
  const [quickMs, setQuickMs] = useState(5000);
  // P2-⑧：全词库卡片精简池（选择题干扰项 + 同族词匹配）
  const [deckDistractors, setDeckDistractors] = useState<{ front: string; back: string }[]>([]);

  // AI 助手右侧栏：折叠状态持久化；窄屏（<lg）退化为卡片下方面板
  const [aiPanelOpen, setAiPanelOpen] = useState(
    () => localStorage.getItem("reciter-ai-panel-open") !== "0"
  );
  // 展开/收起动画：先动宽度，动画结束后再卸载面板内容
  const [aiPanelMounted, setAiPanelMounted] = useState(aiPanelOpen);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    if (aiPanelOpen) {
      setAiPanelMounted(true);
      return;
    }
    const timer = setTimeout(() => setAiPanelMounted(false), 300);
    return () => clearTimeout(timer);
  }, [aiPanelOpen]);

  const toggleAiPanel = () => {
    setAiPanelOpen((v) => {
      const next = !v;
      localStorage.setItem("reciter-ai-panel-open", next ? "1" : "0");
      return next;
    });
  };

  // 监听视口切换（桌面侧栏 / 移动端折叠面板）
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const item = queue[index];
  const total = queue.length;
  const done = stats.reviewed;
  const sessionDuration = stats.sessionStartTime > 0
    ? formatDuration((Date.now() - stats.sessionStartTime) / 1000)
    : "0 秒";

  // 预先加载队列前三个单词/词组的例句，展示时直接命中缓存
  useEffect(() => {
    for (let i = index; i < Math.min(queue.length, index + 3); i++) {
      const w = queue[i]?.row.front;
      if (w) void fetchExamples(w).catch(() => {});
    }
  }, [queue, index]);

  // 当前单词音标：优先卡片字段，其次词典接口（仅单词）
  useEffect(() => {
    const word = item?.row.front ?? "";
    if (!word) return;
    if (item.row.phonetic) {
      setPhoneticText(item.row.phonetic);
      return;
    }
    setPhoneticText("");
    let cancelled = false;
    fetchPhonetic(word).then((p) => {
      if (!cancelled) setPhoneticText(p);
    });
    return () => {
      cancelled = true;
    };
  }, [item]);

  // 加载学习偏好与 AI 配置
  useEffect(() => {
    (async () => {
      const [rm, ar, si, aiCfg, qms, leech] = await Promise.all([
        getRatingMode(),
        getActiveRecallEnabled(),
        getSummaryInterval(),
        getAIConfig(),
        getQuickTestMs(),
        getLeechThreshold(),
      ]);
      setRatingMode(rm);
      setActiveRecallEnabled(ar);
      setSummaryInterval(si);
      setAiEnabled(aiCfg.enabled);
      setQuickMs(qms);
      setLeechThreshold(leech);
    })().catch(() => {});
  }, []);

  // P2-⑧：加载全词库干扰项池（只取 front/back，供选择题与同族词使用）
  useEffect(() => {
    if (deckId === null) return;
    let cancelled = false;
    db.getRandomDistractors(deckId, 0, 50)
      .then((cards) => {
        if (cancelled) return;
        setDeckDistractors(cards);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // 卡片切换时：重置间隔预览/可检索度；迷你小结出现时先不开始计时
  useEffect(() => {
    setPreview(null);
    setRetrievability(null);
    if (item && !showMiniSummary) {
      markShown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue.length]);

  /** 当前卡片的统一学习流模式（Phase 6C） */
  const modeConfig = useMemo(
    () => (item ? resolveStudyMode(rowToState(item.row), aiEnabled, activeRecallEnabled, leechThreshold) : null),
    [item, aiEnabled, activeRecallEnabled, leechThreshold]
  );

  /** 揭示答案：计算四档间隔预览与记忆可检索度 */
  const handleReveal = useCallback(async () => {
    if (!item) return;
    const state = rowToState(item.row);
    try {
      const [retention, learningSteps] = await Promise.all([
        getEffectiveRetention(),
        getLearningSteps(),
      ]);
      const [p, r] = await Promise.all([
        previewIntervals(state, undefined, retention, learningSteps),
        getRetrievability(state, undefined, retention, learningSteps),
      ]);
      setPreview(p);
      setRetrievability(r);
    } catch {
      // 预览失败不阻断评分流程
    }
  }, [item]);

  const handleContinue = () => {
    markShown();
    setShowMiniSummary(false);
  };

  /** 迷你小结 → AI 巩固薄弱词：跳转到弱词本统一处理 */
  const handleAIReviewFromSummary = (words: string[]) => {
    if (words.length === 0) return;
    navigate("/weak-words");
  };

  const handleRate = useCallback(
    async (grade: 1 | 2 | 3 | 4) => {
      if (busy) return;
      setBusy(true);
      try {
        const before = useStudyStore.getState().stats.reviewed;
        const hasNext = await rate(grade);
        const newDone = before + 1;
        if (newDone > 0 && newDone % summaryInterval === 0 && hasNext) {
          setShowMiniSummary(true);
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, rate, summaryInterval]
  );

  /** AI 深度复习完成：以 ai_test 来源评分并推进队列 */
  const handleAIComplete = useCallback(
    async (grade: 1 | 2 | 3 | 4, aiQuestion: string, aiAnswer: string) => {
      if (!item || busy) return;
      setBusy(true);
      try {
        const before = useStudyStore.getState().stats.reviewed;
        const hasNext = await rate(grade, Date.now() - item.shownAt, {
          source: "ai_test",
          aiQuestion,
          aiAnswer,
        });
        const newDone = before + 1;
        if (newDone > 0 && newDone % summaryInterval === 0 && hasNext) {
          setShowMiniSummary(true);
        }
      } finally {
        setBusy(false);
      }
    },
    [item, busy, rate, summaryInterval]
  );

  // 键盘快捷键 1-4（仅在当前模式允许评分时生效）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rateReady) return;
      const g = parseInt(e.key, 10);
      if (g >= 1 && g <= 4) handleRate(g as 1 | 2 | 3 | 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rateReady, handleRate]);

  // 结束页（本轮完成）
  if (finished) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="size-4" />
              返回首页
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            词库：{deckName}
            {tagName && " · 标签：" + tagName}
          </span>
        </div>

        {/* 标签学习完成：建议立即进行该标签集的选择/填空测试 */}
        {finished && done > 0 && tagName && deckId !== null && onStartTagQuiz && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-5 text-primary" />
                标签巩固测试
              </CardTitle>
              <CardDescription>
                你已完成「{tagName}」标签的全部学习内容，建议用 10 道选择/填空题立即检验记忆（掌握度回填 FSRS）。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <Badge variant="secondary" className="text-xs">
                <Tag className="mr-1 inline size-3" />
                {tagName}
              </Badge>
              <Button onClick={() => onStartTagQuiz(deckId, tagName)}>
                <ClipboardList className="size-4" />
                开始标签测试
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            {done > 0 ? (
              <CheckCircle2 className="size-10 text-green-500" />
            ) : (
              <BookOpen className="size-10 text-muted-foreground" />
            )}
            <CardTitle>{done > 0 ? "本轮完成 🎉" : "今日没有需要学习的卡片"}</CardTitle>
            <CardDescription className="max-w-md">
              {done > 0 ? (
                <>
                  复习 {stats.reviewed} 张 · 新卡 {stats.newDone} 张 · 忘记 {stats.again} 张
                  {stats.hard > 0 ? ` · 模糊 ${stats.hard} 张` : ""}
                </>
              ) : (
                "「" + deckName + (tagName ? " · " + tagName : "") + "」当前没有到期的卡片或可用新卡配额。"
              )}
            </CardDescription>
            {done > 0 && (
              <p className="text-xs text-muted-foreground">本次学习时长：{sessionDuration}</p>
            )}
            {done > 0 && stats.weakWords.length > 0 && (
              <div className="w-full max-w-md rounded-lg bg-muted/50 p-3 text-left">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">需要关注</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(stats.weakWords)].slice(0, 8).map((w) => (
                    <Badge key={w} variant="destructive">{w}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => reset()}>返回词库选择</Button>
              <Button asChild variant="outline">
                <Link to="/decks">管理词库</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const renderAI = (embedded: boolean) => (
    <AIChatPanel
      embedded={embedded}
      front={item.row.front}
      back={item.row.back}
      cardState={rowToState(item.row)}
      strategyOverride={modeConfig?.aiStrategy ?? undefined}
      defaultExpanded={modeConfig?.mode === "new_teach" || modeConfig?.mode === "ai_drill"}
      onGradeDecided={(grade, question, answer) =>
        handleAIComplete(grade, question ?? "", answer ?? "")
      }
    />
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/decks">
            <ArrowLeft className="size-4" />
            退出
          </Link>
        </Button>
        <div className="text-sm">
          <span className="font-medium">{deckName}</span>
          {tagName && (
            <Badge variant="secondary" className="ml-2 text-[10px]">
              <Tag className="size-2.5" />
              {tagName}
            </Badge>
          )}
          {keyOnly && (
            <Badge className="ml-2 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
              <Star className="size-2.5" />
              重点
            </Badge>
          )}
          <span className="ml-3 text-muted-foreground">
            已完成 {done} · 剩余 {total - index}
          </span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: total > 0 ? ((index / total) * 100).toFixed(1) + "%" : "0%" }}
        />
      </div>

      <div className="flex items-start gap-4">
        {/* 左侧主学习区 */}
        <div className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {/* 迷你小结：每 N 张插入一次，替换卡片区 */}
            {showMiniSummary ? (
              <SessionMiniSummary
                stats={stats}
                onContinue={handleContinue}
                onAIReview={handleAIReviewFromSummary}
              />
            ) : (
              modeConfig && (
                <>
                  <StudyCard
                    key={item.row.card_id}
                  row={item.row}
                  config={modeConfig}
                  phonetic={phoneticText}
                  ratingMode={ratingMode}
                  preview={preview}
                  retrievability={retrievability}
                  busy={busy}
                  distractors={deckDistractors}
                  quickMs={quickMs}
                  onReveal={() => void handleReveal()}
                  onRate={(grade) => void handleRate(grade)}
                  onRateReadyChange={setRateReady}
                  />
                </>
              )
            )}

            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Keyboard className="size-3.5" />
              {ratingMode === "3" ? "快捷键：1 不记得 · 2 模糊 · 3 记得" : "快捷键：1 忘了 · 2 困难 · 3 良好 · 4 简单"}
            </div>
          </div>
        </div>

        {/* 桌面端：右侧可折叠 AI 助手侧栏（300ms 宽度/透明度动画） */}
        {!showMiniSummary && isDesktop && (
          <>
            <div
              className="ai-side-panel shrink-0 overflow-hidden"
              style={{ width: aiPanelOpen ? "22rem" : "0rem", opacity: aiPanelOpen ? 1 : 0 }}
            >
              {aiPanelMounted && (
                <aside className="sticky top-4 w-full overflow-hidden rounded-xl border bg-card">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[15px] font-medium">
                      <Sparkles className="size-4 text-purple-500" />
                      AI 学习助手
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={toggleAiPanel}
                      title="收起 AI 助手"
                    >
                      <PanelRightClose className="size-4" />
                    </Button>
                  </div>
                  {renderAI(true)}
                </aside>
              )}
            </div>
            {!aiPanelOpen && (
              <button
                type="button"
                onClick={toggleAiPanel}
                className="sticky top-4 flex shrink-0 flex-col items-center gap-1.5 rounded-xl border bg-card px-3 py-4 text-xs text-muted-foreground transition-colors hover:bg-accent"
                title="展开 AI 助手"
              >
                <PanelRightOpen className="size-5 text-purple-500" />
                <span>AI 助手</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* 窄屏：AI 助手退化为卡片下方的折叠面板 */}
      {!showMiniSummary && !isDesktop && (
        aiPanelOpen ? (
          renderAI(false)
        ) : (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={toggleAiPanel}>
              <Sparkles className="size-4 text-purple-500" />
              AI 学习助手
            </Button>
          </div>
        )
      )}
    </div>
  );
}

/** 词库选择页（Phase 6C：单一「开始学习」入口） */
function DeckPicker({ onStudy }: { onStudy: (id: number, name: string) => void }) {
  const { decks, cardCounts, refresh } = useDeckStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (decks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="size-10 text-muted-foreground" />
          <CardTitle>还没有词库</CardTitle>
          <CardDescription>先去「导入」或「词库」页面创建词库吧</CardDescription>
          <Button asChild variant="outline">
            <Link to="/import">前往导入</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-2xl font-bold">选择词库</h2>
        <p className="text-sm text-muted-foreground">
          按记忆状态自动切换模式；自定义测试在词库详情页
        </p>
      </div>
      <div className="space-y-3">
        {decks.map((d) => (
          <Card key={d.id} className="transition-colors hover:border-primary/50">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="truncate font-medium">{d.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {cardCounts[d.id] ?? 0} 张卡片 · 每日新卡 {d.new_cards_per_day}
                </div>
              </div>
              <Button onClick={() => onStudy(d.id, d.name)} className="shrink-0">
                <RefreshCw className="size-3.5" />
                开始学习
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** 标签选择（学习前选择考察范围） */
function TagPicker({
  deckId,
  deckName,
  onPick,
  onBack,
}: {
  deckId: number;
  deckName: string;
  onPick: (tag?: string, keyOnly?: boolean) => void;
  onBack: () => void;
}) {
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [shuffle, setShuffle] = useState(false);

  useEffect(() => {
    db.getDeckTagsWithCount(deckId)
      .then((t) => {
        setTags(t);
        setTotal(t.reduce((a, x) => a + x.count, 0));
      })
      .catch(() => {});
    db.getDeckKeyCount(deckId).then(setKeyCount).catch(() => {});
    getDeckShuffle(deckId).then(setShuffle).catch(() => {});
  }, [deckId]);

  const toggleShuffle = async (v: boolean) => {
    setShuffle(v);
    await saveDeckShuffle(deckId, v).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          返回词库
        </Button>
        <span className="text-sm text-muted-foreground">词库：{deckName}</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            选择学习范围
          </CardTitle>
          <CardDescription>按标签分类学习（如「单词」「词组」分开考察）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full justify-between" onClick={() => onPick(undefined)}>
            <span className="flex items-center gap-2">
              <Layers className="size-4" />
              全部卡片
            </span>
            <span className="text-xs text-muted-foreground">{total} 张</span>
          </Button>
          {keyCount > 0 && (
            <Button
              variant="outline"
              className="w-full justify-between border-amber-500/40"
              onClick={() => onPick(undefined, true)}
            >
              <span className="flex items-center gap-2">
                <Star className="size-4 text-amber-500" />
                重点词 / 词组
              </span>
              <span className="text-xs text-muted-foreground">{keyCount} 张</span>
            </Button>
          )}
          {tags.map((t) => (
            <Button key={t.tag} variant="outline" className="w-full justify-between" onClick={() => onPick(t.tag)}>
              <span className="flex items-center gap-2">
                <Tag className="size-4" />
                {t.tag}
              </span>
              <span className="text-xs text-muted-foreground">{t.count} 张</span>
            </Button>
          ))}
          {tags.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">该词库暂无标签，将学习全部卡片</p>
          )}
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Shuffle className="size-3.5 text-muted-foreground" />
                乱序学习
              </p>
              <p className="text-xs text-muted-foreground">打乱本词库的新卡与复习卡顺序（按词库记忆）</p>
            </div>
            <Switch checked={shuffle} onCheckedChange={(v) => void toggleShuffle(v)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Study() {
  const { deckId, loading, error, loadQueue } = useStudyStore();
  const [quizDeck, setQuizDeck] = useState<{ id: number; name: string; tag?: string; ai?: boolean; smart?: boolean } | null>(null);
  const [pendingDeck, setPendingDeck] = useState<{ id: number; name: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const quizParam = searchParams.get("quiz");
  const tagParam = searchParams.get("tag");
  const aiParam = searchParams.get("ai");
  const smartParam = searchParams.get("smart");
  const recordParam = searchParams.get("record");

  // 测试入口：/study?quiz=<deckId>（词库详情页）；/study?quiz=<deckId>&tag=<tag>（标签巩固测试）
  useEffect(() => {
    if (!quizParam) return;
    const id = parseInt(quizParam, 10);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      const store = useDeckStore.getState();
      if (!store.decks.some((d) => d.id === id)) await store.refresh();
      if (cancelled) return;
      const d = useDeckStore.getState().decks.find((x) => x.id === id);
      if (d) setQuizDeck({ id: d.id, name: d.name, tag: tagParam ?? undefined, ai: aiParam === "1", smart: smartParam === "1" });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quizParam, tagParam]);

  if (quizDeck) {
    return (
      <QuizSession
        deckId={quizDeck.id}
        deckName={quizDeck.name}
        presetTag={quizDeck.tag}
        defaultUseAI={quizDeck.ai ?? false}
        smart={quizDeck.smart ?? false}
        onTestComplete={() => {
          if (recordParam === "1") void saveLastAiTestAt(Date.now());
        }}
        onExit={() => {
          const taggedQuiz = !!quizDeck.tag;
          setQuizDeck(null);
          setSearchParams({}, { replace: true });
          // 标签巩固测试结束后回到词库选择页（结束学习会话）
          if (taggedQuiz) useStudyStore.getState().reset();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        加载学习队列…
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (pendingDeck) {
    return (
      <TagPicker
        deckId={pendingDeck.id}
        deckName={pendingDeck.name}
        onPick={(tag, keyOnly) => {
          loadQueue(pendingDeck.id, tag, keyOnly);
          setPendingDeck(null);
        }}
        onBack={() => setPendingDeck(null)}
      />
    );
  }

  if (deckId === null) {
    return <DeckPicker onStudy={(id, name) => setPendingDeck({ id, name })} />;
  }

  return (
    <StudySession
      onStartTagQuiz={(deckId, tag) => {
        setSearchParams({ quiz: String(deckId), tag }, { replace: true });
      }}
    />
  );
}
