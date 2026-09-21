import { Sparkles, Loader2, Target, BookOpen, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCompactList } from "@/lib/exam-planner";
import type { Deck } from "@/types";
import type { PreviewStats } from "./types";

interface ExamStatsPreviewProps {
  previewStats: PreviewStats | null;
  calculatingPreview: boolean;
  targetStability: number;
  daysUntil: number;
  selectedDeckIds: number[];
  decks: Deck[];
  ignoredTags: string[];
}

export default function ExamStatsPreview({
  previewStats,
  calculatingPreview,
  targetStability,
  daysUntil,
  selectedDeckIds,
  decks,
  ignoredTags,
}: ExamStatsPreviewProps) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Sparkles className="size-3.5" />
          今日编排任务预览
        </span>
        {calculatingPreview && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> 计算中…
          </span>
        )}
      </div>

      {/* 熟练度全景与冲刺期状态卡 */}
      {previewStats && (
        <div className="rounded-lg bg-background/90 border p-2.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground flex items-center gap-1">
              <Target className="size-3.5 text-primary" />
              范围熟练度全景
            </span>
            <Badge variant="outline" className="text-[10px] h-4">
              {targetStability > 0
                ? `目标: 稳定 >= ${targetStability} 天`
                : "目标: 学完即可"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 text-muted-foreground text-[11px]">
            <span>
              已学词汇平均稳定性:{" "}
              <strong className="text-foreground">
                {previewStats.avgStability}
              </strong>{" "}
              天
            </span>
            <span>
              目标达成率:{" "}
              <strong className="text-primary">
                {previewStats.masteryRate}%
              </strong>{" "}
              (已掌握 {previewStats.mastered} / 学习中 {previewStats.learning} / 弱词 {previewStats.weak} / 未学 {previewStats.remainingNew})
            </span>
          </div>

          {/* 多段进度条 */}
          {previewStats.total > 0 && (
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{
                  width: `${(previewStats.mastered / previewStats.total) * 100}%`,
                }}
                title={`已掌握: ${previewStats.mastered} 词`}
              />
              <div
                className="bg-blue-500 h-full transition-all"
                style={{
                  width: `${(previewStats.learning / previewStats.total) * 100}%`,
                }}
                title={`学习中: ${previewStats.learning} 词`}
              />
              <div
                className="bg-amber-500 h-full transition-all"
                style={{
                  width: `${(previewStats.weak / previewStats.total) * 100}%`,
                }}
                title={`弱词: ${previewStats.weak} 词`}
              />
              <div
                className="bg-slate-300 dark:bg-slate-700 h-full transition-all"
                style={{
                  width: `${(previewStats.remainingNew / previewStats.total) * 100}%`,
                }}
                title={`未学: ${previewStats.remainingNew} 词`}
              />
            </div>
          )}

          {/* 冲刺阶段或攻坚期提示 */}
          {previewStats.inSprintPhase ? (
            <div className="rounded bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-1 text-[11px] font-medium flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
              当前已处于考前冲刺期（预留 {previewStats.sprintBufferDays} 天冲刺）：新词已自动置 0，专注复习与弱词冲刺，力保考前跨越熟练度门槛！
            </div>
          ) : targetStability > 0 && daysUntil > 0 ? (
            <div className="text-[11px] text-muted-foreground">
              当前处于新词攻坚期：将在考前第 {previewStats.sprintBufferDays} 天前学完全部新词，随后进入全量复习冲刺。
            </div>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
        <div className="rounded-md bg-background/80 p-2.5 shadow-xs">
          <div className="text-xl font-bold text-primary">
            {previewStats?.recommendedDailyNew ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {previewStats?.inSprintPhase ? "新学 (冲刺暂停)" : "今日新学目标"}
          </div>
        </div>
        <div className="rounded-md bg-background/80 p-2.5 shadow-xs">
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
            {previewStats?.dueToday ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground">今日到期复习</div>
        </div>
        <div className="rounded-md bg-background/80 p-2.5 shadow-xs">
          <div className="text-xl font-bold text-foreground">
            {previewStats?.remainingNew ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground">范围内待学新词</div>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground pt-1.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-primary/10">
        <span className="flex items-center gap-1">
          <BookOpen className="size-3 text-blue-500 shrink-0" />
          目标词库：
          {selectedDeckIds.length === 0
            ? "全部词库"
            : formatCompactList(
                decks
                  .filter((d) => selectedDeckIds.includes(d.id))
                  .map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name)),
                2
              ).compactText}
        </span>
        {ignoredTags.length > 0 && (
          <span className="flex items-center gap-1">
            <Tag className="size-3 text-amber-500 shrink-0" />
            排除规则：{formatCompactList(ignoredTags, 2).compactText}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground text-center pt-0.5">
        点击开始后，系统将自动汇聚所选词库卡片并排除设定标签，生成交错学习队列。
      </p>
    </div>
  );
}
