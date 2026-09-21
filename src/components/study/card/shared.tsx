import { useEffect, useState } from "react";
import { Star, Tag, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/env";
import type { StudyCardRow } from "@/lib/db";
import type { IntervalPreview } from "@/lib/fsrs";
import { isPhrase, removePosPrefix } from "@/lib/meaning";
import { speak } from "@/lib/tts";
import { getPureTags } from "@/lib/card-examples";
import { findRelatedWords } from "@/lib/word-family";
import MarkdownContext from "../MarkdownContext";
import { RATINGS_3, RATINGS_4 } from "./types";

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
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

export function CardMetaBadges({ row }: { row: StudyCardRow }) {
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

export function RatingButtons({
  ratingMode,
  preview,
  busy,
  limited = false,
  onRate,
}: {
  ratingMode: "3" | "4";
  preview: IntervalPreview | null;
  busy: boolean;
  /** 是否处于受限/改判模式（答错或未回忆出来时，仍始终保留「已掌握」选项供用户手动改判 override） */
  limited?: boolean;
  onRate: (grade: 1 | 2 | 3 | 4) => void;
}) {
  const baseItems = ratingMode === "3" ? RATINGS_3 : RATINGS_4;
  const items = limited
    ? baseItems
        .filter((r) => r.grade <= 3)
        .map((r) => {
          if (r.grade === 3) {
            return {
              ...r,
              label: "已掌握",
              hint: "Override",
              desc: "手动改判为已掌握 → 正常安排复习",
            };
          }
          return r;
        })
    : baseItems;
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
                  "h-auto min-h-[72px] sm:min-h-24 w-full min-w-0 flex-col gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-2.5 sm:py-4 disabled:opacity-60",
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

export function RetrievabilityLine({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      记忆可检索度：{(value * 100).toFixed(0)}%
    </p>
  );
}

/** 单词（居中）+ 音标（下方）+ 发音按钮（单词旁边） */
export function WordBlock({ word, phonetic }: { word: string; phonetic?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center justify-items-center gap-1">
        <span />
        <span className="text-3xl sm:text-4xl font-bold break-words text-center">{word}</span>
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

/** 揭示答案后展示原文语境 */
export function RevealContext({ row }: { row: StudyCardRow }) {
  if (!row.markdown_content) return null;
  return (
    <div className="w-full max-w-lg text-left">
      <MarkdownContext markdownContent={row.markdown_content} word={row.front} />
    </div>
  );
}

/** 主要释义加粗 + 次要释义第二栏（短语自动去除残留词性） */
export function MeaningBlock({ row, className }: { row: StudyCardRow; className?: string }) {
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

/** 同族词提示：从全词库干扰项池中匹配共享词干 */
export function RelatedWordsChips({ front, fronts }: { front: string; fronts: string[] }) {
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
