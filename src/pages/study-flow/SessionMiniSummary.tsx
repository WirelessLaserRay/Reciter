import { useEffect } from "react";
import { BookOpen, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SessionStats } from "./types";

/** 学习会话中的迷你小结：每 N 张插入一次 */
export function SessionMiniSummary({
  stats,
  onContinue,
  onAIReview,
}: {
  stats: SessionStats;
  onContinue: () => void;
  onAIReview: (words: string[]) => void;
}) {
  const remembered = Math.max(0, stats.reviewed - stats.again - stats.hard);

  // 默认空格切页：学习小结时按空格继续学习
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
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
      onContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);

  return (
    <Card className="mx-auto max-w-2xl border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          本轮小结
        </CardTitle>
        <CardDescription>
          已学习 {stats.reviewed} 张 · 新卡 {stats.newDone} 张
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-2xl font-bold text-green-600">{remembered}</p>
            <p className="text-xs text-muted-foreground">记得</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-2xl font-bold text-amber-500">{stats.hard}</p>
            <p className="text-xs text-muted-foreground">模糊</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-2xl font-bold text-red-500">{stats.again}</p>
            <p className="text-xs text-muted-foreground">忘记</p>
          </div>
        </div>

        {stats.weakWords.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">本轮薄弱词：</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(stats.weakWords)].slice(0, 8).map((w) => (
                <Badge key={w} variant="destructive">{w}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onContinue}>
            <RefreshCw className="size-4" />
            继续学习
          </Button>
          <Button
            variant="outline"
            onClick={() => onAIReview(stats.weakWords)}
            disabled={stats.weakWords.length === 0}
          >
            <Sparkles className="size-4" />
            AI 帮我巩固
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">快捷键：空格 继续学习</p>
      </CardContent>
    </Card>
  );
}
