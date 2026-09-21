import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DictionaryExample } from "../DictionaryExample";
import type { ModeViewProps } from "./types";
import {
  CardMetaBadges,
  MeaningBlock,
  RatingButtons,
  RelatedWordsChips,
  RetrievabilityLine,
  RevealContext,
  WordBlock,
} from "./shared";

export function ClassicFlipView(props: ModeViewProps) {
  const { row, preview, retrievability, ratingMode, busy, distractors, onReveal, onRate, onRateReadyChange } = props;
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    onRateReadyChange(flipped && !busy);
  }, [flipped, busy, onRateReadyChange]);

  const showAnswer = useCallback(() => {
    if (flipped) return;
    setFlipped(true);
    onReveal();
  }, [flipped, onReveal]);

  // 统一快捷键：回车/空格显示答案
  useEffect(() => {
    if (flipped) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "BUTTON" ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "A" ||
          target.isContentEditable)
      ) {
        return;
      }
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
