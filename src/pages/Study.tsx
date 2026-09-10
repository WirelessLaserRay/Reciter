import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Keyboard,
  Layers,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Shuffle,
  SlidersHorizontal,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db, type StudyCardRow } from "@/lib/db";
import { previewIntervals, getRetrievability, type IntervalPreview } from "@/lib/fsrs";
import { getEffectiveRetention, getLeechThreshold } from "@/lib/settings";
import { getAIConfig } from "@/lib/ai-client";
import {
  getActiveRecallEnabled,
  getDeckShuffle,
  getLastStudyContext,
  getLearningSteps,
  getQuickTestMs,
  getRatingMode,
  getRestUntil,
  getSummaryInterval,
  saveDeckShuffle,
  saveLastAiTestAt,
} from "@/lib/study-prefs";
import { resolveStudyMode } from "@/lib/study-mode";
import { fetchExamples, fetchPhonetic } from "@/lib/dictionary";
import { getDisplayPhonetic } from "@/lib/phonetic";
import { getCardExamples } from "@/lib/card-examples";
import { preloadSpeech } from "@/lib/tts";
import { getCardMeaning } from "@/lib/meaning";
import StudyCard, { type Distractor } from "@/components/study/StudyCard";
import { useStudyStore } from "@/stores/useStudyStore";
import { useDeckStore } from "@/stores/useDeckStore";
import type { CardState } from "@/types";
import QuizSession from "@/components/quiz/QuizSession";
import AIChatPanel from "@/components/ai/AIChatPanel";
import {
  generateCompletionEncouragement,
  getDaysUntilExam,
  getExamConfig,
  getTodayOrchestratedPlan,
  markTodayPlanCompleted,
  type TodayOrchestratedPlan,
} from "@/lib/exam-planner";
import { autoPushIfConfigured, autoPullIfRemoteNewer } from "@/lib/sync";
import { cn } from "@/lib/utils";

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

  // 默认空格切页：学习小结时按空格继续学习
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "A" || target.isContentEditable)) return;
      e.preventDefault();
      onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);

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
        <p className="text-xs text-muted-foreground">快捷键：空格 继续学习</p>
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
  const {
    deckId,
    deckName,
    tagName,
    keyOnly,
    isOrchestrated,
    orchestratedTarget,
    orchestratedTitle,
    queue,
    index,
    stats,
    finished,
    loadQueue,
    rate,
    markShown,
    reset,
    skip,
    ignore,
  } = useStudyStore();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<IntervalPreview | null>(null);
  const [retrievability, setRetrievability] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [remainingNew, setRemainingNew] = useState<number | null>(null);
  const [encouragement, setEncouragement] = useState<string | null>(null);
  const [encouragementLoading, setEncouragementLoading] = useState(false);
  const [encouragementRefreshing, setEncouragementRefreshing] = useState(false);

  // Phase 6A 学习偏好 + Phase 6C AI 状态
  const [ratingMode, setRatingMode] = useState<"3" | "4">("3");
  const [activeRecallEnabled, setActiveRecallEnabled] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState(10);
  const [showMiniSummary, setShowMiniSummary] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [rateReady, setRateReady] = useState(false);
  // 弱词阈值（设置页可调，默认 3）
  const [leechThreshold, setLeechThreshold] = useState(3);
  // 已异步获取的音标缓存（card_id → phonetic），用于缺失音标卡片即时显示
  const [phoneticMap, setPhoneticMap] = useState<Record<number, string>>({});
  // P2-⑨：熟练卡秒答阈值（毫秒，可在设置中调整）
  const [quickMs, setQuickMs] = useState(5000);
  // 单轮上限休息提示
  const [restLabel, setRestLabel] = useState("");
  // 中途退出确认
  const [exitOpen, setExitOpen] = useState(false);
  // P2-⑧：全词库卡片精简池（选择题干扰项 + 同族词匹配）
  const [deckDistractors, setDeckDistractors] = useState<Distractor[]>([]);
  // 手动快速收录弱词本卡片 ID 缓存与操作提示
  const [weakCardIds, setWeakCardIds] = useState<Set<number>>(new Set());
  const [weakNotice, setWeakNotice] = useState<string | null>(null);

  // 备战 AI 编排任务完成时，生成个性化鼓励语并记录完成状态
  useEffect(() => {
    if (finished && isOrchestrated && stats.reviewed + stats.newDone > 0) {
      let active = true;
      setEncouragementLoading(true);
      (async () => {
        try {
          const cfg = await getExamConfig();
          const days = cfg.date ? getDaysUntilExam(cfg.date) : 0;
          const text = await generateCompletionEncouragement({
            examTitle: cfg.title || orchestratedTitle || "备考任务",
            daysUntil: days,
            newDone: stats.newDone,
            reviewedTotal: stats.reviewed,
          });
          if (active) {
            setEncouragement(text);
            await markTodayPlanCompleted(text);
          }
        } catch {
          // fallback
        } finally {
          if (active) setEncouragementLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }
  }, [finished, isOrchestrated, stats.reviewed, stats.newDone, orchestratedTitle]);

  // 跟踪本轮会话是否已向云端提交推送，避免重复推送
  const hasPushedInSessionRef = useRef(false);

  // 学习完成时自动同步进度至云端
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  useEffect(() => {
    if (finished && (stats.reviewed + stats.newDone > 0)) {
      hasPushedInSessionRef.current = true;
      setSyncNotice("正在自动同步云端进度...");
      autoPushIfConfigured()
        .then((res) => {
          if (res.ok) {
            setSyncNotice("学习进度已自动同步至云端");
            setTimeout(() => setSyncNotice(null), 3500);
          } else if (res.conflict) {
            setSyncNotice("云端有新进度冲突，已保留本地学习记录，可在设置页处理");
          } else {
            setSyncNotice(null);
          }
        })
        .catch(() => {
          setSyncNotice(null);
        });
    }
  }, [finished, stats.reviewed, stats.newDone]);

  // 页面离开/侧边栏切换/路由跳转/组件卸载时：若本轮有评分操作且未推送过，静默触发自动上传
  useEffect(() => {
    return () => {
      const store = useStudyStore.getState();
      const ratedCount = store.stats.reviewed + store.stats.newDone + store.stats.actions;
      if (ratedCount > 0 && !hasPushedInSessionRef.current) {
        hasPushedInSessionRef.current = true;
        void autoPushIfConfigured().catch(() => {});
      }
    };
  }, []);

  const handleRefreshEncouragement = async () => {
    setEncouragementRefreshing(true);
    try {
      const cfg = await getExamConfig();
      const days = cfg.date ? getDaysUntilExam(cfg.date) : 0;
      const text = await generateCompletionEncouragement({
        examTitle: cfg.title || orchestratedTitle || "备考任务",
        daysUntil: days,
        newDone: stats.newDone,
        reviewedTotal: stats.reviewed,
      });
      setEncouragement(text);
      await markTodayPlanCompleted(text);
    } catch {
      // ignore
    } finally {
      setEncouragementRefreshing(false);
    }
  };

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

  // 当会话完成或空队列时，查询词库是否还有未学新词
  useEffect(() => {
    if (finished && deckId !== null) {
      if (isOrchestrated) {
        getExamConfig()
          .then((cfg) => db.getNewCountByDecks(cfg.deckIds, cfg.ignoredTags))
          .then((cnt) => setRemainingNew(cnt))
          .catch(() => setRemainingNew(null));
      } else {
        db.getNewCards(deckId, 100, tagName || undefined, keyOnly)
          .then((cards) => setRemainingNew(cards.length))
          .catch(() => setRemainingNew(null));
      }
    }
  }, [finished, deckId, tagName, keyOnly, isOrchestrated]);

  const item = queue[index];
  const total = queue.length;
  const done = stats.reviewed;
  const sessionDuration = stats.sessionStartTime > 0
    ? formatDuration((Date.now() - stats.sessionStartTime) / 1000)
    : "0 秒";

  // 当前音标：卡片字段优先，异步获取结果其次；派生值保证切换卡片时同步更新
  const phoneticText = item ? getDisplayPhonetic(item.row.phonetic, phoneticMap, item.row.card_id) : "";

  // 当前卡片是否属于弱词（达到遗忘阈值或手动收录）
  const isCurrentWeak = Boolean(
    item && (
      item.row.lapses >= leechThreshold ||
      weakCardIds.has(item.row.card_id)
    )
  );

  // 快捷加入 / 移出弱词本
  const handleToggleWeak = async () => {
    if (!item) return;
    const cardId = item.row.card_id;
    try {
      if (isCurrentWeak) {
        await db.dismissWeakWord(cardId);
        setWeakCardIds((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
        item.row.lapses = 0;
        setWeakNotice("已从弱词本移出");
      } else {
        await db.markCardWeak(cardId, leechThreshold);
        setWeakCardIds((prev) => new Set(prev).add(cardId));
        item.row.lapses = Math.max(item.row.lapses, leechThreshold);
        setWeakNotice("已加入弱词本");
      }
      setTimeout(() => setWeakNotice(null), 2500);
    } catch (e) {
      setWeakNotice(`操作失败: ${String(e)}`);
      setTimeout(() => setWeakNotice(null), 3000);
    }
  };

  // 预先加载队列前 5 个单词/词组的例句、音标与发音，展示时直接命中本地持久化缓存
  useEffect(() => {
    let cancelled = false;
    for (let i = index; i < Math.min(queue.length, index + 5); i++) {
      const row = queue[i]?.row;
      if (!row) continue;
      if (getCardExamples(row.tags).length === 0) {
        void fetchExamples(row.front).catch(() => {});
      }
      void preloadSpeech(row.front).catch(() => {});
      if (!row.phonetic) {
        void fetchPhonetic(row.front)
          .then((p) => {
            if (cancelled || !p) return;
            setPhoneticMap((prev) =>
              prev[row.card_id] === p ? prev : { ...prev, [row.card_id]: p }
            );
          })
          .catch(() => {});
      }
    }
    return () => {
      cancelled = true;
    };
  }, [queue, index]);

  // 当前单词音标：卡片字段为空时惰性在线查询并回写 DB；查询结果写入 phoneticMap 供同步渲染
  useEffect(() => {
    if (!item) return;
    if (item.row.phonetic) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await fetchPhonetic(item.row.front);
        if (cancelled || !p) return;
        setPhoneticMap((prev) =>
          prev[item.row.card_id] === p ? prev : { ...prev, [item.row.card_id]: p }
        );
        // 回写 DB，后续不再重复查询
        await db.updateCard(item.row.card_id, { phonetic: p });
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [item]);

  // 本轮结束：如果处于休息锁，显示休息提示
  useEffect(() => {
    if (!finished) {
      setRestLabel("");
      return;
    }
    (async () => {
      const until = await getRestUntil().catch(() => 0);
      if (until > Date.now()) {
        const mins = Math.ceil((until - Date.now()) / 60000);
        setRestLabel(`已达本轮学习上限，建议休息 ${mins} 分钟`);
      }
    })().catch(() => {});
  }, [finished]);

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
    let cancelled = false;
    db.getRandomDistractors(deckId ?? 0, 0, 100)
      .then((cards) => {
        if (cancelled) return;
        setDeckDistractors(cards);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // 将数据库干扰项池与当前队列卡片融合，确保随时有充足的干扰项
  const effectiveDistractors = useMemo(() => {
    const map = new Map<string, Distractor>();
    for (const c of deckDistractors) {
      if (c.front) map.set(c.front.trim().toLowerCase(), c);
    }
    for (const q of queue) {
      const c = q.row;
      if (c.front && !map.has(c.front.trim().toLowerCase())) {
        map.set(c.front.trim().toLowerCase(), c);
      }
    }
    return Array.from(map.values());
  }, [deckDistractors, queue]);

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
            {isOrchestrated ? (
              <span className="flex items-center gap-1.5 font-medium text-primary">
                <Sparkles className="size-3.5" />
                {orchestratedTitle || "AI 备考任务编排"}
              </span>
            ) : (
              <>
                词库：{deckName}
                {tagName && " · 标签：" + tagName}
              </>
            )}
          </span>
        </div>

        {/* AI 编排备考任务达成专属祝贺卡片 */}
        {isOrchestrated && done > 0 && (
          <Card className="border-primary/40 bg-gradient-to-br from-primary/10 via-background to-amber-500/10 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  <Sparkles className="size-5 text-amber-500" />
                  今日备考任务圆满达成 🎉
                </CardTitle>
                <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                  {orchestratedTitle || "AI 编排"}
                </Badge>
              </div>
              <CardDescription>
                恭喜！今日规划的全部生词与复习任务已顺利完成，备考底气又厚实了一层！
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 鼓励语卡片 */}
              <div className="relative rounded-xl border border-primary/20 bg-background/80 p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="size-3" />
                      专属备考鼓励语
                    </p>
                    {encouragementLoading ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                        AI 备考导师正在根据今日战报为你生成专属鼓励语…
                      </div>
                    ) : (
                      <p className="text-sm font-medium italic leading-relaxed text-foreground/95">
                        “{encouragement || "乾坤未定，你我皆是黑马！今天的任务稳稳拿下，考场见证你的蜕变！🏆"}”
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRefreshEncouragement}
                    disabled={encouragementLoading || encouragementRefreshing}
                    className="shrink-0 text-xs h-7 px-2 text-muted-foreground hover:text-primary"
                    title="换一句鼓励语"
                  >
                    <RefreshCw className={encouragementRefreshing ? "size-3 animate-spin" : "size-3"} />
                  </Button>
                </div>
              </div>

              {/* 达成统计小结 */}
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="text-lg font-bold text-primary">{stats.newDone}</div>
                  <div className="text-[11px] text-muted-foreground">今日新学词汇</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {stats.reviewed}
                  </div>
                  <div className="text-[11px] text-muted-foreground">复习巩固词汇</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="text-lg font-bold text-foreground">
                    {Math.round(
                      (done / Math.max(1, orchestratedTarget || done)) * 100
                    )}%
                  </div>
                  <div className="text-[11px] text-muted-foreground">任务达成率</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 标签学习完成：建议立即进行该标签集的选择/填空测试 */}
        {finished && done > 0 && tagName && deckId !== null && deckId > 0 && onStartTagQuiz && (
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
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            {done > 0 ? (
              <CheckCircle2 className="size-10 text-green-500" />
            ) : (
              <BookOpen className="size-10 text-muted-foreground" />
            )}
            <CardTitle>{done > 0 ? (isOrchestrated ? "本次学习已完成" : "本轮完成") : "今日没有需要学习的卡片"}</CardTitle>
            <CardDescription className="max-w-md">
              {done > 0 ? (
                <>
                  复习 {stats.reviewed} 张 · 新卡 {stats.newDone} 张 · 忘记 {stats.again} 张
                  {stats.hard > 0 ? ` · 模糊 ${stats.hard} 张` : ""}
                </>
              ) : (
                isOrchestrated
                  ? "选定词库与标签范围内，今日已无可学卡片或已达成今日配额。"
                  : "「" + deckName + (tagName ? " · " + tagName : "") + "」当前没有到期的卡片或可用新卡配额。"
              )}
            </CardDescription>
            {restLabel && (
              <p className="text-sm font-medium text-amber-600">{restLabel}</p>
            )}
            {done > 0 && (
              <p className="text-xs text-muted-foreground">本次学习时长：{sessionDuration}</p>
            )}
            {syncNotice && (
              <p className="text-xs text-muted-foreground">{syncNotice}</p>
            )}
            {done > 0 && stats.weakWords.length > 0 && (
              <div className="w-full max-w-md rounded-lg bg-muted/50 p-3 text-left">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">需要关注的生词</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(stats.weakWords)].slice(0, 8).map((w) => (
                    <Badge key={w} variant="destructive">{w}</Badge>
                  ))}
                </div>
              </div>
            )}
            {remainingNew !== null && remainingNew > 0 && !isOrchestrated && deckId !== null && deckId > 0 && (
              <div className="w-full max-w-md rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
                <p className="text-sm font-medium">
                  该范围还有 <span className="font-bold text-primary">{remainingNew >= 100 ? "100+" : remainingNew}</span> 张未学习的新词
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  已达今日计划配额？可自主加学新词继续背诵：
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void loadQueue(deckId, tagName || undefined, keyOnly, 20)}
                  >
                    加学 20 张新词
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void loadQueue(deckId, tagName || undefined, keyOnly, 10)}
                  >
                    加学 10 张
                  </Button>
                </div>
              </div>
            )}
            {remainingNew !== null && remainingNew > 0 && isOrchestrated && (
              <div className="w-full max-w-md rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  编排词库中还有 <span className="font-semibold text-primary">{remainingNew}</span> 张未学新词，已为你平均分摊到后续备考日常。
                </p>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button onClick={() => reset()}>{isOrchestrated ? "返回仪表盘" : "返回词库选择"}</Button>
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
      back={getCardMeaning(item.row)}
      cardState={rowToState(item.row)}
      strategyOverride={modeConfig?.aiStrategy ?? undefined}
      defaultExpanded={modeConfig?.mode === "new_teach" || modeConfig?.mode === "ai_drill"}
      onGradeDecided={(grade, question, answer) =>
        handleAIComplete(grade, question ?? "", answer ?? "")
      }
    />
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-2.5 sm:space-y-6">
      <div className="flex items-center justify-between gap-2 pt-0.5 sm:pt-0">
        <Button variant="ghost" size="sm" onClick={() => setExitOpen(true)} className="h-8 px-2 text-xs sm:text-sm">
          <ArrowLeft className="size-4 mr-1" />
          退出
        </Button>
        <div className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
          <span className="font-medium truncate max-w-[130px] sm:max-w-none">{deckName}</span>
          {tagName && (
            <Badge variant="secondary" className="text-[10px] truncate max-w-[80px]">
              <Tag className="size-2.5 mr-0.5" />
              {tagName}
            </Badge>
          )}
          {keyOnly && (
            <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
              <Star className="size-2.5 mr-0.5" />
              重点
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground shrink-0 font-medium">
          {done} / {total}
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-1 sm:h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: total > 0 ? ((index / total) * 100).toFixed(1) + "%" : "0%" }}
        />
      </div>

      {/* 快捷操作：加入弱词本 / 跳过 / 忽略 */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground font-mono">
          卡片 {index + 1}
        </div>
        <div className="flex items-center gap-1.5">
          {weakNotice && (
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 animate-in fade-in duration-200">
              {weakNotice}
            </span>
          )}
          <Button
            size="sm"
            variant={isCurrentWeak ? "secondary" : "ghost"}
            onClick={handleToggleWeak}
            className={`h-7 px-2 text-xs gap-1 transition-all ${
              isCurrentWeak
                ? "border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "text-muted-foreground hover:text-amber-600"
            }`}
            title={isCurrentWeak ? "已在弱词本，点击移出" : "快速将该单词加入弱词本以重点攻克"}
          >
            {isCurrentWeak ? (
              <Check className="size-3.5 text-amber-600 dark:text-amber-400" />
            ) : (
              <AlertTriangle className="size-3.5 text-amber-500" />
            )}
            <span className="hidden sm:inline">{isCurrentWeak ? "已在弱词本" : "加入弱词本"}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => skip()} className="h-7 px-2 text-xs">
            跳过
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void ignore()} className="h-7 px-2 text-xs text-muted-foreground">
            忽略
          </Button>
        </div>
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
                  distractors={effectiveDistractors}
                  quickMs={quickMs}
                  onReveal={() => void handleReveal()}
                  onRate={(grade) => void handleRate(grade)}
                  onRateReadyChange={setRateReady}
                  />
                </>
              )
            )}

            <div className="hidden sm:flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Keyboard className="size-3.5" />
              {ratingMode === "3" ? "快捷键：1 不记得 · 2 模糊 · 3 已掌握" : "快捷键：1 忘了 · 2 困难 · 3 已掌握 · 4 简单"}
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

      {/* 中途退出确认 */}
      <ConfirmDialog
        open={exitOpen}
        onOpenChange={setExitOpen}
        title="确认退出学习？"
        description="退出后回到词库选择，当前未完成队列将清空。已评分记录不会丢失。"
        confirmLabel="退出"
        cancelLabel="继续学习"
        onConfirm={() => {
          setExitOpen(false);
          const ratedCount = stats.reviewed + stats.newDone + stats.actions;
          if (ratedCount > 0 && !hasPushedInSessionRef.current) {
            hasPushedInSessionRef.current = true;
            void autoPushIfConfigured().catch(() => {});
          }
          useStudyStore.getState().reset();
          navigate("/study");
        }}
      />
    </div>
  );
}

/** 学习范围设置弹窗（以 Dialog 替代原先突兀的页面级全屏跳转） */
interface TagScopeDialogProps {
  deck: { id: number; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (tag?: string, keyOnly?: boolean) => void;
}

function TagScopeDialog({ deck, open, onOpenChange, onStart }: TagScopeDialogProps) {
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);
  const [selectedKeyOnly, setSelectedKeyOnly] = useState(false);

  useEffect(() => {
    if (!open || !deck) return;
    setLoading(true);
    setSelectedTag(undefined);
    setSelectedKeyOnly(false);
    Promise.all([
      db.getDeckTagsWithCount(deck.id),
      db.getDeckKeyCount(deck.id),
      getDeckShuffle(deck.id),
    ])
      .then(([t, k, s]) => {
        setTags(t);
        setTotal(t.reduce((acc, x) => acc + x.count, 0));
        setKeyCount(k);
        setShuffle(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, deck]);

  const toggleShuffle = async (v: boolean) => {
    if (!deck) return;
    setShuffle(v);
    await saveDeckShuffle(deck.id, v).catch(() => {});
  };

  const handleStart = () => {
    onOpenChange(false);
    onStart(selectedTag, selectedKeyOnly);
  };

  if (!deck) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[calc(100%-2rem)] p-4 sm:p-6 gap-3">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Layers className="size-4 text-primary" />
            选择学习范围
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            词库：{deck.name} · 共 {total} 张卡片
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            <Loader2 className="size-4 animate-spin mr-2" />
            读取标签范围...
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {/* 全部卡片 */}
              <button
                type="button"
                onClick={() => {
                  setSelectedTag(undefined);
                  setSelectedKeyOnly(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all text-sm cursor-pointer",
                  !selectedTag && !selectedKeyOnly
                    ? "border-primary bg-primary/10 text-primary font-medium shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                )}
              >
                <span className="flex items-center gap-2">
                  <Layers className="size-4" />
                  全部卡片
                </span>
                <Badge variant={!selectedTag && !selectedKeyOnly ? "default" : "secondary"} className="text-xs">
                  {total} 张
                </Badge>
              </button>

              {/* 重点词 */}
              {keyCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTag(undefined);
                    setSelectedKeyOnly(true);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all text-sm cursor-pointer",
                    selectedKeyOnly
                      ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium shadow-xs"
                      : "border-amber-500/30 hover:bg-amber-500/5 text-foreground"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Star className="size-4 text-amber-500" />
                    重点词 / 词组
                  </span>
                  <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                    {keyCount} 张
                  </Badge>
                </button>
              )}

              {/* 具体标签分类 */}
              {tags.map((t) => {
                const isSelected = selectedTag === t.tag;
                return (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => {
                      setSelectedTag(t.tag);
                      setSelectedKeyOnly(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all text-sm cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-medium shadow-xs"
                        : "border-border hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Tag className="size-4 shrink-0" />
                      <span className="truncate">{t.tag}</span>
                    </span>
                    <Badge variant={isSelected ? "default" : "secondary"} className="text-xs shrink-0">
                      {t.count} 张
                    </Badge>
                  </button>
                );
              })}

              {tags.length === 0 && keyCount === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  该词库未设置细分标签，将学习全部卡片
                </p>
              )}
            </div>

            {/* 乱序学习设置 */}
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-muted/20">
              <div className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-xs sm:text-sm font-medium">
                  <Shuffle className="size-3.5 text-muted-foreground" />
                  乱序学习
                </p>
                <p className="text-[11px] text-muted-foreground">打乱卡片顺序（按词库记忆）</p>
              </div>
              <Switch checked={shuffle} onCheckedChange={(v) => void toggleShuffle(v)} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            取消
          </Button>
          <Button size="sm" onClick={handleStart} className="flex-1 sm:flex-none">
            <RefreshCw className="size-3.5 mr-1.5" />
            开始学习
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 学习中心与词库选择台（移动端与桌面端自适应紧凑布局） */
function DeckPicker({
  onStartStudy,
  onOpenScope,
  onStartOrchestrated,
}: {
  onStartStudy: (id: number, tag?: string, keyOnly?: boolean) => void;
  onOpenScope: (deck: { id: number; name: string }) => void;
  onStartOrchestrated?: () => void;
}) {
  const { decks, cardCounts, refresh } = useDeckStore();
  const [lastStudy, setLastStudy] = useState<{ deckId: number; tag?: string; keyOnly?: boolean } | null>(null);
  const [orchestratedPlan, setOrchestratedPlan] = useState<TodayOrchestratedPlan | null>(null);
  const [dueMap, setDueMap] = useState<Record<number, number>>({});

  useEffect(() => {
    refresh();
    void autoPullIfRemoteNewer()
      .then((pulled) => {
        if (pulled) refresh();
      })
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (decks.length === 0) return;
    const nowIso = new Date().toISOString();
    Promise.all([
      getLastStudyContext(),
      getTodayOrchestratedPlan(decks).catch(() => null),
      Promise.all(
        decks.map(async (d) => {
          const due = await db.getDueCountByDecks([d.id], nowIso).catch(() => 0);
          return [d.id, due] as const;
        })
      ),
    ])
      .then(([last, plan, duePairs]) => {
        setLastStudy(last);
        setOrchestratedPlan(plan);
        setDueMap(Object.fromEntries(duePairs));
      })
      .catch(() => {});
  }, [decks]);

  if (decks.length === 0) {
    return (
      <Card className="mx-auto max-w-xl border-dashed">
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

  const lastDeck = lastStudy ? decks.find((d) => d.id === lastStudy.deckId) : null;
  const hasOrchestratedPlan =
    orchestratedPlan &&
    orchestratedPlan.deckIds.length > 0 &&
    (orchestratedPlan.targetNew > 0 || orchestratedPlan.targetReview > 0 || orchestratedPlan.isCompleted);

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6 pb-6">
      {/* 顶部标题区（移动端更紧凑精致） */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">学习中心</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            选择词库或从备考规划直接进入
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 text-xs h-8">
          <Link to="/decks">管理词库</Link>
        </Button>
      </div>

      {/* 1. AI 备考规划 Hero 卡片（若有配置备考目标） */}
      {hasOrchestratedPlan && onStartOrchestrated && (
        <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-background to-primary/10 shadow-xs">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                  <GraduationCap className="size-4 sm:size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm sm:text-base">
                      {orchestratedPlan.examTitle || "今日 AI 备战规划"}
                    </span>
                    {orchestratedPlan.isCompleted ? (
                      <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-[10px] text-green-600 dark:text-green-400">
                        今日已达成
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        规划中
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    覆盖 {orchestratedPlan.deckIds.length} 个词库
                    {orchestratedPlan.daysUntilExam > 0 && ` · 距考试 ${orchestratedPlan.daysUntilExam} 天`}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={onStartOrchestrated}
                className="shrink-0 text-xs h-8 sm:h-9"
              >
                <RefreshCw className="size-3.5 mr-1" />
                {orchestratedPlan.isCompleted ? "继续巩固" : "开始今日备考"}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="rounded-md bg-background/80 border p-2">
                <div className="text-base sm:text-lg font-bold text-primary">{orchestratedPlan.targetNew}</div>
                <div className="text-[11px] text-muted-foreground">今日待新学</div>
              </div>
              <div className="rounded-md bg-background/80 border p-2">
                <div className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">{orchestratedPlan.targetReview}</div>
                <div className="text-[11px] text-muted-foreground">今日待复习</div>
              </div>
              <div className="rounded-md bg-background/80 border p-2">
                <div className="text-base sm:text-lg font-bold text-foreground">{orchestratedPlan.totalTarget}</div>
                <div className="text-[11px] text-muted-foreground">今日总指标</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. 快捷继续上次学习（如果有记录且不在备战卡中重复） */}
      {lastDeck && lastStudy && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs sm:text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">继续上次：</span>
            <span className="font-medium truncate">{lastDeck.name}</span>
            {lastStudy.tag && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {lastStudy.tag}
              </Badge>
            )}
            {lastStudy.keyOnly && (
              <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px] shrink-0">
                重点
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStartStudy(lastStudy.deckId, lastStudy.tag, lastStudy.keyOnly)}
            className="h-7 px-2.5 text-xs text-primary font-medium hover:text-primary hover:bg-primary/10 shrink-0"
          >
            立即继续
            <ArrowLeft className="size-3.5 ml-1 rotate-180" />
          </Button>
        </div>
      )}

      {/* 3. 词库列表 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>全部词库 ({decks.length})</span>
          <span>点击直接开始，点击「范围」可细分标签</span>
        </div>

        <div className="space-y-2.5">
          {decks.map((d) => {
            const cardCount = cardCounts[d.id] ?? 0;
            const dueCount = dueMap[d.id] ?? 0;
            return (
              <Card
                key={d.id}
                className="transition-all hover:border-primary/50 hover:shadow-xs group"
              >
                <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                  {/* 左侧：点击打开范围设置弹窗 */}
                  <div
                    onClick={() => onOpenScope({ id: d.id, name: d.name })}
                    className="min-w-0 flex-1 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors truncate">
                        {d.name}
                      </span>
                      {dueCount > 0 && (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] shrink-0 px-1.5 py-0">
                          {dueCount} 到期
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{cardCount} 张卡片</span>
                      <span>·</span>
                      <span>每日新卡 {d.new_cards_per_day}</span>
                    </div>
                  </div>

                  {/* 右侧操作按钮 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenScope({ id: d.id, name: d.name })}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      title="选择学习标签范围与偏好"
                    >
                      <SlidersHorizontal className="size-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">范围</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onStartStudy(d.id)}
                      className="h-8 px-3 text-xs"
                    >
                      <RefreshCw className="size-3 mr-1" />
                      开始
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Study() {
  const { deckId, loading, error, loadQueue, loadOrchestratedQueue } = useStudyStore();
  const [quizDeck, setQuizDeck] = useState<{ id: number; name: string; tag?: string; ai?: boolean; smart?: boolean } | null>(null);
  const [scopeDeck, setScopeDeck] = useState<{ id: number; name: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const quizParam = searchParams.get("quiz");
  const deckParam = searchParams.get("deck");
  const tagParam = searchParams.get("tag");
  const aiParam = searchParams.get("ai");
  const smartParam = searchParams.get("smart");
  const recordParam = searchParams.get("record");

  // 直接学习入口：/study?deck=<deckId> 或 /study?deck=<deckId>&tag=<tag>
  useEffect(() => {
    if (!deckParam) return;
    const id = parseInt(deckParam, 10);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      const store = useDeckStore.getState();
      if (!store.decks.some((d) => d.id === id)) await store.refresh();
      if (cancelled) return;
      const d = useDeckStore.getState().decks.find((x) => x.id === id);
      if (d) {
        if (tagParam) {
          useStudyStore.getState().reset();
          await loadQueue(d.id, tagParam);
        } else {
          setScopeDeck({ id: d.id, name: d.name });
        }
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deckParam, tagParam, loadQueue]);

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

  if (deckId === null) {
    return (
      <>
        <DeckPicker
          onStartStudy={(id, tag, keyOnly) => {
            useStudyStore.getState().reset();
            loadQueue(id, tag, keyOnly);
          }}
          onOpenScope={(d) => setScopeDeck(d)}
          onStartOrchestrated={async () => {
            const decks = useDeckStore.getState().decks;
            const plan = await getTodayOrchestratedPlan(decks).catch(() => null);
            if (!plan) return;
            useStudyStore.getState().reset();
            await loadOrchestratedQueue({
              deckIds: plan.deckIds,
              ignoredTags: plan.ignoredTags,
              targetNew: plan.targetNew,
              targetReview: plan.targetReview,
              title: `${plan.examTitle} · 今日任务`,
            });
          }}
        />

        {/* 学习范围设置轻量弹窗（彻底取代原先突兀的页面级全屏跳转） */}
        <TagScopeDialog
          deck={scopeDeck}
          open={scopeDeck !== null}
          onOpenChange={(open) => {
            if (!open) setScopeDeck(null);
          }}
          onStart={(tag, keyOnly) => {
            if (!scopeDeck) return;
            const targetId = scopeDeck.id;
            setScopeDeck(null);
            useStudyStore.getState().reset();
            loadQueue(targetId, tag, keyOnly);
          }}
        />
      </>
    );
  }

  return (
    <StudySession
      onStartTagQuiz={(deckId, tag) => {
        setSearchParams({ quiz: String(deckId), tag }, { replace: true });
      }}
    />
  );
}
