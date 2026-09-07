import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Star,
  Tag,
  Volume2,
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
import { isTauri } from "@/lib/env";
import type { StudyCardRow } from "@/lib/db";
import type { IntervalPreview } from "@/lib/fsrs";
import {
  matchRecall,
  type RecallMatchResult,
  matchWordSpelling,
  type WordSpellingResult,
  getWordMaskHint,
} from "@/lib/recall-match";
import { getCardMeaning, isPhrase, removePosPrefix } from "@/lib/meaning";
import { speak, stopAudio } from "@/lib/tts";
import { DictionaryExample } from "./DictionaryExample";
import { getPureTags } from "@/lib/card-examples";
import { findRelatedWords } from "@/lib/word-family";
import { pickSimilarWords } from "@/lib/similar-words";
import { optionIndexFromNumberKey } from "@/lib/shortcuts";
import type { StudyModeConfig } from "@/lib/study-mode";
import { STUDY_MODE_LABELS } from "@/lib/study-mode";
import { getAutoPronounceEnabled } from "@/lib/study-prefs";
import MarkdownContext from "./MarkdownContext";

// ============ 评分常量（Phase 6A：三档默认 / 四档可选） ============

const RATINGS_4 = [
  { grade: 1 as const, label: "忘了", emoji: null, hint: "Again", desc: "没想起来 → 立即重学" },
  { grade: 2 as const, label: "困难", emoji: null, hint: "Hard", desc: "很吃力 → 较短间隔" },
  { grade: 3 as const, label: "良好", emoji: null, hint: "Good", desc: "基本掌握 → 正常安排" },
  { grade: 4 as const, label: "简单", emoji: null, hint: "Easy", desc: "非常轻松 → 大幅延长间隔" },
];

const RATINGS_3 = [
  { grade: 1 as const, label: "不记得", emoji: null, hint: "Again", desc: "没想起来 → 立即重学" },
  { grade: 2 as const, label: "模糊", emoji: null, hint: "Hard", desc: "不确定 → 较短间隔" },
  { grade: 3 as const, label: "记得", emoji: null, hint: "Good", desc: "基本掌握 → 正常安排" },
];

/** 回忆时限提示（P1-④）：超过该秒数仍想不起来时给出柔和建议 */
const RECALL_HINT_SECONDS = 10;

