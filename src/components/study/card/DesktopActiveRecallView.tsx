import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchRecall, type RecallMatchResult } from "@/lib/recall-match";
import { getCardMeaning } from "@/lib/meaning";
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

/** 桌面端专属主动回忆：看英文单词回忆释义（与 Windows 原生体验完全一致） */
export function DesktopActiveRecallView(props: ModeViewProps) {
  const { row, ratingMode, preview, retrievability, busy, distractors, onReveal, onRate, onRateReadyChange } = props;
  const [recallPhase, setRecallPhase] = useState<"prompt" | "input" | "result">("prompt");
  const [recallInput, setRecallInput] = useState("");
  const [recallResult, setRecallResult] = useState<RecallMatchResult | null>(null);
  const [limitedRatings, setLimitedRatings] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // 10 秒规则柔和提示（不强制，只提醒）
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

  const handleCheckRecall = useCallback(() => {
    if (!recallInput.trim()) return;
    const result = matchRecall(recallInput, getCardMeaning(row));
    setRecallResult(result);
    setRecallPhase("result");
    setLimitedRatings(false);
    onReveal();
  }, [recallInput, row, onReveal]);

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
              <p
                className={
                  recallResult.match
                    ? "text-sm text-green-600 dark:text-green-400 font-medium"
                    : "text-sm text-amber-600 dark:text-amber-400 font-medium"
                }
              >
                {recallResult.match
                  ? `基本正确！相似度 ${Math.round(recallResult.similarity * 100)}%`
                  : `和标准释义有差距（相似度 ${Math.round(recallResult.similarity * 100)}%），请对照记忆`}
              </p>
            )}
            {!recallResult && (
              <p className="text-sm text-muted-foreground">
                {limitedRatings
                  ? "记不清了？请对照标准释义强化记忆（若已掌握可点击「已掌握」改判）"
                  : "没想起来也没关系，先看释义再评分"}
              </p>
            )}
            <RetrievabilityLine value={retrievability} />
            <RelatedWordsChips front={row.front} fronts={distractors.map((d) => d.front)} />
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
