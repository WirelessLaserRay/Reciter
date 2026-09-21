import {
  GraduationCap,
  BookOpen,
  Tag,
  Settings2,
  Target,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MarkdownView from "@/components/common/MarkdownView";
import { formatCompactList, type TodayOrchestratedPlan } from "@/lib/exam-planner";

interface DashboardOrchestratedCardProps {
  orchestratedPlan: TodayOrchestratedPlan | null;
  aiPlan: string;
  adviceLoading: boolean;
  adviceError: string | null;
  onOpenPlanDialog: () => void;
  onStartOrchestratedStudy: () => void;
  onGenerateAdvice: () => void;
}

export default function DashboardOrchestratedCard({
  orchestratedPlan,
  aiPlan,
  adviceLoading,
  adviceError,
  onOpenPlanDialog,
  onStartOrchestratedStudy,
  onGenerateAdvice,
}: DashboardOrchestratedCardProps) {
  if (!orchestratedPlan) {
    return (
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="size-5 text-primary" />
            AI 辅助学习任务编排
          </CardTitle>
          <CardDescription>
            设置目标考试日期（四六级、考研、雅思等）、选定词库与要忽略的标签（如已掌握标签），AI 将自动安排每日新学与复习，完成后送上专属鼓励语！
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <Button onClick={onOpenPlanDialog} className="gap-2">
            <Sparkles className="size-4" />
            开启 AI 备考任务编排
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-500/40 bg-gradient-to-br from-blue-500/5 via-background to-primary/5 shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <GraduationCap className="size-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-lg font-bold">
              {orchestratedPlan.examTitle} · 倒计时 {orchestratedPlan.daysUntilExam} 天
            </CardTitle>
            <Badge
              variant="outline"
              className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400"
            >
              目标日期 {orchestratedPlan.examDate}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              平均稳定 {orchestratedPlan.avgStability} 天 · 掌握率{" "}
              {orchestratedPlan.masteryRate}%
            </Badge>
            {orchestratedPlan.inSprintPhase && (
              <Badge
                variant="secondary"
                className="text-xs bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
              >
                冲刺期 (新词暂停)
              </Badge>
            )}
          </div>
          {/* 优雅紧凑列写：目标词库与排除标签 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-xs">
            {/* 目标词库 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground flex items-center gap-1">
                <BookOpen className="size-3 text-blue-500 shrink-0" />
                目标词库:
              </span>
              {orchestratedPlan.deckIds.length === 0 ? (
                <Badge
                  variant="secondary"
                  className="px-2 py-0.5 text-xs font-normal bg-blue-500/10 text-blue-700 dark:text-blue-300"
                >
                  全部词库
                </Badge>
              ) : (
                (() => {
                  const deckList = orchestratedPlan.selectedDeckNames?.length
                    ? orchestratedPlan.selectedDeckNames
                    : orchestratedPlan.deckNames.split("、").filter(Boolean);
                  const deckSummary = formatCompactList(deckList, 2);
                  return (
                    <>
                      {deckSummary.displayed.map((name) => (
                        <Badge
                          key={name}
                          variant="outline"
                          className="px-2 py-0.5 text-xs font-normal max-w-[160px] truncate bg-background/70 border-blue-500/30"
                          title={name}
                        >
                          {name}
                        </Badge>
                      ))}
                      {deckSummary.remainingCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="px-2 py-0.5 text-xs font-normal text-muted-foreground cursor-help hover:bg-muted"
                          title={`全部 ${deckSummary.totalCount} 个目标词库：\n${deckSummary.fullText}`}
                        >
                          ……等 {deckSummary.totalCount} 个词库
                        </Badge>
                      )}
                    </>
                  );
                })()
              )}
            </div>

            {/* 排除标签 */}
            {orchestratedPlan.ignoredTags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Tag className="size-3 text-amber-500 shrink-0" />
                  排除标签:
                </span>
                {(() => {
                  const tagSummary = formatCompactList(
                    orchestratedPlan.ignoredTags,
                    2
                  );
                  return (
                    <>
                      {tagSummary.displayed.map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="px-2 py-0.5 text-xs font-normal border-destructive/30 bg-destructive/10 text-destructive max-w-[130px] truncate"
                          title={t}
                        >
                          {t}
                        </Badge>
                      ))}
                      {tagSummary.remainingCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="px-2 py-0.5 text-xs font-normal border-destructive/20 bg-destructive/15 text-destructive/90 cursor-help hover:bg-destructive/20"
                          title={`全部 ${tagSummary.totalCount} 个排除规则：\n${tagSummary.fullText}`}
                        >
                          ……等 {tagSummary.totalCount} 条规则
                        </Badge>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onOpenPlanDialog}
          className="shrink-0 text-xs gap-1.5"
        >
          <Settings2 className="size-3.5" />
          调整编排
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 熟练度全景进度与阶段提示 */}
        <div className="rounded-lg bg-background/80 border p-3 shadow-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Target className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span>词汇熟练度全景</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-normal"
              >
                {orchestratedPlan.targetStability > 0
                  ? `目标: 稳定 >= ${orchestratedPlan.targetStability} 天`
                  : "目标: 学完即可"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>
                平均稳定性:{" "}
                <strong className="text-foreground">
                  {orchestratedPlan.avgStability}
                </strong>{" "}
                天
              </span>
              <span>
                掌握率:{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {orchestratedPlan.masteryRate}%
                </strong>
              </span>
            </div>
          </div>

          {/* 多段掌握度进度条 */}
          {orchestratedPlan.totalCards > 0 && (
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{
                    width: `${(orchestratedPlan.masteredCount / orchestratedPlan.totalCards) * 100}%`,
                  }}
                  title={`已掌握: ${orchestratedPlan.masteredCount} 词`}
                />
                <div
                  className="bg-blue-500 h-full transition-all"
                  style={{
                    width: `${(orchestratedPlan.learningCount / orchestratedPlan.totalCards) * 100}%`,
                  }}
                  title={`学习中: ${orchestratedPlan.learningCount} 词`}
                />
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{
                    width: `${(orchestratedPlan.weakCount / orchestratedPlan.totalCards) * 100}%`,
                  }}
                  title={`弱词: ${orchestratedPlan.weakCount} 词`}
                />
                <div
                  className="bg-slate-300 dark:bg-slate-700 h-full transition-all"
                  style={{
                    width: `${(orchestratedPlan.remainingNew / orchestratedPlan.totalCards) * 100}%`,
                  }}
                  title={`未学: ${orchestratedPlan.remainingNew} 词`}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                  已掌握 {orchestratedPlan.masteredCount}
                </span>
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <span className="size-1.5 rounded-full bg-blue-500 inline-block" />
                  学习中 {orchestratedPlan.learningCount}
                </span>
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-500 inline-block" />
                  弱词 {orchestratedPlan.weakCount}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-slate-400 inline-block" />
                  未学 {orchestratedPlan.remainingNew}
                </span>
              </div>
            </div>
          )}

          {/* 冲刺阶段状态条 */}
          {orchestratedPlan.inSprintPhase ? (
            <div className="rounded bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 px-2.5 py-1 text-xs font-medium flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>
                  考前冲刺固化期：每日新词已自动暂停，全力冲刺已学词汇熟练度达标！
                </span>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/30"
              >
                冲刺缓冲余 {orchestratedPlan.daysUntilExam} 天
              </Badge>
            </div>
          ) : orchestratedPlan.targetStability > 0 &&
            orchestratedPlan.daysUntilExam > 0 ? (
            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>
                新词稳步攻坚中：按当前节奏将在考前预留的{" "}
                {orchestratedPlan.sprintBufferDays} 天冲刺期前学完全部新词。
              </span>
              <span>
                距冲刺期余{" "}
                {Math.max(
                  0,
                  orchestratedPlan.daysUntilExam -
                    orchestratedPlan.sprintBufferDays
                )}{" "}
                天
              </span>
            </div>
          ) : null}
        </div>

        {/* 今日编排目标 4 格看板 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
          <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
            <div className="text-2xl font-bold text-primary">
              {orchestratedPlan.targetNew}
            </div>
            <div className="text-xs text-muted-foreground">
              {orchestratedPlan.inSprintPhase
                ? "新学 (冲刺暂停)"
                : orchestratedPlan.learnedNewToday > 0
                  ? `待新学 (已学 ${orchestratedPlan.learnedNewToday})`
                  : "今日新学目标"}
            </div>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {orchestratedPlan.targetReview}
            </div>
            <div className="text-xs text-muted-foreground">
              {orchestratedPlan.reviewedToday > 0
                ? `待复习 (已复习 ${orchestratedPlan.reviewedToday})`
                : "今日到期复习"}
            </div>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
            <div className="text-2xl font-bold text-foreground">
              {orchestratedPlan.totalTarget}
            </div>
            <div className="text-xs text-muted-foreground">今日待学总量</div>
          </div>
          <div className="rounded-lg bg-background/80 border p-2.5 shadow-xs">
            <div className="text-2xl font-bold text-muted-foreground">
              {orchestratedPlan.remainingNew}
            </div>
            <div className="text-xs text-muted-foreground">词库剩余新词</div>
          </div>
        </div>

        {/* AI 今日行动指南与学情评价 */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              AI 备考规划与学情评价
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 font-normal"
              >
                {orchestratedPlan.aiGenerated ? "AI 深度评估" : "学情智能速评"}
              </Badge>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={onGenerateAdvice}
              disabled={adviceLoading}
              className="h-6 px-2 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-500/10"
            >
              <RefreshCw
                className={
                  adviceLoading
                    ? "size-3 animate-spin mr-1"
                    : "size-3 mr-1"
                }
              />
              {adviceLoading ? "评估生成中…" : "重新评价与规划"}
            </Button>
          </div>
          <div className="rounded-lg bg-background/80 border border-blue-500/15 p-3.5 shadow-xs">
            <MarkdownView
              content={orchestratedPlan.advice}
              className="text-xs leading-relaxed text-foreground"
            />
          </div>
          {adviceError && (
            <p className="text-[11px] text-destructive">{adviceError}</p>
          )}
        </div>

        {/* 今日完成状态与鼓励语 或 启动学习按钮 */}
        {orchestratedPlan.isCompleted ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold text-sm">
                <CheckCircle2 className="size-4 text-green-600" />
                今日编排任务已达成！
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onStartOrchestratedStudy}
                className="text-xs"
              >
                <PlayCircle className="size-3.5 mr-1" />
                再次复习巩固
              </Button>
            </div>
            {orchestratedPlan.encouragement && (
              <p className="text-xs text-foreground/90 italic pt-1">
                “{orchestratedPlan.encouragement}”
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              系统将自动汇总选定词库并剔除排除标签，交错调度复习与新卡。
            </p>
            <Button
              size="default"
              onClick={onStartOrchestratedStudy}
              disabled={orchestratedPlan.totalTarget === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto"
            >
              <Sparkles className="size-4" />
              开始今日 AI 编排任务 ({orchestratedPlan.totalTarget} 词)
            </Button>
          </div>
        )}

        {/* 宏观分阶段计划（若有） */}
        {aiPlan && (
          <details className="text-xs text-muted-foreground group">
            <summary className="cursor-pointer font-medium hover:text-foreground list-none flex items-center gap-1">
              <span>▸ 查看 AI 分阶段宏观备考规划</span>
            </summary>
            <div className="mt-2 rounded-md bg-muted/40 p-3.5 text-xs text-foreground">
              <MarkdownView content={aiPlan} className="text-xs" />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
