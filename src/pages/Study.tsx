import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Keyboard,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StudyCardRow } from "@/lib/db";
import { previewIntervals, getRetrievability, type IntervalPreview } from "@/lib/fsrs";
import { getEffectiveRetention } from "@/lib/settings";
import { useStudyStore } from "@/stores/useStudyStore";
import { useDeckStore } from "@/stores/useDeckStore";
import type { CardState } from "@/types";
import QuizSession from "@/components/quiz/QuizSession";
import AIDeepReviewDialog from "@/components/ai/AIDeepReviewDialog";

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

/** 学习主界面 */
function StudySession() {
  const { deckName, queue, index, stats, finished, rate, markShown, reset } = useStudyStore();
  const [flipped, setFlipped] = useState(false);
  const [preview, setPreview] = useState<IntervalPreview | null>(null);
  const [retrievability, setRetrievability] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);

  const item = queue[index];
  const total = queue.length;
  const done = stats.reviewed;

  // 卡片切换时：重置翻转状态、记录展示时间
  useEffect(() => {
    setFlipped(false);
    setPreview(null);
    setRetrievability(null);
    if (item) {
      markShown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue.length]);

  const showAnswer = async () => {
    if (!item || flipped) return;
    setFlipped(true);
    const state = rowToState(item.row);
    getEffectiveRetention().then((retention) => {
      previewIntervals(state, undefined, retention).then(setPreview).catch(() => {});
      getRetrievability(state, undefined, retention).then(setRetrievability).catch(() => {});
    });
  };

  const handleRate = useCallback(
    async (grade: 1 | 2 | 3 | 4) => {
      if (!flipped || busy) return;
      // 先同步收起卡片，避免新卡片以"已翻转"状态渲染一帧（露出释义）
      setFlipped(false);
      setBusy(true);
      try {
        await rate(grade);
      } finally {
        setBusy(false);
      }
    },
    [flipped, busy, rate]
  );

  /** AI 深度复习完成：以 ai_test 来源评分并推进队列 */
  const handleAIComplete = useCallback(
    async (grade: 1 | 2 | 3 | 4, aiQuestion: string, aiAnswer: string) => {
      if (!item || busy) return;
      setBusy(true);
      try {
        await rate(grade, Date.now() - item.shownAt, {
          source: "ai_test",
          aiQuestion,
          aiAnswer,
        });
      } finally {
        setBusy(false);
      }
    },
    [item, busy, rate]
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
          <span className="text-sm text-muted-foreground">词库：{deckName}</span>
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
                </>
              ) : (
                "词库「" + deckName + "」当前没有到期的卡片或可用新卡配额。"
              )}
            </CardDescription>
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

      {/* 卡片翻转区（key 按卡片重建，杜绝切换瞬间残留翻转状态） */}
      <div className="[perspective:1000px]" key={item.row.card_id}>
        <div
          className={cn(
            "relative min-h-80 w-full transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* 正面 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8 [backface-visibility:hidden]">
            {tags.length > 0 && (
              <div className="flex gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
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

      {/* 评分按钮（Tooltip 说明四档含义） */}
      <div className="grid grid-cols-4 gap-3">
        {RATINGS.map((r) => (
          <Tooltip key={r.grade}>
            <TooltipTrigger asChild>
              {/* span 包裹：disabled 按钮不触发指针事件，span 保证悬停提示始终可用 */}
              <span tabIndex={0} className="inline-flex">
                <Button
                  variant={r.grade === 1 ? "destructive" : "outline"}
                  className="w-full flex-col gap-0.5 py-3 disabled:opacity-60"
                  disabled={!flipped || busy}
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

      <Button
        variant="secondary"
        className="w-full"
        disabled={busy}
        onClick={() => setAiReviewOpen(true)}
      >
        <Sparkles className="size-4" />
        AI 深度复习（生成完形/语境题并判分）
      </Button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Keyboard className="size-3.5" />
        快捷键：1 忘了 · 2 困难 · 3 良好 · 4 简单 · 悬停按钮查看说明
      </div>

      {/* AI 深度复习对话框 */}
      <AIDeepReviewDialog
        open={aiReviewOpen}
        onOpenChange={setAiReviewOpen}
        front={item.row.front}
        back={item.row.back}
        onComplete={handleAIComplete}
      />
    </div>
  );
}

/** 词库选择页（学习 / 测试两个入口） */
function DeckPicker({ onStudy, onQuiz }: { onStudy: (id: number) => void; onQuiz: (id: number) => void }) {
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
                <Button onClick={() => onStudy(d.id)}>
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

export default function Study() {
  const { deckId, loading, error, loadQueue } = useStudyStore();
  const [quizDeck, setQuizDeck] = useState<{ id: number; name: string } | null>(null);

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

  if (deckId === null) {
    return (
      <DeckPicker
        onStudy={(id) => loadQueue(id)}
        onQuiz={(id) => {
          const d = useDeckStore.getState().decks.find((x) => x.id === id);
          setQuizDeck({ id, name: d?.name ?? "词库" });
        }}
      />
    );
  }

  return <StudySession />;
}
