import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StudyCardRow } from "@/lib/db";
import type { IntervalPreview } from "@/lib/fsrs";
import { matchRecall, type RecallMatchResult } from "@/lib/recall-match";
import type { StudyModeConfig } from "@/lib/study-mode";
import { STUDY_MODE_LABELS } from "@/lib/study-mode";
import MarkdownContext from "./MarkdownContext";

// ============ 评分常量（Phase 6A：三档默认 / 四档可选） ============

const RATINGS_4 = [
  { grade: 1 as const, label: "忘了", emoji: null, hint: "Again", desc: "完全没想起来或答错 → 立即重学，几分钟后再次出现" },
  { grade: 2 as const, label: "困难", emoji: null, hint: "Hard", desc: "想起来了但很吃力 → 较短间隔复习" },
  { grade: 3 as const, label: "良好", emoji: null, hint: "Good", desc: "基本掌握 → 按正常记忆曲线安排" },
  { grade: 4 as const, label: "简单", emoji: null, hint: "Easy", desc: "非常轻松 → 跳过学习步骤，大幅延长间隔" },
];

const RATINGS_3 = [
  { grade: 1 as const, label: "不记得", emoji: "😕", hint: "Again", desc: "没想起来 → 立即重学" },
  { grade: 2 as const, label: "模糊", emoji: "🤔", hint: "Hard", desc: "想起来了但不确定 → 较短间隔" },
  { grade: 3 as const, label: "记得", emoji: "😊", hint: "Good", desc: "基本掌握 → 正常安排" },
];

