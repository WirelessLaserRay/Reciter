import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/env";
import {
  getCleanWordForDisplay,
  getWordMaskHint,
  matchWordSpelling,
} from "@/lib/recall-match";
import { getCardMeaning } from "@/lib/meaning";
import { speak } from "@/lib/tts";
import { pickSimilarWords } from "@/lib/similar-words";
import { optionIndexFromNumberKey } from "@/lib/shortcuts";
import { getAutoPronounceEnabled } from "@/lib/study-prefs";
import { DictionaryExample } from "../DictionaryExample";
import {
  FALLBACK_DISTRACTOR_MEANINGS,
  FALLBACK_DISTRACTOR_WORDS,
  type ModeViewProps,
} from "./types";
import {
  CardMetaBadges,
  RatingButtons,
  RelatedWordsChips,
  RevealContext,
  WordBlock,
  shuffle,
} from "./shared";

/** 快速测试（熟练卡，秒答自动 Good） */
export function QuickTestView(props: ModeViewProps) {
  const { row, ratingMode, preview, busy, distractors, quickMs, onReveal, onRate, onRateReadyChange } = props;
  const startRef = useRef(Date.now());
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const [fast, setFast] = useState(false);
  const [showMoreHint, setShowMoreHint] = useState(false);
  const isDesktop = isTauri();

  const choice = useMemo(() => {
    const targetWord = row.front.trim();
    const currentMeaning = getCardMeaning(row).trim();
    const isChineseToEnglish = Boolean(currentMeaning);

    if (isDesktop) {
      return {
        isDesktop: true,
        useFront: true as const,
        options: [] as string[],
        prompt: currentMeaning || row.back || targetWord,
        correct: targetWord,
      };
    }

    if (isChineseToEnglish) {
      const candidateFronts = Array.from(
        new Set(
          distractors
            .map((d) => d.front.trim())
            .filter((f) => f && f.toLowerCase() !== targetWord.toLowerCase())
            .concat(FALLBACK_DISTRACTOR_WORDS.filter((w) => w.toLowerCase() !== targetWord.toLowerCase()))
        )
      );

      const similar = pickSimilarWords(targetWord, candidateFronts, 3);
      const remaining = candidateFronts.filter((f) => !similar.includes(f));
      const needed = Math.max(0, 3 - similar.length);
      const otherChoices = [...similar, ...remaining.slice(0, needed)];
      const options = shuffle([targetWord, ...otherChoices]);

      return {
        isDesktop: false,
        useFront: true as const,
        options,
        prompt: currentMeaning,
        correct: targetWord,
      };
    } else {
      const candidateMeanings = Array.from(
        new Set(
          distractors
            .map((d) => getCardMeaning(d).trim())
            .filter((b) => b && b !== currentMeaning)
            .concat(FALLBACK_DISTRACTOR_MEANINGS.filter((m) => m !== currentMeaning))
        )
      );
      const otherChoices = candidateMeanings.slice(0, 3);
      const correctMeaning = currentMeaning || row.back || targetWord;
      const options = shuffle([correctMeaning, ...otherChoices]);

      return {
        isDesktop: false,
        useFront: false as const,
        options,
        prompt: targetWord,
        correct: correctMeaning,
      };
    }
  }, [distractors, row, isDesktop]);

  const useChoice = !isDesktop && choice.options.length >= 2;

  useEffect(() => {
    onRateReadyChange(checked !== null && !busy);
  }, [checked, busy, onRateReadyChange]);

  const finish = useCallback((correct: boolean) => {
    setFast(correct && Date.now() - startRef.current <= quickMs);
    setChecked(correct);
    onReveal();
  }, [quickMs, onReveal]);

  const submitChoice = useCallback((opt: string) => {
    if (checked !== null || busy) return;
    const isCorrect =
      opt.trim().toLowerCase() === choice.correct.trim().toLowerCase() ||
      matchWordSpelling(opt, choice.correct).match;
    finish(isCorrect);
  }, [checked, busy, choice.correct, finish]);

  const submitFill = useCallback((giveUp = false) => {
    if (checked !== null || busy) return;
    if (giveUp) {
      finish(false);
      return;
    }
    if (!typed.trim()) return;
    const isCorrect =
      typed.trim().toLowerCase() === choice.correct.trim().toLowerCase() ||
      matchWordSpelling(typed, choice.correct).match;
    finish(isCorrect);
  }, [checked, busy, finish, typed, choice.correct]);

  // 快速测试选择题：1-4 对应选项 A-D（仅在移动/Web 选择题阶段生效）
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
  }, [checked, useChoice, busy, choice.options, submitChoice]);

  // 快速测试作答揭晓后快捷键：Enter 或 空格极速推进评分
  useEffect(() => {
    if (checked === null || busy) return;
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
      if (e.key === "Enter" || e.key === " ") {
        if (interactive) return;
        e.preventDefault();
        onRate(checked ? 3 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checked, busy, onRate]);

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

  const cleanWord = getCleanWordForDisplay(row.front);
  const wordLengthText = cleanWord.includes("/")
    ? cleanWord
        .split("/")
        .map((s) => `${s.trim().length} 字母`)
        .join(" / ")
    : cleanWord.includes(" ")
      ? `短语 (${cleanWord.trim().split(/\s+/).length} 词)`
      : `${cleanWord.length} 个字母`;

  const modeDescription = isDesktop
    ? `快速测试 · ${Math.round(quickMs / 1000)} 秒内拼对建议「已掌握」 · 看释义拼写单词（中译英）`
    : `快速测试 · ${Math.round(quickMs / 1000)} 秒内答对建议「已掌握」 · ${
        choice.useFront ? "看释义选单词（中译英）" : "看单词选释义（英译中）"
      }`;

  return (
    <div className="space-y-4">
      <div className="flex min-h-[50vh] sm:min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border bg-card p-5 sm:p-8">
        <CardMetaBadges row={row} />
        <p className="text-sm text-muted-foreground">{modeDescription}</p>
        {choice.useFront ? (
          <div className="text-center text-3xl font-bold break-words px-4">{choice.prompt}</div>
        ) : (
          <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
        )}

        {/* 桌面端中译英拼写：未作答时展示首字母掩码提示 */}
        {checked === null && !useChoice && (
          <div className="flex flex-col items-center gap-1.5 my-1">
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
        )}

        {/* 作答完毕后如果是中译英，补充展示英文单词及音标发音 */}
        {checked !== null && choice.useFront && (
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
          <div className="flex flex-col items-center gap-3 w-full max-w-md">
            <div className="flex w-full gap-2">
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="输入对应的英文单词…"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                className="font-medium text-base tracking-wide text-center"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (typed.trim()) {
                      submitFill();
                    }
                  }
                }}
                autoFocus
              />
              <Button onClick={() => submitFill()} disabled={!typed.trim() || busy}>
                检查
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => submitFill(true)}
                disabled={busy}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                不记得，看答案
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">快捷键：Enter 提交检查</p>
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
                {checked
                  ? fast
                    ? "回答正确，秒答 → 建议记为「已掌握」"
                    : "回答正确"
                  : "回答错误（若误触或已掌握，可点击下方「已掌握」改判）"}
              </span>
            </div>
            {!checked && (
              <p className="mt-1">
                正确答案：<span className="font-semibold">{choice.correct}</span>
              </p>
            )}
            {!useChoice && typed.trim() && (
              <p className="mt-1 text-xs text-muted-foreground">
                你的作答：<span className="font-mono">{typed.trim()}</span>
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
        <div className="space-y-2">
          <RatingButtons
            ratingMode={ratingMode}
            preview={preview}
            busy={busy}
            limited={checked === false}
            onRate={onRate}
          />
          <p className="text-center text-xs text-muted-foreground">
            快捷键：Enter / 空格 快速推进（{checked ? "已掌握" : "忘了"}） · 1-4 评级
          </p>
        </div>
      )}
    </div>
  );
}
