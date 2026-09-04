import { useEffect, useMemo, useState } from "react";
import { BookOpen, Volume2 } from "lucide-react";
import { fetchExamples, type DictionaryResult } from "@/lib/dictionary";
import { getCardExamples } from "@/lib/card-examples";
import { speak } from "@/lib/tts";
import { Button } from "@/components/ui/button";

const SOURCE_LABEL: Record<DictionaryResult["source"], string> = {
  dictionary: "词典例句",
  tatoeba: "Tatoeba 例句",
  ai: "AI 例句",
  none: "",
};

export function DictionaryExample({
  word,
  existingMarkdown,
  tags,
}: {
  word: string;
  existingMarkdown?: string;
  tags?: string;
}) {
  const cardExamples = useMemo(() => getCardExamples(tags), [tags]);
  const [result, setResult] = useState<DictionaryResult | null>(null);

  const hasExisting = !!existingMarkdown?.trim();

  useEffect(() => {
    // 若卡片标签中已包含预匹配例句，学习时直接使用，无需发起网络请求
    if (cardExamples.length > 0) {
      setResult(null);
      return;
    }

    let cancelled = false;
    fetchExamples(word).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [word, cardExamples]);

  // 1. 优先渲染已匹配的多释义例句（来自卡片标签）
  if (cardExamples.length > 0) {
    return (
      <div className="w-full max-w-lg rounded-md border bg-muted/50 p-3 text-left">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1 font-medium text-primary">
            <BookOpen className="size-3" />
            <span>匹配例句 · 不同释义 ({cardExamples.length})</span>
          </div>
          <span className="text-[10px] text-muted-foreground/80">本地标签秒级加载</span>
        </div>
        <ul className="space-y-2 text-sm">
          {cardExamples.map((ex, i) => (
            <li key={i} className="group rounded-md p-1 -mx-1 hover:bg-muted/60 transition-colors">
              <div className="flex items-start justify-between gap-1.5">
                <p className="flex-1 leading-snug">
                  {ex.sense && (
                    <span className="mr-1.5 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {ex.sense}
                    </span>
                  )}
                  “{ex.en}”
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(ex.en);
                  }}
                  title="朗读例句"
                >
                  <Volume2 className="size-3" />
                </Button>
              </div>
              {ex.cn && <p className="mt-0.5 text-xs text-muted-foreground pl-0.5">{ex.cn}</p>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // 2. 无预存例句时渲染动态获取结果
  if (!result || result.examples.length === 0) return null;

  return (
    <div className="w-full max-w-lg rounded-md border bg-muted/50 p-3 text-left">
      <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <BookOpen className="size-3" />
        {hasExisting ? "补充例句" : SOURCE_LABEL[result.source]}
      </div>
      <ul className="space-y-2 text-sm">
        {result.examples.map((ex, i) => (
          <li key={i} className="group rounded-md p-1 -mx-1 hover:bg-muted/60 transition-colors">
            <div className="flex items-start justify-between gap-1.5">
              <p className="flex-1 leading-snug">“{ex.text}”</p>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(ex.text);
                }}
                title="朗读例句"
              >
                <Volume2 className="size-3" />
              </Button>
            </div>
            {ex.translation && <p className="mt-0.5 text-xs text-muted-foreground pl-0.5">{ex.translation}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
