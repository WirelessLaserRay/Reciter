import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getCleanWordForDisplay,
  getWordMaskHint,
  matchWordSpelling,
  type WordSpellingResult,
} from "@/lib/recall-match";
import { speak } from "@/lib/tts";
import { DictionaryExample } from "../DictionaryExample";
import { RECALL_HINT_SECONDS, type ModeViewProps } from "./types";
import {
  CardMetaBadges,
  MeaningBlock,
  RatingButtons,
  RelatedWordsChips,
  RetrievabilityLine,
  RevealContext,
  WordBlock,
} from "./shared";

/** 移动端专属主动回忆：看中文释义回忆并拼写对应英文单词 */
export function MobileActiveRecallView(props: ModeViewProps) {
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

  const handleDontKnow = useCallback(() => {
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(true);
    speak(row.front);
    onReveal();
  }, [row.front, onReveal]);

  const handleRecallDirect = useCallback(() => {
    setRecallPhase("result");
    setRecallResult(null);
    setLimitedRatings(false);
    speak(row.front);
    onReveal();
  }, [row.front, onReveal]);

  const handleSubmitSpelling = useCallback(() => {
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
  }, [recallInput, row.front, handleRecallDirect, onReveal]);

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

  const cleanWord = getCleanWordForDisplay(row.front);
  const wordLengthText = cleanWord.includes("/")
    ? cleanWord
        .split("/")
        .map((s) => `${s.trim().length} 字母`)
        .join(" / ")
    : cleanWord.includes(" ")
      ? `短语 (${cleanWord.trim().split(/\s+/).length} 词)`
      : `${cleanWord.length} 个字母`;

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
                  recallResult.match
                    ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                )}
              >
                <p className="text-sm font-semibold">
                  {recallResult.match
                    ? "拼写完全正确！"
                    : `拼写有误${recallResult.similarity >= 0.6 ? `（相似度 ${Math.round(recallResult.similarity * 100)}%）` : ""}，请对照加深记忆（若认为正确可点击「已掌握」改判）`}
                </p>
                {!recallResult.match && (
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
                {limitedRatings ? "记不清了？请对照标准拼写与音标强化记忆（若已掌握可点击「已掌握」改判）" : "看单词与释义，对照脑海回忆评分"}
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
