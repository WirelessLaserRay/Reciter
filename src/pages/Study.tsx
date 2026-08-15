import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Keyboard,
  Layers,
  Loader2,
  RefreshCw,
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
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { db, type StudyCardRow } from "@/lib/db";
import { previewIntervals, getRetrievability, type IntervalPreview } from "@/lib/fsrs";
import { getEffectiveRetention } from "@/lib/settings";
import { getActiveRecallEnabled, getRatingMode, getSummaryInterval } from "@/lib/study-prefs";
import { matchRecall, type RecallMatchResult } from "@/lib/recall-match";
import { useStudyStore } from "@/stores/useStudyStore";
import { useDeckStore } from "@/stores/useDeckStore";
import type { CardState } from "@/types";
import QuizSession from "@/components/quiz/QuizSession";
import AIChatPanel from "@/components/ai/AIChatPanel";

const RATINGS = [
  {
    grade: 1 as const,
    label: "忘了",
    hint: "Again",
    desc: "完全没想起来或答错 → 立即重学，几分钟后再次出现",
  },
  {
    grade: 2 as const,
    label: "困难",
    hint: "Hard",
    desc: "想起来了但很吃力 → 较短间隔复习",
  },
  {
    grade: 3 as const,
    label: "良好",
    hint: "Good",
    desc: "基本掌握 → 按正常记忆曲线安排",
  },
  {
    grade: 4 as const,
    label: "简单",
    hint: "Easy",
    desc: "非常轻松 → 跳过学习步骤，大幅延长间隔",
  },
];

const RATINGS_3 = [
  {
    grade: 1 as const,
    label: "不记得",
    emoji: "😕",
    hint: "Again",
    desc: "没想起来 → 立即重学",
  },
  {
    grade: 2 as const,
    label: "模糊",
    emoji: "🤔",
    hint: "Hard",
    desc: "想起来了但不确定 → 较短间隔",
  },
  {
    grade: 3 as const,
    label: "记得",
    emoji: "😊",
    hint: "Good",
    desc: "基本掌握 → 正常安排",
  },
];

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

