import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArticleQuestion } from "@/lib/vocab";
import { cleanOption } from "./types";

interface ArticleQuizSectionProps {
  questionError: string;
  questions: ArticleQuestion[] | null;
  generating: boolean;
  content: string;
  onGenerateQuestions: () => void;
  selectedOptions: (number | null)[];
  onSelectOption: (questionIndex: number, optionIndex: number) => void;
  showQuizAnswers: boolean;
  onToggleShowQuizAnswers: () => void;
}

export function ArticleQuizSection({
  questionError,
  questions,
  generating,
  content,
  onGenerateQuestions,
  selectedOptions,
  onSelectOption,
  showQuizAnswers,
  onToggleShowQuizAnswers,
}: ArticleQuizSectionProps) {
  return (
    <>
      {questionError && <p className="text-xs text-red-600">{questionError}</p>}
      {!questions && (
        <p className="text-xs text-muted-foreground">
          点击「AI 出题」生成阅读理解选择题。
        </p>
      )}
      <Button
        size="sm"
        className="w-full"
        onClick={onGenerateQuestions}
        disabled={generating || !content}
      >
        {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        AI 出题
      </Button>

      {questions &&
        questions.map((q, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              {i + 1}. {q.question}
            </p>
            <div className="grid gap-1.5">
              {q.options.map((opt, oi) => {
                const isSelected = selectedOptions[i] === oi;
                const isCorrect = q.answer.trim().toUpperCase() === "ABCD"[oi];
                return (
                  <Button
                    key={oi}
                    size="sm"
                    variant="outline"
                    className={cn(
                      "h-auto min-h-9 w-full justify-start whitespace-normal break-words px-3 py-2 text-left leading-relaxed transition-all",
                      showQuizAnswers
                        ? isCorrect
                          ? "border-emerald-600 bg-emerald-600 text-white font-medium hover:bg-emerald-600 shadow-sm"
                          : isSelected
                          ? "border-destructive bg-destructive text-destructive-foreground font-medium hover:bg-destructive shadow-sm"
                          : "opacity-60 hover:opacity-100"
                        : isSelected
                        ? "border-primary bg-primary text-primary-foreground font-semibold shadow-md ring-2 ring-primary/30 hover:bg-primary/95"
                        : "hover:bg-accent/70 text-foreground"
                    )}
                    onClick={() => onSelectOption(i, oi)}
                  >
                    {String.fromCharCode(65 + oi)}. {cleanOption(opt)}
                  </Button>
                );
              })}
            </div>
            {showQuizAnswers && (
              <div className="space-y-1 text-xs">
                <p className="text-green-600 font-medium">
                  答案：{q.answer}. {cleanOption(q.options["ABCD".indexOf(q.answer.toUpperCase())] ?? q.answer)}
                </p>
                <p className="text-muted-foreground">解析：{q.explanation}</p>
              </div>
            )}
          </div>
        ))}

      {questions && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={onToggleShowQuizAnswers}
        >
          {showQuizAnswers ? "隐藏答案解析" : "查看答案解析"}
        </Button>
      )}
    </>
  );
}
