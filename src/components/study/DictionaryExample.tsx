import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { fetchExamples, type DictionaryResult } from "@/lib/dictionary";

const SOURCE_LABEL: Record<DictionaryResult["source"], string> = {
  dictionary: "词典例句",
  tatoeba: "Tatoeba 例句",
  ai: "AI 例句",
  none: "",
};

export function DictionaryExample({
  word,
  existingMarkdown,
}: {
  word: string;
  existingMarkdown?: string;
}) {
  const [result, setResult] = useState<DictionaryResult | null>(null);

  const hasExisting = !!existingMarkdown?.trim();

  useEffect(() => {
    let cancelled = false;
    fetchExamples(word).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  if (!result || result.examples.length === 0) return null;

  return (
    <div className="w-full max-w-lg rounded-md border bg-muted/50 p-3 text-left">
      <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <BookOpen className="size-3" />
        {hasExisting ? "补充例句" : SOURCE_LABEL[result.source]}
      </div>
      <ul className="space-y-1 text-sm">
        {result.examples.map((ex, i) => (
          <li key={i}>“{ex}”</li>
        ))}
      </ul>
    </div>
  );
}