function tagsOf(raw: string): string[] {
  try {
    const t = JSON.parse(raw);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
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

/** 学习主界面 */
function StudySession() {
  const { deckName, tagName, keyOnly, queue, index, stats, finished, rate, markShown, reset } = useStudyStore();
  const navigate = useNavigate();
  const [flipped, setFlipped] = useState(false);
  const [preview, setPreview] = useState<IntervalPreview | null>(null);
  const [retrievability, setRetrievability] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Phase 6A 学习偏好
  const [ratingMode, setRatingMode] = useState<"3" | "4">("3");
  const [activeRecallEnabled, setActiveRecallEnabled] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState(10);
  const [showMiniSummary, setShowMiniSummary] = useState(false);
  const [recallPhase, setRecallPhase] = useState<"prompt" | "input" | "result" | "off">("prompt");
  const [recallInput, setRecallInput] = useState("");
  const [recallResult, setRecallResult] = useState<RecallMatchResult | null>(null);
  const [limitedRatings, setLimitedRatings] = useState(false);

  const item = queue[index];
  const total = queue.length;
  const done = stats.reviewed;
  const sessionDuration = stats.sessionStartTime > 0
    ? formatDuration((Date.now() - stats.sessionStartTime) / 1000)
    : "0 秒";

  // 加载学习偏好
  useEffect(() => {
    (async () => {
      const [rm, ar, si] = await Promise.all([
        getRatingMode(),
        getActiveRecallEnabled(),
        getSummaryInterval(),
      ]);
      setRatingMode(rm);
      setActiveRecallEnabled(ar);
      setSummaryInterval(si);
    })().catch(() => {});
  }, []);

  // 卡片切换时：重置翻转/回忆状态、记录展示时间
  useEffect(() => {
    setFlipped(false);
    setPreview(null);
    setRetrievability(null);
    setRecallInput("");
    setRecallResult(null);
    setLimitedRatings(false);
    setRecallPhase(activeRecallEnabled ? "prompt" : "off");
    // 迷你小结出现时先不开始下一张卡片的计时，等用户点「继续学习」再记录
    if (item && !showMiniSummary) {
      markShown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue.length, activeRecallEnabled]);

  const showAnswer = async () => {
    if (!item || flipped) return;
    setFlipped(true);
    const state = rowToState(item.row);
    getEffectiveRetention().then((retention) => {
      previewIntervals(state, undefined, retention).then(setPreview).catch(() => {});
      getRetrievability(state, undefined, retention).then(setRetrievability).catch(() => {});
    });
  };

  /** 主动回忆：不确定 → 直接看释义，只提供「不记得/模糊」两档 */
  const handleDontKnow = () => {
    if (!item) return;
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(true);
    void showAnswer();
  };

  /** 主动回忆：检查用户输入的释义 */
  const handleCheckRecall = () => {
    if (!item || !recallInput.trim()) return;
    const result = matchRecall(recallInput, item.row.back);
    setRecallResult(result);
    setRecallPhase("result");
    setLimitedRatings(false);
    void showAnswer();
  };

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
      if ((!flipped && recallPhase !== "result") || busy) return;
      if (limitedRatings && (grade === 3 || grade === 4)) return;
      // 先同步收起卡片，避免新卡片以"已翻转"状态渲染一帧（露出释义）
      setFlipped(false);
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
    [flipped, recallPhase, limitedRatings, busy, rate, summaryInterval]
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

  // 键盘快捷键 1-4
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = parseInt(e.key, 10);
      if (g >= 1 && g <= 4) handleRate(g as 1 | 2 | 3 | 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRate]);

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

  const tags = tagsOf(item.row.tags);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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

      {/* 迷你小结：每 N 张插入一次，替换卡片区 */}
      {showMiniSummary ? (
        <SessionMiniSummary
          stats={stats}
          onContinue={handleContinue}
          onAIReview={handleAIReviewFromSummary}
        />
      ) : (
        <>
          {/* 卡片区域（主动回忆 / 经典翻转） */}
          {recallPhase === "prompt" && (
            <div key={item.row.card_id} className="flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8">
              <div className="flex gap-1.5">
                {item.row.is_key === 1 && (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
                    <Star className="size-2.5" />
                    重点
                  </Badge>
                )}
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
              <div className="text-center text-4xl font-bold break-words">{item.row.front}</div>
              <p className="text-sm text-muted-foreground">你知道这个词的意思吗？</p>
              <div className="flex gap-3">
                <Button onClick={() => setRecallPhase("input")} size="lg">
                  我知道
                </Button>
                <Button variant="outline" onClick={handleDontKnow} size="lg">
                  不确定 / 不知道
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">主动回忆 · 先回忆再看释义</p>
            </div>
          )}

          {recallPhase === "input" && (
            <div key={item.row.card_id} className="flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8">
              <div className="flex gap-1.5">
                {item.row.is_key === 1 && (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
                    <Star className="size-2.5" />
                    重点
                  </Badge>
                )}
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
              <div className="text-center text-4xl font-bold break-words">{item.row.front}</div>
              <p className="text-sm text-muted-foreground">请输入你记得的释义：</p>
              <div className="flex w-full max-w-md gap-2">
                <Input
                  value={recallInput}
                  onChange={(e) => setRecallInput(e.target.value)}
                  placeholder="例如：放弃；抛弃"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCheckRecall();
                  }}
                  autoFocus
                />
                <Button onClick={handleCheckRecall} disabled={!recallInput.trim() || busy}>
                  检查
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">系统会模糊比对，不完全一致也没关系</p>
            </div>
          )}

          {recallPhase === "result" && (
            <div key={item.row.card_id} className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8">
              <div className="flex gap-1.5">
                {item.row.is_key === 1 && (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
                    <Star className="size-2.5" />
                    重点
                  </Badge>
                )}
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
              <div className="text-center text-3xl font-bold break-words">{item.row.front}</div>
              <div className="max-w-md text-center text-2xl font-semibold whitespace-pre-wrap break-words">
                {item.row.back}
              </div>
              {recallResult && (
                <p className={recallResult.match ? "text-sm text-green-600" : "text-sm text-amber-600"}>
                  {recallResult.match
                    ? `✅ 基本正确！相似度 ${Math.round(recallResult.similarity * 100)}%`
                    : `🤔 和标准释义有差距（相似度 ${Math.round(recallResult.similarity * 100)}%），请对照记忆`}
                </p>
              )}
              {!recallResult && (
                <p className="text-sm text-muted-foreground">没想起来也没关系，先看释义再评分</p>
              )}
              {retrievability !== null && (
                <p className="text-xs text-muted-foreground">
                  记忆可检索度：{(retrievability * 100).toFixed(0)}%
                </p>
              )}
            </div>
          )}

          {recallPhase === "off" && (
            <div className="[perspective:1000px]" key={item.row.card_id}>
              <div
                className={cn(
                  "relative min-h-80 w-full transition-transform duration-500 [transform-style:preserve-3d]",
                  flipped && "[transform:rotateY(180deg)]"
                )}
              >
                {/* 正面 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8 [backface-visibility:hidden]">
                  <div className="flex gap-1.5">
                    {item.row.is_key === 1 && (
                      <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
                        <Star className="size-2.5" />
                        重点
                      </Badge>
                    )}
                    {tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                  <div className="text-center text-4xl font-bold break-words">{item.row.front}</div>
                  {!flipped && (
                    <Button onClick={showAnswer} size="lg">
                      显示答案
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">正面 · 单词</p>
                </div>
                {/* 背面 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="text-center text-2xl font-semibold whitespace-pre-wrap break-words">
                    {item.row.back}
                  </div>
                  {retrievability !== null && (
                    <p className="text-xs text-muted-foreground">
                      记忆可检索度：{(retrievability * 100).toFixed(0)}%
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">背面 · 释义</p>
                </div>
              </div>
            </div>
          )}

          {/* 评分按钮 */}
          {flipped && (
            limitedRatings ? (
              <div className="grid grid-cols-2 gap-4">
                {RATINGS_3.slice(0, 2).map((r) => (
                  <Tooltip key={r.grade}>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex">
                        <Button
                          variant={r.grade === 1 ? "destructive" : "outline"}
                          className="w-full flex-col gap-1.5 py-5 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => handleRate(r.grade)}
                          >
                          <span className="text-lg font-semibold">
                            <span className="mr-1 text-xl">{r.emoji}</span>
                            {r.label}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {preview?.[r.grade]?.label ?? r.hint}
                          </span>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-52 text-center">
                      <p className="font-medium">{r.label}（{r.hint}）</p>
                      <p className="text-xs">{r.desc}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ) : ratingMode === "3" ? (
              <div className="grid grid-cols-3 gap-4">
                {RATINGS_3.map((r) => (
                  <Tooltip key={r.grade}>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex">
                        <Button
                          variant={r.grade === 1 ? "destructive" : "outline"}
                          className="w-full flex-col gap-1.5 py-5 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => handleRate(r.grade)}
                          >
                          <span className="text-lg font-semibold">
                            <span className="mr-1 text-xl">{r.emoji}</span>
                            {r.label}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {preview?.[r.grade]?.label ?? r.hint}
                          </span>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-52 text-center">
                      <p className="font-medium">{r.label}（{r.hint}）</p>
                      <p className="text-xs">{r.desc}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {RATINGS.map((r) => (
                  <Tooltip key={r.grade}>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex">
                        <Button
                          variant={r.grade === 1 ? "destructive" : "outline"}
                          className="w-full flex-col gap-0.5 py-3 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => handleRate(r.grade)}
                        >
                          <span>{r.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {preview?.[r.grade]?.label ?? r.hint}
                          </span>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-52 text-center">
                      <p className="font-medium">{r.label}（{r.hint}）</p>
                      <p className="text-xs">{r.desc}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )
          )}
        </>
      )}

      {!showMiniSummary && (
        <AIChatPanel
          front={item.row.front}
          back={item.row.back}
          cardState={rowToState(item.row)}
          onGradeDecided={(grade, question, answer) =>
            handleAIComplete(grade, question ?? "", answer ?? "")
          }
          onNext={() => handleAIComplete(3, "", "")}
        />
      )}

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Keyboard className="size-3.5" />
        {ratingMode === "3" ? "快捷键：1 不记得 · 2 模糊 · 3 记得" : "快捷键：1 忘了 · 2 困难 · 3 良好 · 4 简单"} · 悬停按钮查看说明
      </div>
    </div>
  );
}

/** 词库选择页（学习 / 测试两个入口） */
function DeckPicker({
  onStudy,
  onQuiz,
}: {
  onStudy: (id: number, name: string) => void;
  onQuiz: (id: number) => void;
}) {
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
          学习 = 今日到期卡片 + 配额内新卡（FSRS 调度） · 测试 = 填空/选择题检验记忆（回填 FSRS）
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
              <div className="flex shrink-0 gap-2">
                <Button onClick={() => onStudy(d.id, d.name)}>
                  <RefreshCw className="size-3.5" />
                  学习
                </Button>
                <Button variant="outline" onClick={() => onQuiz(d.id)}>
                  <ClipboardList className="size-3.5" />
                  测试
                </Button>
              </div>
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

  useEffect(() => {
    db.getDeckTagsWithCount(deckId)
      .then((t) => {
        setTags(t);
        setTotal(t.reduce((a, x) => a + x.count, 0));
      })
      .catch(() => {});
    db.getDeckKeyCount(deckId).then(setKeyCount).catch(() => {});
  }, [deckId]);

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
        </CardContent>
      </Card>
    </div>
  );
}

export default function Study() {
  const { deckId, loading, error, loadQueue } = useStudyStore();
  const [quizDeck, setQuizDeck] = useState<{ id: number; name: string } | null>(null);
  const [pendingDeck, setPendingDeck] = useState<{ id: number; name: string } | null>(null);

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

  if (quizDeck) {
    return <QuizSession deckId={quizDeck.id} deckName={quizDeck.name} onExit={() => setQuizDeck(null)} />;
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
    return (
      <DeckPicker
        onStudy={(id, name) => setPendingDeck({ id, name })}
        onQuiz={(id) => {
          const d = useDeckStore.getState().decks.find((x) => x.id === id);
          setQuizDeck({ id, name: d?.name ?? "词库" });
        }}
      />
    );
  }

  return <StudySession />;
}