/** 干扰项/词族来源：词库卡片精简结构 */
export interface Distractor {
  front: string;
  back: string;
  meaning_primary?: string;
  meaning_secondary?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============ 共享子组件 ============

function CardMetaBadges({ row }: { row: StudyCardRow }) {
  const tags = getPureTags(row.tags);
  if (row.is_key !== 1 && tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {row.is_key === 1 && (
        <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">
          <Star className="mr-0.5 inline size-2.5" />
          重点
        </Badge>
      )}
      {tags.map((t) => (
        <Badge key={t} variant="secondary" className="text-[10px] text-muted-foreground font-normal">
          <Tag className="mr-1 inline size-2.5 opacity-70" />
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
        "grid gap-2",
        items.length === 2 && "grid-cols-2 gap-3",
        items.length === 3 && "grid-cols-3 gap-3",
        items.length === 4 && "grid-cols-2 gap-2 sm:grid-cols-4"
      )}
    >
      {items.map((r) => (
        <Tooltip key={r.grade}>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex w-full min-w-0">
              <Button
                variant={r.grade === 1 ? "destructive" : "outline"}
                className={cn(
                  "h-auto min-h-24 w-full min-w-0 flex-col gap-1.5 px-2 py-4 disabled:opacity-60",
                  r.grade === 2 && "border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
                  r.grade === 3 && "border-green-500/50 bg-green-500/10 text-green-600 hover:bg-green-500/20",
                  r.grade === 4 && "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                )}
                disabled={busy}
                onClick={() => onRate(r.grade)}
              >
                {r.emoji ? <span className="text-2xl leading-none">{r.emoji}</span> : null}
                <span className="w-full whitespace-normal break-words text-center text-sm font-semibold leading-tight sm:text-base">
                  {r.label}
                </span>
                <span className="w-full whitespace-normal break-words text-center text-[11px] leading-tight text-muted-foreground sm:text-xs">
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
  /** 全词库卡片精简池（P2-⑧：选择题干扰项 + 同族词匹配） */
  distractors: Distractor[];
  /** 熟练卡秒答阈值（毫秒），可在设置中调整 */
  quickMs: number;
  /** 单词音标（优先外部词典获取，缺省用卡片字段） */
  phonetic?: string;
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

/** 单词（居中）+ 音标（下方）+ 发音按钮（单词旁边） */
function WordBlock({ word, phonetic }: { word: string; phonetic?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center justify-items-center gap-1">
        <span />
        <span className="text-4xl font-bold break-words">{word}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => speak(word)}
          title="发音"
        >
          <Volume2 className="size-4" />
        </Button>
      </div>
      {phonetic && <span className="text-sm text-muted-foreground">{phonetic}</span>}
    </div>
  );
}

/** 揭示答案后展示原文语境（P1-⑥：复习阶段强化语境联想，正面不泄漏） */
function RevealContext({ row }: { row: StudyCardRow }) {
  if (!row.markdown_content) return null;
  return (
    <div className="w-full max-w-lg text-left">
      <MarkdownContext markdownContent={row.markdown_content} word={row.front} />
    </div>
  );
}

/** 主要释义加粗 + 次要释义第二栏（短语自动去除残留词性） */
function MeaningBlock({ row, className }: { row: StudyCardRow; className?: string }) {
  const isP = isPhrase(row.front);
  const rawPrimary = row.meaning_primary || row.back;
  const primary = isP ? removePosPrefix(rawPrimary) : rawPrimary;
  const secondary = isP && row.meaning_secondary ? removePosPrefix(row.meaning_secondary) : row.meaning_secondary;
  return (
    <div className={cn("space-y-0.5", className)}>
      <div className="font-semibold whitespace-pre-wrap break-words">{primary}</div>
      {secondary && (
        <div className="whitespace-pre-wrap break-words text-muted-foreground">{secondary}</div>
      )}
    </div>
  );
}

/** 同族词提示（P3-⑬：从全词库干扰项池中匹配共享词干） */
function RelatedWordsChips({ front, fronts }: { front: string; fronts: string[] }) {
  const related = findRelatedWords(front, fronts);
  if (related.length === 0) return null;
  return (
    <div className="flex max-w-lg flex-wrap items-center justify-center gap-1.5 text-xs">
      <span className="text-muted-foreground">同族词：</span>
      {related.map((w) => (
        <Badge key={w} variant="secondary" className="text-[11px]">
          {w}
        </Badge>
      ))}
    </div>
  );
}

// ============ 1. 经典翻转（降级模式） ============

function ClassicFlipView(props: ModeViewProps) {
  const { row, preview, retrievability, ratingMode, busy, distractors, onReveal, onRate, onRateReadyChange } = props;
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    onRateReadyChange(flipped && !busy);
  }, [flipped, busy, onRateReadyChange]);

  const showAnswer = () => {
    if (flipped) return;
    setFlipped(true);
    onReveal();
  };

  // 统一快捷键：回车显示答案
  useEffect(() => {
    if (flipped) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "A" || target.isContentEditable)) return;
      e.preventDefault();
      showAnswer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, showAnswer]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="[perspective:1000px]">
        <div
          className={cn(
            "relative min-h-[50vh] sm:min-h-80 w-full transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* 正面 */}
          <div
            onClick={!flipped ? showAnswer : undefined}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-4 sm:gap-5 rounded-xl border bg-card p-5 sm:p-8 [backface-visibility:hidden]",
              !flipped && "cursor-pointer active:scale-[0.99] transition-transform select-none"
            )}
          >
            <CardMetaBadges row={row} />
            <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
            {!flipped && (
              <div className="flex flex-col items-center gap-2">
                <Button onClick={showAnswer} size="lg" className="w-full sm:w-auto px-8 font-semibold">
                  查看释义
                </Button>
                <p className="text-xs text-muted-foreground hidden sm:block">快捷键：Enter / 空格 显示答案</p>
                <p className="text-[11px] text-muted-foreground sm:hidden">轻触卡片翻转</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground/70">正面 · 单词</p>
          </div>
          {/* 背面：释义 + 原文语境 + 同族词 */}
          <div className="absolute inset-0 flex flex-col items-center justify-start sm:justify-center gap-3 overflow-y-auto rounded-xl border bg-card p-4 sm:p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <CardMetaBadges row={row} />
            <MeaningBlock row={row} className="text-center text-xl sm:text-2xl" />
            <RetrievabilityLine value={retrievability} />
            <RelatedWordsChips front={row.front} fronts={distractors.map((d) => d.front)} />
            <RevealContext row={row} />
            <DictionaryExample word={row.front} existingMarkdown={row.markdown_content} tags={row.tags} />
            <p className="text-xs text-muted-foreground/70">背面 · 释义</p>
          </div>
        </div>
      </div>
      {flipped && (
        <RatingButtons ratingMode={ratingMode} preview={preview} busy={busy} onRate={onRate} />
      )}
    </div>
  );
}

// ============ 2. 主动回忆（Windows 桌面端保持看英文想释义，移动端看释义写单词） ============

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    // Tauri 桌面端固定为 Windows 桌面体验
    if (isTauri()) return false;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    return isMobileUA || window.innerWidth < 768;
  });

  useEffect(() => {
    if (typeof window === "undefined" || isTauri()) return;
    const check = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      setIsMobile(isMobileUA || window.innerWidth < 768);
    };
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

/** 桌面端专属主动回忆：看英文单词回忆释义（与 Windows 原生体验完全一致） */
function DesktopActiveRecallView(props: ModeViewProps) {
  const { row, ratingMode, preview, retrievability, busy, distractors, onReveal, onRate, onRateReadyChange } = props;
  const [recallPhase, setRecallPhase] = useState<"prompt" | "input" | "result">("prompt");
  const [recallInput, setRecallInput] = useState("");
  const [recallResult, setRecallResult] = useState<RecallMatchResult | null>(null);
  const [limitedRatings, setLimitedRatings] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // P1-④：10 秒规则柔和提示（不强制，只提醒）
  useEffect(() => {
    if (recallPhase === "result") return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [recallPhase]);

  useEffect(() => {
    onRateReadyChange(recallPhase === "result" && !busy);
  }, [recallPhase, busy, onRateReadyChange]);

  const handleDontKnow = () => {
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(true);
    speak(row.front);
    onReveal();
  };

  const handleRecallDirect = () => {
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(false);
    speak(row.front);
    onReveal();
  };

  const handleCheckRecall = () => {
    if (!recallInput.trim()) return;
    const result = matchRecall(recallInput, getCardMeaning(row));
    setRecallResult(result);
    setRecallPhase("result");
    setLimitedRatings(false);
    onReveal();
  };

  // 统一快捷键：主动回忆提问阶段 Y/回车/空格 = 确定（我知道，去输入），N = 不确定/不知道
  useEffect(() => {
    if (recallPhase !== "prompt") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const interactive =
        !!target &&
        (target.tagName === "BUTTON" ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "A" ||
          target.isContentEditable);
      if (e.key === "Enter" || e.key === " " || e.key === "y" || e.key === "Y") {
        if (interactive) return;
        e.preventDefault();
        setRecallPhase("input");
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        handleDontKnow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recallPhase, handleDontKnow]);

  // 计时提示仅在「知道/不知道」选择前显示；点击后不再提示
  const recallHint =
    recallPhase === "prompt" && elapsed >= RECALL_HINT_SECONDS ? (
      <p className="text-xs text-amber-500">
        已思考 {elapsed} 秒 — 超过 10 秒仍想不起来？建议直接点「不确定 / 不知道」，别在一张卡上停留太久。
      </p>
    ) : null;

  return (
    <div className="space-y-4">
      {recallPhase === "prompt" && (
        <div className="flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8">
          <CardMetaBadges row={row} />
          <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
          <p className="text-sm text-muted-foreground">你知道这个词的意思吗？</p>
          <div className="flex gap-3">
            <Button onClick={() => setRecallPhase("input")} size="lg">
              我知道
            </Button>
            <Button variant="outline" onClick={handleDontKnow} size="lg">
              不确定 / 不知道
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">快捷键：Y / Enter / 空格 确定 · N 不确定</p>
          {recallHint}
          <p className="text-xs text-muted-foreground">主动回忆 · 先回忆再看释义</p>
        </div>
      )}

      {recallPhase === "input" && (
        <div className="flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-xl border bg-card p-8">
          <CardMetaBadges row={row} />
          <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
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
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRecallDirect}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              直接看答案
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">系统会模糊比对，不完全一致也没关系</p>
        </div>
      )}

      {recallPhase === "result" && (
        <div className="space-y-4">
          <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8">
            <CardMetaBadges row={row} />
            <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
            <MeaningBlock row={row} className="max-w-md text-center text-2xl" />
            {recallResult && (
              <p className={recallResult.match ? "text-sm text-green-600 dark:text-green-400 font-medium" : "text-sm text-amber-600 dark:text-amber-400 font-medium"}>
                {recallResult.match
                  ? `基本正确！相似度 ${Math.round(recallResult.similarity * 100)}%`
                  : `和标准释义有差距（相似度 ${Math.round(recallResult.similarity * 100)}%），请对照记忆`}
              </p>
            )}
            {!recallResult && (
              <p className="text-sm text-muted-foreground">没想起来也没关系，先看释义再评分</p>
            )}
            <RetrievabilityLine value={retrievability} />
            <RelatedWordsChips front={row.front} fronts={distractors.map((d) => d.front)} />
            {/* 回答后展示用户答案 */}
            <div className="w-full max-w-lg rounded-md border bg-muted/40 p-3 text-left">
              <p className="text-xs font-medium text-muted-foreground">你的答案</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                {recallInput.trim() || "（未填写）"}
              </p>
            </div>
            <RevealContext row={row} />
            <DictionaryExample word={row.front} existingMarkdown={row.markdown_content} tags={row.tags} />
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

/** 移动端专属主动回忆：看中文释义回忆并拼写对应英文单词 */
function MobileActiveRecallView(props: ModeViewProps) {
  const { row, ratingMode, preview, retrievability, busy, distractors, onReveal, onRate, onRateReadyChange } = props;
  const [recallPhase, setRecallPhase] = useState<"prompt" | "result">("prompt");
  const [recallInput, setRecallInput] = useState("");
  const [showMoreHint, setShowMoreHint] = useState(false);
  const [recallResult, setRecallResult] = useState<WordSpellingResult | null>(null);
  const [limitedRatings, setLimitedRatings] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (recallPhase === "result") return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [recallPhase]);

  useEffect(() => {
    onRateReadyChange(recallPhase === "result" && !busy);
  }, [recallPhase, busy, onRateReadyChange]);

  const handleDontKnow = () => {
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(true);
    speak(row.front);
    onReveal();
  };

  const handleRecallDirect = () => {
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(false);
    speak(row.front);
    onReveal();
  };

  const handleSubmitSpelling = () => {
    if (!recallInput.trim()) {
      handleRecallDirect();
      return;
    }
    const result = matchWordSpelling(recallInput, row.front);
    setRecallResult(result);
    setRecallPhase("result");
    setLimitedRatings(!result.match);
    speak(row.front);
    onReveal();
  };

  useEffect(() => {
    if (recallPhase !== "prompt") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (isInput) return;
      if (e.key === "Enter" || e.key === " " || e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleRecallDirect();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        handleDontKnow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recallPhase, handleDontKnow, handleRecallDirect]);

  const recallHint =
    recallPhase === "prompt" && elapsed >= RECALL_HINT_SECONDS ? (
      <p className="text-xs text-amber-500">
        已思考 {elapsed} 秒 — 超过 10 秒仍想不起来？建议直接点「记不清 / 忘了」，别在一张卡上停留太久。
      </p>
    ) : null;

  const wordLengthText = row.front.trim().includes(" ")
    ? `短语 (${row.front.trim().split(/\s+/).length} 词)`
    : `${row.front.trim().length} 个字母`;

  return (
    <div className="space-y-3 sm:space-y-4">
      {recallPhase === "prompt" && (
        <div
          onClick={handleRecallDirect}
          className="flex min-h-[50vh] sm:min-h-80 w-full flex-col items-center justify-center gap-3 sm:gap-4 rounded-xl border bg-card p-4 sm:p-7 cursor-pointer active:scale-[0.99] transition-transform select-none"
        >
          <CardMetaBadges row={row} />

          <div className="w-full text-center space-y-1">
            <MeaningBlock row={row} className="max-w-md mx-auto text-xl sm:text-2xl font-bold" />
            <p className="text-xs text-muted-foreground">根据中文释义回忆并拼写对应英文单词</p>
          </div>

          <div className="flex flex-col items-center gap-1.5 my-1" onClick={(e) => e.stopPropagation()}>
            <div className="font-mono text-base sm:text-lg tracking-widest text-foreground/80 px-3.5 py-1 rounded-md bg-muted/60 border border-dashed">
              {getWordMaskHint(row.front, showMoreHint)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{wordLengthText}</span>
              <button
                type="button"
                onClick={() => setShowMoreHint((v) => !v)}
                className="text-[11px] text-primary hover:underline"
              >
                {showMoreHint ? "收起提示" : "首尾提示"}
              </button>
            </div>
          </div>

          <div className="w-full max-w-sm flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Input
              value={recallInput}
              onChange={(e) => setRecallInput(e.target.value)}
              placeholder="输入英文单词（可直接留空看答案）..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className="h-10 sm:h-11 text-center font-medium text-base tracking-wide"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (recallInput.trim()) {
                    handleSubmitSpelling();
                  } else {
                    handleRecallDirect();
                  }
                }
              }}
              autoFocus
            />
            {recallInput.trim() && (
              <Button
                onClick={handleSubmitSpelling}
                disabled={busy}
                className="shrink-0 h-10 sm:h-11 px-4 font-semibold"
              >
                检查
              </Button>
            )}
          </div>

          <div
            className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-2 sm:gap-3 mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {recallInput.trim() ? (
              <>
                <Button
                  onClick={handleSubmitSpelling}
                  size="lg"
                  className="h-10 sm:h-11 text-sm sm:text-base font-semibold px-6 sm:px-8"
                >
                  检查拼写
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRecallDirect}
                  size="lg"
                  className="h-10 sm:h-11 text-sm sm:text-base px-5 text-muted-foreground hover:text-foreground"
                >
                  跳过检查（看单词）
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleRecallDirect}
                  size="lg"
                  className="h-10 sm:h-11 text-sm sm:text-base font-semibold px-6 sm:px-8"
                >
                  想起来了（看单词）
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDontKnow}
                  size="lg"
                  className="h-10 sm:h-11 text-sm sm:text-base px-5 text-muted-foreground hover:text-foreground"
                >
                  记不清 / 忘了
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground hidden sm:block">
            快捷键：Enter / 空格 确定 · N 记不清
          </p>
          {recallHint}
          <p className="text-[11px] text-muted-foreground sm:hidden">
            轻触卡片或点击按钮查看单词与发音
          </p>
        </div>
      )}

      {recallPhase === "result" && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex min-h-[50vh] sm:min-h-80 w-full flex-col items-center justify-start sm:justify-center gap-3 overflow-y-auto rounded-xl border bg-card p-4 sm:p-6">
            <CardMetaBadges row={row} />
            <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
            <MeaningBlock row={row} className="max-w-md text-center text-xl sm:text-2xl" />

            {recallResult && (
              <div
                className={cn(
                  "w-full max-w-md rounded-lg border p-2.5 text-center space-y-1",
                  recallResult.exact
                    ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                    : recallResult.match
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                )}
              >
                <p className="text-sm font-semibold">
                  {recallResult.exact
                    ? "拼写完全正确！"
                    : recallResult.match
                      ? `拼写基本正确（相似度 ${Math.round(recallResult.similarity * 100)}%）`
                      : "拼写有误，请对照加深记忆"}
                </p>
                {!recallResult.exact && (
                  <p className="text-xs">
                    你的拼写：<span className="font-mono font-medium underline">{recallResult.userWord}</span>
                    {" · "}
                    标准拼写：<span className="font-mono font-semibold">{row.front}</span>
                  </p>
                )}
              </div>
            )}

            {!recallResult && (
              <p className="text-xs sm:text-sm text-muted-foreground">
                {limitedRatings ? "记不清了？请对照标准拼写、音标与例句强化记忆" : "看单词与释义，对照脑海回忆评分"}
              </p>
            )}

            <RetrievabilityLine value={retrievability} />
            <RelatedWordsChips front={row.front} fronts={distractors.map((d) => d.front)} />
            <RevealContext row={row} />
            <DictionaryExample word={row.front} existingMarkdown={row.markdown_content} tags={row.tags} />
          </div>
          <RatingButtons
            ratingMode={ratingMode}
            preview={preview}
            busy={busy}
            limited={limitedRatings || (!!recallResult && !recallResult.match)}
            onRate={onRate}
          />
        </div>
      )}
    </div>
  );
}

function ActiveRecallView(props: ModeViewProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileActiveRecallView {...props} /> : <DesktopActiveRecallView {...props} />;
}


// ============ 3. 新卡教学（先教，延迟突击测试） ============

function NewCardTeachView(props: ModeViewProps) {
  const { row, busy, distractors, onRate, onRateReadyChange } = props;

  // 教学阶段不允许快捷键评分；点击「开始记忆」后按 Good 进入 Learning（1m），
  // 由 FSRS 步骤在稍后队列末尾触发突击测试，而不是当场测试。
  useEffect(() => {
    onRateReadyChange(false);
  }, [busy, onRateReadyChange]);

  const handleStartMemory = () => {
    if (busy) return;
    onRate(3);
  };

  // 统一快捷键：回车开始记忆
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "A" || target.isContentEditable)) return;
      e.preventDefault();
      handleStartMemory();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleStartMemory]);

  return (
    <div className="flex min-h-[50vh] sm:min-h-80 w-full flex-col items-center justify-center gap-4 sm:gap-5 rounded-xl border bg-card p-5 sm:p-8">
      <CardMetaBadges row={row} />
      <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
      <MeaningBlock row={row} className="max-w-lg text-center text-xl" />
      <RelatedWordsChips front={row.front} fronts={distractors.map((d) => d.front)} />
      <DictionaryExample word={row.front} existingMarkdown={row.markdown_content} tags={row.tags} />
      <p className="text-sm text-muted-foreground">
        先看释义，开始记忆后稍后会随队列突击测试
      </p>
      <Button size="lg" onClick={handleStartMemory} disabled={busy}>
        <BookOpen className="size-4" />
        开始记忆
      </Button>
      <p className="text-xs text-muted-foreground">快捷键：Enter / 空格 开始记忆</p>
    </div>
  );
}

// ============ 4. 快速测试（熟练卡，秒答自动 Good） ============

function QuickTestView(props: ModeViewProps) {
  const { row, ratingMode, preview, busy, distractors, quickMs, onReveal, onRate, onRateReadyChange } = props;
  const startRef = useRef(Date.now());
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const [fast, setFast] = useState(false);

  // 形近词干扰项优先：看释义选单词（中译英），干扰项取编辑距离最近的全词库单词；
  // 形近候选不足时退回「看单词选释义」，最后回退填空。
  const choice = useMemo(() => {
    const fronts = distractors
      .map((d) => d.front.trim())
      .filter((f) => f && f !== row.front.trim());
    const similarFronts = pickSimilarWords(row.front, fronts, 3);
    const currentMeaning = getCardMeaning(row);
    if (similarFronts.length >= 1) {
      return {
        useFront: true as const,
        options: shuffle([row.front, ...similarFronts]),
        prompt: currentMeaning,
        correct: row.front,
      };
    }
    const backs: string[] = [];
    for (const d of distractors) {
      const b = getCardMeaning(d).trim();
      if (b && b !== currentMeaning && !backs.includes(b)) backs.push(b);
      if (backs.length >= 3) break;
    }
    return {
      useFront: false as const,
      options: shuffle([currentMeaning, ...backs]),
      prompt: row.front,
      correct: currentMeaning,
    };
  }, [distractors, row]);
  const useChoice = choice.options.length >= 2;

  useEffect(() => {
    onRateReadyChange(checked !== null && !busy);
  }, [checked, busy, onRateReadyChange]);

  const finish = (correct: boolean) => {
    setFast(correct && Date.now() - startRef.current <= quickMs);
    setChecked(correct);
    onReveal();
  };

  const submitChoice = (opt: string) => {
    if (checked !== null || busy) return;
    finish(opt.trim() === choice.correct.trim());
  };

  const submitFill = () => {
    if (!typed.trim() || checked !== null || busy) return;
    finish(typed.trim().toLowerCase() === row.front.trim().toLowerCase());
  };

  // 快速测试选择题：1-4 对应选项 A-D
  useEffect(() => {
    if (checked !== null || !useChoice || busy) return;
    const onKey = (e: KeyboardEvent) => {
      const idx = optionIndexFromNumberKey(e.key, choice.options.length);
      if (idx !== null) {
        e.preventDefault();
        submitChoice(choice.options[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checked, useChoice, busy, choice, submitChoice]);

  // 快速测试自动发音：若题目显示单词则卡片展示时朗读；若题目显示释义则作答后朗读
  const spokenPromptRef = useRef(false);
  const spokenCheckedRef = useRef(false);

  useEffect(() => {
    let active = true;
    if (!choice.useFront && !spokenPromptRef.current) {
      spokenPromptRef.current = true;
      getAutoPronounceEnabled()
        .then((enabled) => {
          if (active && enabled) speak(row.front);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [choice.useFront, row.front]);

  useEffect(() => {
    let active = true;
    if (checked !== null && choice.useFront && !spokenCheckedRef.current) {
      spokenCheckedRef.current = true;
      getAutoPronounceEnabled()
        .then((enabled) => {
          if (active && enabled) speak(row.front);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [checked, choice.useFront, row.front]);

  return (
    <div className="space-y-4">
      <div className="flex min-h-[50vh] sm:min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border bg-card p-5 sm:p-8">
        <CardMetaBadges row={row} />
        <p className="text-sm text-muted-foreground">
          快速测试 · {Math.round(quickMs / 1000)} 秒内答对建议「记得」 ·{" "}
          {choice.useFront ? "看释义选单词" : "看单词选释义"}
        </p>
        {choice.useFront ? (
          <div className="text-center text-3xl font-bold break-words">{choice.prompt}</div>
        ) : (
          <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
        )}

        {checked === null && useChoice && (
          <>
            <div className="grid w-full max-w-lg gap-2">
              {choice.options.map((opt, i) => (
                <Button
                  key={opt}
                  variant="outline"
                  className="h-auto min-h-12 w-full items-start justify-start gap-2.5 whitespace-normal px-3 py-2.5 text-left"
                  onClick={() => submitChoice(opt)}
                  disabled={busy}
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-normal break-words leading-relaxed">
                    {opt}
                  </span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">快捷键：1-4 选择 A-D</p>
          </>
        )}

        {checked === null && !useChoice && (
          <>
            <div className="flex w-full max-w-md gap-2">
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="输入对应的单词…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitFill();
                }}
                autoFocus
              />
              <Button onClick={submitFill} disabled={!typed.trim() || busy}>
                检查
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">快捷键：Enter 提交</p>
          </>
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
                {checked ? (fast ? "回答正确，秒答 → 建议记为「记得」" : "回答正确") : "回答错误"}
              </span>
            </div>
            {!checked && (
              <p className="mt-1">
                正确答案：<span className="font-semibold">{choice.correct}</span>
              </p>
            )}
          </div>
        )}
        {checked !== null && (
          <>
            <RelatedWordsChips front={row.front} fronts={distractors.map((d) => d.front)} />
            <RevealContext row={row} />
            <DictionaryExample word={row.front} existingMarkdown={row.markdown_content} tags={row.tags} />
          </>
        )}
      </div>

      {checked !== null && (
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
        <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
        <MeaningBlock row={row} className="max-w-lg text-center text-xl" />
        {config.showMarkdown && (
          <div className="w-full max-w-lg">
            <MarkdownContext markdownContent={row.markdown_content} word={row.front} />
          </div>
        )}
        <DictionaryExample word={row.front} existingMarkdown={row.markdown_content} tags={row.tags} />
        <div className="flex max-w-lg items-start gap-2 rounded-md bg-amber-500/10 p-3 text-left text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            顽固词 · 用下方 AI 助手多轮攻克，或直接手动评分
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
  /** 全词库卡片精简池（P2-⑧：选择题干扰项 + 同族词） */
  distractors: Distractor[];
  /** 熟练卡秒答阈值（毫秒，P2-⑨） */
  quickMs: number;
  /** 单词音标（外部词典获取后传入） */
  phonetic?: string;
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
  const isMobile = useIsMobile();

  // 卡片切换卸载时复位父组件评分快捷键就绪状态，并立即打断正在播放的音频
  useEffect(() => {
    return () => {
      props.onRateReadyChange(false);
      stopAudio();
    };
  }, [props.onRateReadyChange]);

  // 学习单词时自动朗读单词（新卡教学、经典翻转、AI 深度攻克、桌面端主动回忆）
  // 移动端主动回忆正面为中文防剧透，已在揭示答案时自动朗读
  const spokenCardIdRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const cardId = props.row.card_id;
    if (spokenCardIdRef.current === cardId) {
      return;
    }

    const shouldSpeakOnMount =
      config.mode === "new_teach" ||
      config.mode === "classic" ||
      config.mode === "ai_drill" ||
      (config.mode === "recall" && !isMobile);

    if (shouldSpeakOnMount) {
      spokenCardIdRef.current = cardId;
      getAutoPronounceEnabled()
        .then((enabled) => {
          if (active && enabled) {
            speak(props.row.front);
          }
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [props.row.card_id, props.row.front, config.mode, isMobile]);

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