/** 秒答阈值：熟练卡在阈值内答对 → 自动 Good */
const QUICK_MS = 8000;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tagsOf(raw: string): string[] {
  try {
    const t = JSON.parse(raw);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

// ============ 共享子组件 ============

function CardMetaBadges({ row }: { row: StudyCardRow }) {
  const tags = tagsOf(row.tags);
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {row.is_key === 1 && (
        <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
          <Star className="mr-0.5 inline size-2.5" />
          重点
        </Badge>
      )}
      {tags.map((t) => (
        <Badge key={t} variant="secondary" className="text-[10px]">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function RatingButtons({
  ratingMode,
  preview,
  busy,
  limited = false,
  onRate,
}: {
  ratingMode: "3" | "4";
  preview: IntervalPreview | null;
  busy: boolean;
  /** 仅显示「不记得 / 模糊」两档（主动回忆不知道、快速测试答错时） */
  limited?: boolean;
  onRate: (grade: 1 | 2 | 3 | 4) => void;
}) {
  const items = limited
    ? RATINGS_3.slice(0, 2)
    : ratingMode === "3"
      ? RATINGS_3
      : RATINGS_4;
  return (
    <div
      className={cn(
        "grid gap-3",
        items.length === 2 && "grid-cols-2 gap-4",
        items.length === 3 && "grid-cols-3 gap-4",
        items.length === 4 && "grid-cols-4 gap-3"
      )}
    >
      {items.map((r) => (
        <Tooltip key={r.grade}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              <Button
                variant={r.grade === 1 ? "destructive" : "outline"}
                className={cn(
                  "w-full flex-col gap-0.5 py-3 disabled:opacity-60",
                  items.length === 3 && "py-5"
                )}
                disabled={busy}
                onClick={() => onRate(r.grade)}
              >
                <span className="text-lg font-semibold">
                  {r.emoji ? <span className="mr-1 text-xl">{r.emoji}</span> : null}
                  {r.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {preview?.[r.grade]?.label ?? r.hint}
                </span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-52 text-center">
            <p className="font-medium">
              {r.label}（{r.hint}）
            </p>
            <p className="text-xs">{r.desc}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ============ 视图公共 Props ============

interface ModeViewProps {
  row: StudyCardRow;
  config: StudyModeConfig;
  ratingMode: "3" | "4";
  preview: IntervalPreview | null;
  retrievability: number | null;
  busy: boolean;
  distractorRows: StudyCardRow[];
  onReveal: () => void;
  onRate: (grade: 1 | 2 | 3 | 4) => void;
  onRateReadyChange: (ready: boolean) => void;
}

function RetrievabilityLine({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      记忆可检索度：{(value * 100).toFixed(0)}%
    </p>
  );
}

// ============ 1. 经典翻转（降级模式） ============

function ClassicFlipView(props: ModeViewProps) {
  const { row, preview, retrievability, ratingMode, busy, onReveal, onRate, onRateReadyChange } = props;
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    onRateReadyChange(flipped && !busy);
  }, [flipped, busy, onRateReadyChange]);

  const showAnswer = () => {
    if (flipped) return;
    setFlipped(true);
    onReveal();
  };

  return (
    <div className="space-y-4">
      <div className="[perspective:1000px]">
        <div
          className={cn(
            "relative min-h-80 w-full transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* 正面 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8 [backface-visibility:hidden]">
            <CardMetaBadges row={row} />
            <div className="text-center text-4xl font-bold break-words">{row.front}</div>
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
              {row.back}
            </div>
            <RetrievabilityLine value={retrievability} />
            <p className="text-xs text-muted-foreground">背面 · 释义</p>
          </div>
        </div>
      </div>
      {flipped && (
        <RatingButtons ratingMode={ratingMode} preview={preview} busy={busy} onRate={onRate} />
      )}
    </div>
  );
}

// ============ 2. 主动回忆（常规复习卡） ============

function ActiveRecallView(props: ModeViewProps) {
  const { row, ratingMode, preview, retrievability, busy, onReveal, onRate, onRateReadyChange } = props;
  const [recallPhase, setRecallPhase] = useState<"prompt" | "input" | "result">("prompt");
  const [recallInput, setRecallInput] = useState("");
  const [recallResult, setRecallResult] = useState<RecallMatchResult | null>(null);
  const [limitedRatings, setLimitedRatings] = useState(false);

  useEffect(() => {
    onRateReadyChange(recallPhase === "result" && !busy);
  }, [recallPhase, busy, onRateReadyChange]);

  const handleDontKnow = () => {
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(true);
    onReveal();
  };

  const handleCheckRecall = () => {
    if (!recallInput.trim()) return;
    const result = matchRecall(recallInput, row.back);
    setRecallResult(result);
    setRecallPhase("result");
    setLimitedRatings(false);
    onReveal();
  };

  return (
    <div className="space-y-4">
      {recallPhase === "prompt" && (
        <div className="flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8">
          <CardMetaBadges row={row} />
          <div className="text-center text-4xl font-bold break-words">{row.front}</div>
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
        <div className="flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8">
          <CardMetaBadges row={row} />
          <div className="text-center text-4xl font-bold break-words">{row.front}</div>
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
        <div className="space-y-4">
          <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8">
            <CardMetaBadges row={row} />
            <div className="text-center text-3xl font-bold break-words">{row.front}</div>
            <div className="max-w-md text-center text-2xl font-semibold whitespace-pre-wrap break-words">
              {row.back}
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
            <RetrievabilityLine value={retrievability} />
          </div>
          <RatingButtons
            ratingMode={ratingMode}
            preview={preview}
            busy={busy}
            limited={limitedRatings}
            onRate={onRate}
          />
        </div>
      )}
    </div>
  );
}

// ============ 3. 新卡教学（先教后测） ============

function NewCardTeachView(props: ModeViewProps) {
  const { row, config, ratingMode, preview, busy, onReveal, onRate, onRateReadyChange } = props;
  const [phase, setPhase] = useState<"teach" | "check">("teach");
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);

  useEffect(() => {
    onRateReadyChange(phase === "check" && checked !== null && !busy);
  }, [phase, checked, busy, onRateReadyChange]);

  const startCheck = () => {
    setTyped("");
    setChecked(null);
    setPhase("check");
  };

  const submitCheck = () => {
    if (!typed.trim()) return;
    const correct = typed.trim().toLowerCase() === row.front.trim().toLowerCase();
    setChecked(correct);
    onReveal();
  };

  if (phase === "teach") {
    return (
      <div className="flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8">
        <CardMetaBadges row={row} />
        <div className="text-center text-4xl font-bold break-words">{row.front}</div>
        <div className="max-w-lg text-center text-xl font-semibold whitespace-pre-wrap break-words">
          {row.back}
        </div>
        {config.showMarkdown && (
          <div className="w-full max-w-lg">
            <MarkdownContext markdownContent={row.markdown_content} word={row.front} />
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          新卡先理解再记忆：结合释义与原文语境，准备好后开始识别测试
        </p>
        <Button size="lg" onClick={startCheck}>
          <BookOpen className="size-4" />
          开始记忆测试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8">
        <CardMetaBadges row={row} />
        <p className="text-sm text-muted-foreground">根据释义拼写单词（新卡识别测试）</p>
        <div className="text-center text-2xl font-semibold whitespace-pre-wrap break-words">{row.back}</div>
        {checked === null && (
          <div className="flex w-full max-w-md gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="输入英文单词…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCheck();
              }}
              autoFocus
            />
            <Button onClick={submitCheck} disabled={!typed.trim() || busy}>
              检查答案
            </Button>
          </div>
        )}
        {checked !== null && (
          <div
            className={cn(
              "w-full max-w-md rounded-lg border p-3 text-sm",
              checked ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"
            )}
          >
            <div className="flex items-center gap-2">
              {checked ? (
                <CheckCircle2 className="size-4 text-green-500" />
              ) : (
                <XCircle className="size-4 text-red-500" />
              )}
              <span className="font-medium">{checked ? "拼写正确" : "拼写不正确"}</span>
            </div>
            {!checked && (
              <p className="mt-1">
                正确答案：<span className="font-semibold">{row.front}</span>
              </p>
            )}
          </div>
        )}
      </div>
      {checked !== null && (
        <RatingButtons ratingMode={ratingMode} preview={preview} busy={busy} onRate={onRate} />
      )}
    </div>
  );
}

// ============ 4. 快速测试（熟练卡，秒答自动 Good） ============

function QuickTestView(props: ModeViewProps) {
  const { row, ratingMode, preview, busy, distractorRows, onReveal, onRate, onRateReadyChange } = props;
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const [autoGood, setAutoGood] = useState(false);

  const options = useMemo(() => {
    const distractors: string[] = [];
    for (const r of distractorRows) {
      const b = r.back.trim();
      if (b && b !== row.back && !distractors.includes(b)) distractors.push(b);
      if (distractors.length >= 3) break;
    }
    return shuffle([row.back, ...distractors]);
  }, [distractorRows, row.back]);
  const useChoice = options.length >= 2;

  // 卸载时清理自动推进计时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    onRateReadyChange(checked !== null && !autoGood && !busy);
  }, [checked, autoGood, busy, onRateReadyChange]);

  const finish = (correct: boolean) => {
    const fast = Date.now() - startRef.current <= QUICK_MS;
    setChecked(correct);
    onReveal();
    if (correct && fast) {
      setAutoGood(true);
      timerRef.current = setTimeout(() => onRate(3), 900);
    }
  };

  const submitChoice = (opt: string) => {
    if (checked !== null || busy) return;
    finish(opt.trim() === row.back.trim());
  };

  const submitFill = () => {
    if (!typed.trim() || checked !== null || busy) return;
    finish(typed.trim().toLowerCase() === row.front.trim().toLowerCase());
  };

  return (
    <div className="space-y-4">
      <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8">
        <CardMetaBadges row={row} />
        <p className="text-sm text-muted-foreground">
          熟练卡 · 快速测试（{QUICK_MS / 1000} 秒内答对自动记为「记得」）
        </p>
        <div className="text-center text-3xl font-bold break-words">{row.front}</div>

        {checked === null && useChoice && (
          <div className="grid w-full max-w-lg gap-2">
            {options.map((opt) => (
              <Button
                key={opt}
                variant="outline"
                className="h-auto justify-start whitespace-normal py-3 text-left"
                onClick={() => submitChoice(opt)}
                disabled={busy}
              >
                {opt}
              </Button>
            ))}
          </div>
        )}

        {checked === null && !useChoice && (
          <div className="flex w-full max-w-md gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="输入对应的释义…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitFill();
              }}
              autoFocus
            />
            <Button onClick={submitFill} disabled={!typed.trim() || busy}>
              检查
            </Button>
          </div>
        )}

        {checked !== null && (
          <div
            className={cn(
              "w-full max-w-lg rounded-lg border p-3 text-sm",
              checked ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"
            )}
          >
            <div className="flex items-center gap-2">
              {checked ? (
                <CheckCircle2 className="size-4 text-green-500" />
              ) : (
                <XCircle className="size-4 text-red-500" />
              )}
              <span className="font-medium">
                {checked ? (autoGood ? "回答正确，秒答 → 自动记为「记得」" : "回答正确") : "回答错误"}
              </span>
            </div>
            {!checked && (
              <p className="mt-1">
                正确答案：<span className="font-semibold">{row.back}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {checked !== null && !autoGood && (
        <RatingButtons
          ratingMode={ratingMode}
          preview={preview}
          busy={busy}
          limited={checked === false}
          onRate={onRate}
        />
      )}
    </div>
  );
}

// ============ 5. AI 深度攻克（弱词） ============

function AiDrillView(props: ModeViewProps) {
  const { row, config, ratingMode, preview, busy, onRate, onRateReadyChange } = props;

  useEffect(() => {
    onRateReadyChange(!busy);
  }, [busy, onRateReadyChange]);

  return (
    <div className="space-y-4">
      <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border border-amber-500/30 bg-card p-8">
        <CardMetaBadges row={row} />
        <div className="text-center text-3xl font-bold break-words">{row.front}</div>
        <div className="max-w-lg text-center text-xl font-semibold whitespace-pre-wrap break-words">
          {row.back}
        </div>
        {config.showMarkdown && (
          <div className="w-full max-w-lg">
            <MarkdownContext markdownContent={row.markdown_content} word={row.front} />
          </div>
        )}
        <div className="flex max-w-lg items-start gap-2 rounded-md bg-amber-500/10 p-3 text-left text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            顽固词 · 已自动进入 AI 深度攻克。请使用下方 AI 学习助手多轮练习；
            完成 AI 判分确认评分后继续，或跳过 AI 直接手动评分。
          </p>
        </div>
      </div>
      <RatingButtons ratingMode={ratingMode} preview={preview} busy={busy} onRate={onRate} />
    </div>
  );
}

// ============ 分发组件 ============

export interface StudyCardProps {
  row: StudyCardRow;
  config: StudyModeConfig;
  ratingMode: "3" | "4";
  preview: IntervalPreview | null;
  retrievability: number | null;
  busy: boolean;
  /** 同队列其他卡片（快速测试的干扰项池） */
  distractorRows: StudyCardRow[];
  /** 揭示答案：父组件据此计算间隔预览与可检索度 */
  onReveal: () => void;
  onRate: (grade: 1 | 2 | 3 | 4) => void;
  onRateReadyChange: (ready: boolean) => void;
}

/**
 * Phase 6C 多模式学习卡片：按 StudyModeConfig 分发到对应视图。
 * 父组件以 key={card_id} 渲染，卡片切换时各视图状态自动重置。
 */
export default function StudyCard(props: StudyCardProps) {
  const { config } = props;

  // 卡片切换卸载时复位父组件评分快捷键就绪状态
  useEffect(() => {
    return () => props.onRateReadyChange(false);
  }, [props.onRateReadyChange]);

  let view: ReactNode;
  switch (config.mode) {
    case "new_teach":
      view = <NewCardTeachView {...props} />;
      break;
    case "recall":
      view = <ActiveRecallView {...props} />;
      break;
    case "quick_test":
      view = <QuickTestView {...props} />;
      break;
    case "ai_drill":
      view = <AiDrillView {...props} />;
      break;
    default:
      view = <ClassicFlipView {...props} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            config.mode === "ai_drill" && "border-amber-500/40 bg-amber-500/10 text-amber-600",
            config.mode === "new_teach" && "border-primary/30 bg-primary/5 text-primary"
          )}
        >
          {config.aiStrategy ? <Sparkles className="mr-1 inline size-2.5" /> : null}
          {STUDY_MODE_LABELS[config.mode]}
        </Badge>
      </div>
      {view}
    </div>
  );
}
