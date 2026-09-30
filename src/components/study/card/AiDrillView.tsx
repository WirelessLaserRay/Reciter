import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  HelpCircle,
  Keyboard,
  Layers,
  Sparkles,
  Volume2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCardMeaning } from "@/lib/meaning";
import { fetchConfusableWords, type ConfusableItem } from "@/lib/confusable-ai";
import { findRelatedWords, stemOf } from "@/lib/word-family";
import {
  getCleanWordForDisplay,
  getWordMaskHint,
  matchWordSpelling,
} from "@/lib/recall-match";
import { speak } from "@/lib/tts";
import MarkdownContext from "../MarkdownContext";
import { DictionaryExample } from "../DictionaryExample";
import {
  FALLBACK_DISTRACTOR_MEANINGS,
  type ModeViewProps,
} from "./types";
import {
  CardMetaBadges,
  MeaningBlock,
  RatingButtons,
  WordBlock,
  shuffle,
} from "./shared";

/**
 * 弱词靶向攻克视图（P1 客观测试把关 + 易混词消歧矩阵 + 词根拆解 + P2 会话内延迟反向回炉）
 */
export function AiDrillView(props: ModeViewProps) {
  const {
    row,
    config,
    ratingMode,
    preview,
    busy,
    distractors,
    isRetest,
    onReveal,
    onRate,
    onRateReadyChange,
  } = props;

  const targetWord = row.front.trim();
  const cleanWord = useMemo(() => getCleanWordForDisplay(targetWord), [targetWord]);
  const targetMeaning = getCardMeaning(row).trim();
  const phoneticText = props.phonetic ?? row.phonetic;

  // ========================================================
  // Branch A: P2 会话内延迟反向回炉 (Reverse Retest)
  // ========================================================
  const [retestInput, setRetestInput] = useState("");
  const [retestPassed, setRetestPassed] = useState<boolean | null>(null);
  const retestInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRetest) {
      onRateReadyChange(retestPassed !== null && !busy);
    }
  }, [isRetest, retestPassed, busy, onRateReadyChange]);

  const handleRetestSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!retestInput.trim()) return;
      const matched =
        matchWordSpelling(retestInput, targetWord).match ||
        matchWordSpelling(retestInput, cleanWord).match;
      if (matched) {
        setRetestPassed(true);
        speak(targetWord);
        onReveal();
      } else {
        setRetestPassed(false);
        speak(targetWord);
        onReveal();
      }
    },
    [retestInput, targetWord, cleanWord, onReveal]
  );

  const handleRetestDontKnow = useCallback(() => {
    setRetestPassed(false);
    speak(targetWord);
    onReveal();
  }, [targetWord, onReveal]);

  // ========================================================
  // Branch B: P1 首轮弱词攻克 (Objective Test Gate & Tri-dimensional Breakdown)
  // ========================================================
  const [phase, setPhase] = useState<"quiz" | "result">("quiz");
  const [quizPassed, setQuizPassed] = useState<boolean | null>(null);
  const [reinforceTyped, setReinforceTyped] = useState("");
  const [reinforceDone, setReinforceDone] = useState(false);

  // 4 个客观选项（1 正确 + 3 干扰项）
  const options = useMemo(() => {
    const candidateMeanings = Array.from(
      new Set(
        distractors
          .map((d) => getCardMeaning(d).trim())
          .filter((m) => m && m !== targetMeaning)
          .concat(FALLBACK_DISTRACTOR_MEANINGS.filter((m) => m !== targetMeaning))
      )
    );
    const chosenDistractors = shuffle(candidateMeanings).slice(0, 3);
    return shuffle([targetMeaning, ...chosenDistractors]);
  }, [distractors, targetMeaning]);

  // 易混词消歧矩阵（后台 AI 匹配全英语词典易混词，离线回退经典词典）
  const [confusableList, setConfusableList] = useState<ConfusableItem[]>([]);
  const [confusableSource, setConfusableSource] = useState<"ai" | "curated" | "none">("none");

  useEffect(() => {
    let active = true;
    fetchConfusableWords(targetWord, targetMeaning)
      .then((res) => {
        if (!active) return;
        setConfusableList(res.items);
        setConfusableSource(res.source);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [targetWord, targetMeaning]);

  // 词根与同族词
  const stem = useMemo(() => stemOf(targetWord), [targetWord]);
  const relatedWords = useMemo(
    () => findRelatedWords(targetWord, distractors.map((d) => d.front), 4),
    [targetWord, distractors]
  );

  // 评分就绪状态控制
  useEffect(() => {
    if (!isRetest) {
      onRateReadyChange(phase === "result" && !busy);
    }
  }, [isRetest, phase, busy, onRateReadyChange]);

  const handleSelectOption = useCallback(
    (index: number) => {
      if (phase === "result") return;
      const isCorrect = options[index] === targetMeaning;
      setQuizPassed(isCorrect);
      setPhase("result");
      speak(targetWord);
      onReveal();
    },
    [phase, options, targetMeaning, targetWord, onReveal]
  );

  const handleGiveUpQuiz = useCallback(() => {
    if (phase === "result") return;
    setQuizPassed(false);
    setPhase("result");
    speak(targetWord);
    onReveal();
  }, [phase, targetWord, onReveal]);

  // 跟打验证
  const handleReinforceChange = (val: string) => {
    setReinforceTyped(val);
    if (
      matchWordSpelling(val, targetWord).match ||
      matchWordSpelling(val, cleanWord).match
    ) {
      setReinforceDone(true);
      speak(targetWord);
    }
  };

  // 快捷键支持：在测试阶段按 1/2/3/4 选择对应选项
  useEffect(() => {
    if (isRetest || phase !== "quiz") return;
    const onKey = (e: KeyboardEvent) => {
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
      if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < options.length) {
          e.preventDefault();
          handleSelectOption(idx);
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleGiveUpQuiz();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRetest, phase, options, handleSelectOption, handleGiveUpQuiz]);

  // ========================================================
  // RENDER: P2 会话内反向回炉视图
  // ========================================================
  if (isRetest) {
    const mask = getWordMaskHint(targetWord, true);
    return (
      <div className="space-y-4">
        <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 sm:gap-5 rounded-xl border border-rose-500/50 bg-card p-6 sm:p-8">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
            <Sparkles className="size-3.5" />
            <span>弱词会话内反向回炉检验</span>
          </div>

          {/* 醒目展示中文释义 */}
          <div className="max-w-lg text-center space-y-1">
            <div className="text-xl sm:text-2xl font-bold">{targetMeaning}</div>
            {phoneticText && (
              <div className="text-xs text-muted-foreground font-mono">{phoneticText}</div>
            )}
          </div>

          {/* 挖空字母提示 */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg tracking-widest text-muted-foreground bg-background/80 px-3 py-1 rounded-md border">
              {mask}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => speak(targetWord)}
              title="发音提示"
            >
              <Volume2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>

          {/* 回炉作答区域 */}
          {retestPassed === null ? (
            <form onSubmit={handleRetestSubmit} className="w-full max-w-sm space-y-3">
              <div className="flex gap-2">
                <Input
                  ref={retestInputRef}
                  autoFocus
                  placeholder="输入完整英文拼写…"
                  value={retestInput}
                  onChange={(e) => setRetestInput(e.target.value)}
                  className="font-mono text-center tracking-wider"
                />
                <Button type="submit" disabled={!retestInput.trim()}>
                  验证
                </Button>
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRetestDontKnow}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  想不起来，看正确答案
                </Button>
              </div>
            </form>
          ) : (
            <div className="w-full max-w-md space-y-3">
              {retestPassed ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>拼写正确，词形掌握准确。</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-600 dark:text-rose-400 font-medium">
                  <XCircle className="size-4 shrink-0" />
                  <span>拼写未通过，已揭示正确拼写，稍后继续巩固。</span>
                </div>
              )}
              <WordBlock word={targetWord} phonetic={phoneticText} />
            </div>
          )}
        </div>

        {/* 评分栏 */}
        <RatingButtons
          ratingMode={ratingMode}
          preview={preview}
          busy={busy}
          limited={retestPassed === false}
          onRate={onRate}
        />
      </div>
    );
  }

  // ========================================================
  // RENDER: P1 首轮弱词攻克视图
  // ========================================================
  return (
    <div className="space-y-4">
      <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 sm:gap-5 rounded-xl border border-amber-500/30 bg-card p-6 sm:p-8">
        <CardMetaBadges row={row} />

        {/* 英文原词与发音 */}
        <WordBlock word={targetWord} phonetic={phoneticText} />

        {/* Phase 1: 客观测试把关（遮蔽释义，强制主动提取） */}
        {phase === "quiz" ? (
          <div className="w-full max-w-md space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <HelpCircle className="size-3.5" />
              <span>弱词客观把关：请选出该词的准确释义</span>
            </div>

            <div className="grid gap-2">
              {options.map((opt, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="h-auto w-full justify-start text-left px-3 py-2.5 text-sm whitespace-normal leading-snug hover:border-primary/50"
                  onClick={() => handleSelectOption(idx)}
                >
                  <span className="mr-2 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className="break-words">{opt}</span>
                </Button>
              ))}
            </div>

            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGiveUpQuiz}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                想不起来 / 直接看消歧解析
              </Button>
            </div>
          </div>
        ) : (
          /* Phase 2: 测试结果与靶向三维认知重构 */
          <div className="w-full max-w-lg space-y-4">
            {/* 对错反馈横幅 */}
            {quizPassed ? (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>回答正确，释义掌握准确。</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                <span>未答对，已揭示释义与形近辨析，稍后继续巩固。</span>
              </div>
            )}

            {/* 完整释义揭示 */}
            <div className="text-center">
              <MeaningBlock row={row} className="text-xl" />
            </div>

            {/* 维度 1: 易混词同屏消歧对比矩阵（仅在匹配到真实易混词时呈现，无易混词则静默不展示） */}
            {confusableList.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-left space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-primary">
                  <div className="flex items-center gap-1.5">
                    <Layers className="size-3.5" />
                    <span>形近词消歧对比矩阵</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {confusableSource === "ai" ? "AI 全词典智能匹配" : "经典形近词辨析"}
                  </span>
                </div>
                <div className="grid gap-1.5 text-xs">
                  <div className="rounded border bg-background/80 p-2.5 flex items-start gap-2">
                    <span className="font-bold text-foreground font-mono shrink-0">
                      {targetWord}
                    </span>
                    <span className="text-muted-foreground break-words">{targetMeaning}</span>
                  </div>
                  {confusableList.map((c) => (
                    <div
                      key={c.word}
                      className="rounded border bg-background/40 p-2.5 space-y-1 text-muted-foreground"
                    >
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-foreground/80 font-mono shrink-0">
                          {c.word}
                        </span>
                        <span className="break-words text-xs">{c.meaning}</span>
                      </div>
                      {c.distinction && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400/90 pl-0.5">
                          辨析：{c.distinction}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 维度 2: 词根词缀与同族词拆解 */}
            {(stem || relatedWords.length > 0) && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
                {stem && (
                  <Badge variant="outline" className="text-[11px] font-mono">
                    词干: {stem}
                  </Badge>
                )}
                {relatedWords.length > 0 && (
                  <>
                    <span>同族词:</span>
                    {relatedWords.map((w) => (
                      <Badge key={w} variant="secondary" className="text-[11px] font-mono">
                        {w}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* 维度 3: 肌肉记忆输入跟打强化（仅在未答对时强制/推荐） */}
            {!quizPassed && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground flex items-center gap-1">
                    <Keyboard className="size-3" />
                    肌肉记忆：请盲打一遍该单词
                  </span>
                  {reinforceDone && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                      <Check className="size-3" /> 跟打成功
                    </span>
                  )}
                </div>
                <Input
                  placeholder={`输入 ${cleanWord} 强化拼写…`}
                  value={reinforceTyped}
                  onChange={(e) => handleReinforceChange(e.target.value)}
                  className={cn(
                    "h-8 font-mono text-xs",
                    reinforceDone && "border-emerald-500 bg-emerald-500/10 text-emerald-600 font-bold"
                  )}
                />
              </div>
            )}

            {/* 原文语境与权威例句 */}
            {config.showMarkdown && (
              <div className="w-full text-left">
                <MarkdownContext markdownContent={row.markdown_content} word={targetWord} />
              </div>
            )}
            <DictionaryExample word={targetWord} existingMarkdown={row.markdown_content} tags={row.tags} />
          </div>
        )}
      </div>

      {/* 评分按钮栏：仅在进入结果阶段且非作答中时开放 */}
      {phase === "result" && (
        <RatingButtons
          ratingMode={ratingMode}
          preview={preview}
          busy={busy}
          limited={!quizPassed}
          onRate={onRate}
        />
      )}
    </div>
  );
}
