import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  GraduationCap,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { useDeckStore } from "@/stores/useDeckStore";
import { getLastStudyContext } from "@/lib/study-prefs";
import {
  getTodayOrchestratedPlan,
  type TodayOrchestratedPlan,
} from "@/lib/exam-planner";
import { parseDayStartHour, getDayEndDate } from "@/lib/day";
import { autoPullIfRemoteNewer } from "@/lib/sync";

/** 学习中心与词库选择台（移动端与桌面端自适应紧凑布局） */
export function DeckPicker({
  onStartStudy,
  onOpenScope,
  onStartOrchestrated,
}: {
  onStartStudy: (id: number, tag?: string, keyOnly?: boolean) => void;
  onOpenScope: (deck: { id: number; name: string }) => void;
  onStartOrchestrated?: () => void;
}) {
  const { decks, cardCounts, refresh } = useDeckStore();
  const [lastStudy, setLastStudy] = useState<{ deckId: number; tag?: string; keyOnly?: boolean } | null>(null);
  const [orchestratedPlan, setOrchestratedPlan] = useState<TodayOrchestratedPlan | null>(null);
  const [dueMap, setDueMap] = useState<Record<number, number>>({});

  useEffect(() => {
    refresh();
    void autoPullIfRemoteNewer()
      .then((pulled) => {
        if (pulled) refresh();
      })
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (decks.length === 0) return;
    (async () => {
      const hour = parseDayStartHour(await db.getSetting("day_start"));
      const dayEndIso = getDayEndDate(hour).toISOString();
      const [last, plan, duePairs] = await Promise.all([
        getLastStudyContext(),
        getTodayOrchestratedPlan(decks).catch(() => null),
        Promise.all(
          decks.map(async (d) => {
            const due = await db.getDueCountByDecks([d.id], dayEndIso).catch(() => 0);
            return [d.id, due] as const;
          })
        ),
      ]);
      setLastStudy(last);
      setOrchestratedPlan(plan);
      setDueMap(Object.fromEntries(duePairs));
    })().catch(() => {});
  }, [decks]);

  if (decks.length === 0) {
    return (
      <Card className="mx-auto max-w-xl border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="size-10 text-muted-foreground" />
          <CardTitle>还没有词库</CardTitle>
          <CardDescription>先去「导入」或「词库」页面创建词库吧</CardDescription>
          <Button asChild variant="outline">
            <Link to="/import">前往导入</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lastDeck = lastStudy ? decks.find((d) => d.id === lastStudy.deckId) : null;
  const hasOrchestratedPlan =
    orchestratedPlan &&
    orchestratedPlan.deckIds.length > 0 &&
    (orchestratedPlan.targetNew > 0 || orchestratedPlan.targetReview > 0 || orchestratedPlan.isCompleted);

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6 pb-6">
      {/* 顶部标题区（移动端更紧凑精致） */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">学习中心</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            选择词库或从备考规划直接进入
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 text-xs h-8">
          <Link to="/decks">管理词库</Link>
        </Button>
      </div>

      {/* 1. AI 备考规划 Hero 卡片（若有配置备考目标） */}
      {hasOrchestratedPlan && onStartOrchestrated && (
        <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-background to-primary/10 shadow-xs">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                  <GraduationCap className="size-4 sm:size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm sm:text-base">
                      {orchestratedPlan.examTitle || "今日 AI 备战规划"}
                    </span>
                    {orchestratedPlan.isCompleted ? (
                      <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-[10px] text-green-600 dark:text-green-400">
                        今日已达成
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        规划中
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <span>覆盖 {orchestratedPlan.deckIds.length === 0 ? "全部" : orchestratedPlan.deckIds.length} 个词库</span>
                    {orchestratedPlan.daysUntilExam > 0 && <span>· 距考试 {orchestratedPlan.daysUntilExam} 天</span>}
                    <span>· 平均稳定 {orchestratedPlan.avgStability} 天</span>
                    <span>· 掌握率 {orchestratedPlan.masteryRate}%</span>
                    {orchestratedPlan.inSprintPhase && (
                      <Badge variant="secondary" className="text-[10px] h-4 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        冲刺期
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={onStartOrchestrated}
                className="shrink-0 text-xs h-8 sm:h-9"
              >
                <RefreshCw className="size-3.5 mr-1" />
                {orchestratedPlan.isCompleted ? "继续巩固" : "开始今日备考"}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="rounded-md bg-background/80 border p-2">
                <div className="text-base sm:text-lg font-bold text-primary">
                  {orchestratedPlan.inSprintPhase ? 0 : orchestratedPlan.targetNew}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {orchestratedPlan.inSprintPhase ? "新学 (冲刺暂停)" : "今日待新学"}
                </div>
              </div>
              <div className="rounded-md bg-background/80 border p-2">
                <div className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">{orchestratedPlan.targetReview}</div>
                <div className="text-[11px] text-muted-foreground">今日待复习</div>
              </div>
              <div className="rounded-md bg-background/80 border p-2">
                <div className="text-base sm:text-lg font-bold text-foreground">{orchestratedPlan.totalTarget}</div>
                <div className="text-[11px] text-muted-foreground">今日总指标</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. 快捷继续上次学习（如果有记录且不在备战卡中重复） */}
      {lastDeck && lastStudy && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs sm:text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">继续上次：</span>
            <span className="font-medium truncate">{lastDeck.name}</span>
            {lastStudy.tag && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {lastStudy.tag}
              </Badge>
            )}
            {lastStudy.keyOnly && (
              <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px] shrink-0">
                重点
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStartStudy(lastStudy.deckId, lastStudy.tag, lastStudy.keyOnly)}
            className="h-7 px-2.5 text-xs text-primary font-medium hover:text-primary hover:bg-primary/10 shrink-0"
          >
            立即继续
            <ArrowLeft className="size-3.5 ml-1 rotate-180" />
          </Button>
        </div>
      )}

      {/* 3. 词库列表 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>全部词库 ({decks.length})</span>
          <span>点击直接开始，点击「范围」可细分标签</span>
        </div>

        <div className="space-y-2.5">
          {decks.map((d) => {
            const cardCount = cardCounts[d.id] ?? 0;
            const dueCount = dueMap[d.id] ?? 0;
            return (
              <Card
                key={d.id}
                className="transition-all hover:border-primary/50 hover:shadow-xs group"
              >
                <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                  {/* 左侧：点击打开范围设置弹窗 */}
                  <div
                    onClick={() => onOpenScope({ id: d.id, name: d.name })}
                    className="min-w-0 flex-1 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors truncate">
                        {d.name}
                      </span>
                      {dueCount > 0 && (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] shrink-0 px-1.5 py-0">
                          {dueCount} 到期
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{cardCount} 张卡片</span>
                      <span>·</span>
                      <span>每日新卡 {d.new_cards_per_day}</span>
                    </div>
                  </div>

                  {/* 右侧操作按钮 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenScope({ id: d.id, name: d.name })}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      title="选择学习标签范围与偏好"
                    >
                      <SlidersHorizontal className="size-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">范围</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onStartStudy(d.id)}
                      className="h-8 px-3 text-xs"
                    >
                      <RefreshCw className="size-3 mr-1" />
                      开始
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
