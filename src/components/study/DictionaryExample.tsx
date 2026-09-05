import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, RotateCw, Volume2 } from "lucide-react";
import { fetchExamples, type DictionaryResult } from "@/lib/dictionary";
import { getCardExamples } from "@/lib/card-examples";
import { speak } from "@/lib/tts";
import { Button } from "@/components/ui/button";

const SOURCE_LABEL: Record<DictionaryResult["source"], string> = {
  dictionary: "词典权威例句",
  tatoeba: "Tatoeba 语料库",
  ai: "AI 智能例句",
  none: "在线例句",
};

/** 高亮例句中的核心单词及其时态/复数变形 */
function HighlightedSentence({ text, word }: { text: string; word: string }) {
  const parts = useMemo(() => {
    const cleanWord = word.trim().replace(/[^a-zA-Z0-9-]/g, "");
    if (!cleanWord || cleanWord.length < 2) return [{ text, match: false }];
    const re = new RegExp(`\\b(${cleanWord}[a-zA-Z]*)\\b`, "gi");
    const segments: { text: string; match: boolean }[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIdx) {
        segments.push({ text: text.slice(lastIdx, m.index), match: false });
      }
      segments.push({ text: m[0], match: true });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
      segments.push({ text: text.slice(lastIdx), match: false });
    }
    return segments.length > 0 ? segments : [{ text, match: false }];
  }, [text, word]);

  return (
    <span>
      “
      {parts.map((p, idx) =>
        p.match ? (
          <span
            key={idx}
            className="font-semibold text-primary underline underline-offset-2 decoration-primary/40"
          >
            {p.text}
          </span>
        ) : (
          <span key={idx}>{p.text}</span>
        )
      )}
      ”
    </span>
  );
}

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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const hasExisting = !!existingMarkdown?.trim();

  // 加载例句（优先读取标签预匹配例句；若无则查询本地持久化缓存及在线 API）
  useEffect(() => {
    if (cardExamples.length > 0) {
      setResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchExamples(word)
      .then((r) => {
        if (!cancelled) {
          setResult(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [word, cardExamples]);

  // 手动重新获取/刷新例句
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (refreshing) return;
    setRefreshing(true);
    try {
      const fresh = await fetchExamples(word, true);
      setResult(fresh);
    } finally {
      setRefreshing(false);
    }
  };

  // 1. 优先渲染卡片标签预匹配例句（多释义）
  if (cardExamples.length > 0) {
    const primarySource =
      cardExamples[0]?.source === "dictionary"
        ? "词典匹配"
        : cardExamples[0]?.source === "tatoeba"
        ? "Tatoeba"
        : "AI 匹配";

    return (
      <div className="w-full max-w-lg rounded-md border bg-muted/50 p-3 text-left">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-primary">
            <BookOpen className="size-3" />
            <span>匹配例句 · 不同释义 ({cardExamples.length})</span>
          </div>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            来源：{primarySource}
          </span>
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
                  {ex.source && (
                    <span className="mr-1.5 inline-block rounded border px-1 py-0.2 text-[9px] text-muted-foreground">
                      {ex.source === "dictionary" ? "词典" : ex.source === "tatoeba" ? "Tatoeba" : "AI"}
                    </span>
                  )}
                  <HighlightedSentence text={ex.en} word={word} />
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

  // 2. 加载骨架屏（平滑防抖动）
  if (loading && !result) {
    return (
      <div className="w-full max-w-lg rounded-md border border-dashed bg-muted/30 p-3 text-left">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin text-primary" />
            <span>正在加载例句与翻译…</span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">本地缓存 / API 检索中</span>
        </div>
        <div className="space-y-1.5 animate-pulse">
          <div className="h-3.5 w-4/5 rounded bg-muted/60" />
          <div className="h-3 w-1/2 rounded bg-muted/40" />
        </div>
      </div>
    );
  }

  // 3. 无可用例句时不显示空占位
  if (!result || result.examples.length === 0) return null;

  // 4. 渲染本地缓存或动态获取的例句（始终明确展示来源）
  const sourceName = SOURCE_LABEL[result.source] || "在线获取";

  return (
    <div className="w-full max-w-lg rounded-md border bg-muted/50 p-3 text-left">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <BookOpen className="size-3 text-primary" />
          <span className="font-medium text-foreground/90">{hasExisting ? "补充例句" : "参考例句"}</span>
          <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            来源：{sourceName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 text-muted-foreground hover:text-foreground"
          onClick={handleRefresh}
          disabled={refreshing}
          title="重新获取例句"
        >
          <RotateCw className={`size-2.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
        </Button>
      </div>
      <ul className="space-y-2 text-sm">
        {result.examples.map((ex, i) => (
          <li key={i} className="group rounded-md p-1 -mx-1 hover:bg-muted/60 transition-colors">
            <div className="flex items-start justify-between gap-1.5">
              <p className="flex-1 leading-snug">
                <HighlightedSentence text={ex.text} word={word} />
              </p>
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
