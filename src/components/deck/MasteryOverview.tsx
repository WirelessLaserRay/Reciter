import { useNavigate } from "react-router-dom";
import { Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DeckWeakWord, MasteryDistribution } from "@/lib/db";

interface MasteryOverviewProps {
  distribution: MasteryDistribution;
  weakWords: DeckWeakWord[];
  deckId: number;
}

const SEGMENTS: {
  key: keyof Omit<MasteryDistribution, "total">;
  label: string;
  color: string;
  dot: string;
}[] = [
  { key: "mastered", label: "已掌握", color: "bg-green-500", dot: "🟢" },
  { key: "learning", label: "学习中", color: "bg-amber-500", dot: "🟡" },
  { key: "weak", label: "弱词", color: "bg-red-500", dot: "🔴" },
  { key: "unlearned", label: "未学习", color: "bg-muted-foreground/40", dot: "⚪" },
];

/**
 * Phase 6C.3 词库掌握度全景：
 * 分段彩色进度条 + 四类统计 + 弱词 TOP 5 + 一键 AI 攻克入口。
 */
export default function MasteryOverview({ distribution, weakWords, deckId }: MasteryOverviewProps) {
  const navigate = useNavigate();
  const total = distribution.total;
  const masteredPct = total > 0 ? (distribution.mastered / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4 text-primary" />
          掌握度全景
        </CardTitle>
        <CardDescription>已掌握 {Math.round(masteredPct)}% · 共 {total} 张卡片</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 分段进度条 */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {SEGMENTS.map((s) => {
            const pct = total > 0 ? (distribution[s.key] / total) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={s.key}
                className={s.color}
                style={{ width: pct + "%" }}
                title={s.label + " " + distribution[s.key] + " 张"}
              />
            );
          })}
        </div>

        {/* 四类统计 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-lg font-bold">{distribution[s.key]}</p>
              <p className="text-xs text-muted-foreground">
                {s.dot} {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* 弱词 TOP 5 */}
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">
            弱词 TOP {weakWords.length > 0 ? weakWords.length : 5}
          </p>
          {weakWords.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              暂无弱词，继续保持 🎉
            </p>
          ) : (
            <ol className="space-y-1.5">
              {weakWords.map((w, i) => (
                <li key={w.front} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                    {w.front}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    遗忘 {w.lapses} 次 · 稳定 {w.stability.toFixed(1)} 天
                  </span>
                </li>
              ))}
            </ol>
          )}
          {weakWords.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full border-amber-500/40"
              onClick={() => navigate("/weak-words?deck=" + deckId)}
            >
              <Sparkles className="size-3.5 text-amber-500" />
              一键 AI 攻克这些弱词
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
