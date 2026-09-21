import { useCallback, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DictionaryExample } from "../DictionaryExample";
import type { ModeViewProps } from "./types";
import {
  CardMetaBadges,
  MeaningBlock,
  RelatedWordsChips,
  WordBlock,
} from "./shared";

/** 新卡教学：先教，延迟突击测试 */
export function NewCardTeachView(props: ModeViewProps) {
  const { row, busy, distractors, onRate, onRateReadyChange } = props;

  // 教学阶段不允许快捷键评分；点击「开始记忆」后按 Good 进入 Learning（1m），
  // 由 FSRS 步骤在稍后队列末尾触发突击测试，而不是当场测试。
  useEffect(() => {
    onRateReadyChange(false);
  }, [busy, onRateReadyChange]);

  const handleStartMemory = useCallback(() => {
    if (busy) return;
    onRate(3);
  }, [busy, onRate]);

  // 统一快捷键：回车开始记忆
  useEffect(() => {
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
