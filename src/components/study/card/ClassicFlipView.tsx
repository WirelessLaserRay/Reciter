import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DictionaryExample } from "../DictionaryExample";
import type { ModeViewProps } from "./types";
import { Volume2 } from "lucide-react";
import { speak } from "@/lib/tts";
import {
  CardMetaBadges,
  MeaningBlock,
  RatingButtons,
  RelatedWordsChips,
  RevealContext,
  WordBlock,
} from "./shared";

export function ClassicFlipView(props: ModeViewProps) {
  const { row, preview, retrievability, ratingMode, busy, distractors, onReveal, onRate, onRateReadyChange } = props;
  const [flipped, setFlipped] = useState(false);

  // 切卡时重置翻转状态，避免上一张卡翻开后新卡直接处于背面
  useEffect(() => {
    setFlipped(false);
  }, [row.card_id]);

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
            "relative min-h-[50vh] sm:min-h-[420px] w-full transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* 正面 */}
          <div
            onClick={!flipped ? showAnswer : undefined}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-4 sm:gap-5 rounded-xl border bg-card p-5 sm:p-8 [backface-visibility:hidden]",
              !flipped
                ? "cursor-pointer active:scale-[0.99] transition-transform select-none z-10"
                : "pointer-events-none opacity-0 select-none z-0"
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
          {/* 背面：专为沉浸阅读释义与例句设计的舒适排版（等宽展示框 + 居中对齐） */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center overflow-y-auto rounded-xl border bg-card p-4 sm:p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]",
              flipped
                ? "pointer-events-auto z-10"
                : "pointer-events-none opacity-0 select-none z-0"
            )}
          >
            <div className="w-full max-w-xl flex flex-col items-center gap-3.5 sm:gap-4 my-auto py-1">
              {/* 1. 顶部单词信息：居中对称，翻卡视线自然对齐 */}
              <div className="flex flex-col items-center gap-1.5 text-center w-full">
                <CardMetaBadges row={row} />
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground select-text">
                    {row.front}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => speak(row.front)}
                    title="发音"
                  >
                    <Volume2 className="size-4" />
                  </Button>
                </div>
                {(props.phonetic ?? row.phonetic) && (
                  <span className="text-sm font-mono text-muted-foreground">
                    {props.phonetic ?? row.phonetic}
                  </span>
                )}
                {retrievability !== null && (
                  <span className="text-[11px] font-mono text-muted-foreground/80 bg-muted px-2 py-0.5 rounded-full border border-border/60">
                    可检索度 {(retrievability * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              {/* 2. 核心释义区域：居中展示，框体等宽 */}
              <div className="w-full rounded-lg bg-muted/30 p-3.5 sm:p-4 border border-border/40 text-center">
                <MeaningBlock
                  row={row}
                  align="center"
                  className="space-y-1.5 text-lg sm:text-xl"
                />
              </div>

              {/* 3. 例句与原文语境：展示框等宽对齐 */}
              <div className="w-full space-y-3">
                <RevealContext
                  row={row}
                  className="w-full max-w-none"
                />
                <DictionaryExample
                  word={row.front}
                  existingMarkdown={row.markdown_content}
                  tags={row.tags}
                  className="w-full max-w-none rounded-lg bg-muted/30 p-3.5 sm:p-4 border-border/40"
                />
              </div>

              {/* 4. 同族词：居中收敛于底部 */}
              <RelatedWordsChips
                front={row.front}
                fronts={distractors.map((d) => d.front)}
                className="justify-center pt-1"
              />
            </div>
          </div>
        </div>
      </div>
      {flipped && (
        <RatingButtons ratingMode={ratingMode} preview={preview} busy={busy} onRate={onRate} />
      )}
    </div>
  );
}
