import { Link } from "react-router-dom";
import {
  PlayCircle,
  FileUp,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Deck } from "@/types";
import type { LastStudyContext } from "@/lib/study-prefs";

interface DashboardDeckSectionsProps {
  recommendedDeck: Deck | null;
  lastDeck: Deck | null;
  lastContext: LastStudyContext | null;
  otherDecks: Deck[];
  decks: Deck[];
  dueByDeck: Record<number, number>;
  newByDeck: Record<number, number>;
  weakCount: number;
  dueCount: number;
  newCount: number;
  onStartStudy: (deckId: number, tag?: string, keyOnly?: boolean) => void;
}

export default function DashboardDeckSections({
  recommendedDeck,
  lastDeck,
  lastContext,
  otherDecks,
  decks,
  dueByDeck,
  newByDeck,
  weakCount,
  dueCount,
  newCount,
  onStartStudy,
}: DashboardDeckSectionsProps) {
  return (
    <>
      {/* 智能推荐：到期最多的词库一键开始 */}
      {recommendedDeck ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="size-5 text-primary" />
              今日推荐
            </CardTitle>
            <CardDescription>
              FSRS-5 调度：今日到期卡片 + 配额内新卡
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{recommendedDeck.name}</p>
              <p className="text-sm text-muted-foreground">
                {(dueByDeck[recommendedDeck.id] ?? 0) > 0
                  ? `${dueByDeck[recommendedDeck.id]} 张到期`
                  : `${newByDeck[recommendedDeck.id] ?? 0} 张新词待学`}
                {(dueByDeck[recommendedDeck.id] ?? 0) > 0 &&
                (newByDeck[recommendedDeck.id] ?? 0) > 0
                  ? ` · ${newByDeck[recommendedDeck.id]} 张新词`
                  : ""}
              </p>
            </div>
            <Button size="lg" onClick={() => onStartStudy(recommendedDeck.id)}>
              <PlayCircle className="size-4" />
              开始今日学习
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>今日学习</CardTitle>
            <CardDescription>
              当前没有到期卡片，可浏览词库或导入新内容
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/decks">浏览词库</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/import">
                <FileUp className="size-4" />
                导入词库
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 继续上次学习 */}
      {lastDeck && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="size-4 text-muted-foreground" />
              继续上次
            </CardTitle>
            <CardDescription>跳过选择，直接回到上次的学习位置</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">
                {lastDeck.name}
                {lastContext?.tag ? ` · ${lastContext.tag}` : ""}
                {lastContext?.keyOnly ? " · 仅重点词" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {dueByDeck[lastDeck.id] ?? 0} 张到期
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                onStartStudy(
                  lastContext!.deckId,
                  lastContext?.tag,
                  lastContext?.keyOnly
                )
              }
            >
              <RotateCcw className="size-4" />
              继续上次
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 其他词库 + 快捷入口 */}
      {(otherDecks.length > 0 || decks.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>其他词库</CardTitle>
            <CardDescription>按学习进度快速进入</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {otherDecks.length > 0 ? (
              <div className="divide-y divide-border/50">
                {otherDecks.map((d) => {
                  const due = dueByDeck[d.id] ?? 0;
                  const fresh = newByDeck[d.id] ?? 0;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground">
                          {d.name}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {due > 0 ? `${due} 张到期` : ""}
                          {due > 0 && fresh > 0 ? " · " : ""}
                          {fresh > 0 ? `${fresh} 张新词` : ""}
                          {due === 0 && fresh === 0 ? "暂无待学卡片" : ""}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs shrink-0"
                        onClick={() => onStartStudy(d.id)}
                      >
                        开始
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2 text-center">
                暂无其他词库
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/import">
                  <FileUp className="size-3.5" />
                  导入词库
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/decks">管理词库</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 弱词提醒 */}
      {weakCount > 0 && (
        <Card className="border-amber-500/30">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <p className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              <span>
                你有{" "}
                <span className="font-semibold text-amber-500">{weakCount}</span>{" "}
                个词反复遗忘
              </span>
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/weak-words">去弱词本</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 今日计划 */}
      <Card>
        <CardHeader>
          <CardTitle>今日计划</CardTitle>
          <CardDescription>学习配额与复习安排</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            今日待复习{" "}
            <span className="font-medium text-foreground">{dueCount}</span> 张，
            新卡可学{" "}
            <span className="font-medium text-foreground">{newCount}</span> 张
            （受各词库每日配额限制）。
            进入「学习」页选择词库即可开始。
          </p>
        </CardContent>
      </Card>
    </>
  );
}
