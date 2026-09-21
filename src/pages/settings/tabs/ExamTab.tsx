import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
import {
  clearAIStudyPlan,
  generateAIStudyPlan,
  getExamConfig,
  getSavedAIStudyPlan,
  saveAIStudyPlan,
  saveExamConfig,
  formatCompactList,
} from "@/lib/exam-planner";
import ExamPlanDialog from "@/components/study/ExamPlanDialog";
import MarkdownView from "@/components/common/MarkdownView";

interface ExamTabProps {
  onSaved?: () => void;
}

export default function ExamTab({ onSaved }: ExamTabProps) {
  const dbReady = useDbStore((s) => s.ready);
  const decks = useDeckStore((s) => s.decks);
  const cardCounts = useDeckStore((s) => s.cardCounts);

  const [examTitle, setExamTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examDeckIds, setExamDeckIds] = useState<number[]>([]);
  const [examIgnoredTags, setExamIgnoredTags] = useState<string[]>([]);
  const [examTargetStability, setExamTargetStability] = useState<number>(7);
  const [examAiPlan, setExamAiPlan] = useState("");
  const [examPlanning, setExamPlanning] = useState(false);
  const [examPlanMsg, setExamPlanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [examPlanDialogOpen, setExamPlanDialogOpen] = useState(false);

  const loadExamSettings = useCallback(async () => {
    if (!dbReady) return;
    const [examCfg, examPlan] = await Promise.all([
      getExamConfig(),
      getSavedAIStudyPlan(),
    ]);
    setExamTitle(examCfg.title ?? "");
    setExamDate(examCfg.date ?? "");
    setExamDeckIds(examCfg.deckIds ?? []);
    setExamIgnoredTags(examCfg.ignoredTags ?? []);
    setExamTargetStability(examCfg.targetStability ?? 7);
    setExamAiPlan(examPlan);
  }, [dbReady]);

  useEffect(() => {
    void loadExamSettings();
  }, [loadExamSettings]);

  const toggleExamDeck = (id: number) => {
    setExamDeckIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveExamPlanning = async () => {
    if (!dbReady) return;
    if (!examDate) {
      setExamPlanMsg({ ok: false, text: "请先选择考试日期" });
      return;
    }
    await saveExamConfig({
      title: examTitle,
      date: examDate,
      deckIds: examDeckIds,
      ignoredTags: examIgnoredTags,
      targetStability: examTargetStability,
    });
    setExamPlanMsg({ ok: true, text: "考试规划已保存，主页倒计时与任务编排已更新" });
    onSaved?.();
  };

  const handleGenerateAIExamPlan = async () => {
    if (!dbReady) return;
    if (!examDate) {
      setExamPlanMsg({ ok: false, text: "请先选择考试日期" });
      return;
    }
    setExamPlanning(true);
    setExamPlanMsg(null);
    try {
      const plan = await generateAIStudyPlan(
        {
          title: examTitle,
          date: examDate,
          deckIds: examDeckIds,
          ignoredTags: examIgnoredTags,
          targetStability: examTargetStability,
        },
        decks
      );
      setExamAiPlan(plan);
      await saveAIStudyPlan(plan);
      setExamPlanMsg({ ok: true, text: "AI 学习计划已生成并保存" });
    } catch (e) {
      setExamPlanMsg({ ok: false, text: String(e) });
    } finally {
      setExamPlanning(false);
    }
  };

  const handleClearAIExamPlan = async () => {
    setExamAiPlan("");
    if (!dbReady) return;
    await clearAIStudyPlan();
    setExamPlanMsg({ ok: true, text: "AI 学习计划已清除" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            考试规划与倒计时
          </CardTitle>
          <CardDescription>
            设置考试日期与目标词库，主页同步显示倒计时与建议每日新学量
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <Sparkles className="size-4" />
                AI 辅助学习任务编排与标签过滤
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                可视化多选学习词库、智能排除忽略标签、设定目标熟练度（当前设定：{examTargetStability > 0 ? `稳定性 >= ${examTargetStability} 天` : "学完即可"}），科学预留考前复习冲刺期。
              </p>
            </div>
            <Button size="sm" onClick={() => setExamPlanDialogOpen(true)} className="gap-1.5">
              <Sparkles className="size-3.5" />
              打开编排配置面板
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-title">考试 / 备考名称</Label>
            <Input
              id="exam-title"
              className="w-full sm:w-80"
              placeholder="例如：大学英语六级、考研英语、雅思核心"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-date">考试日期</Label>
            <Input
              id="exam-date"
              type="date"
              className="w-full sm:w-60"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              系统会自动根据所选词库剩余新卡与剩余天数，在仪表盘动态推荐每日学量
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>目标词库（不选 = 全部词库）</Label>
              {examDeckIds.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  已选 {examDeckIds.length} 个词库
                </span>
              )}
            </div>
            {examDeckIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                已选：{formatCompactList(decks.filter((d) => examDeckIds.includes(d.id)).map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name)), 3).compactText}
              </p>
            )}
            {decks.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无词库，请先创建词库</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {decks.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={examDeckIds.includes(d.id)}
                      onChange={() => toggleExamDeck(d.id)}
                    />
                    <span className="min-w-0 truncate">
                      {d.folder ? `${d.folder}/${d.name}` : d.name}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {cardCounts?.[d.id] ?? 0} 张
                    </span>
                  </label>
                ))}
              </div>
            )}
            {decks.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setExamDeckIds(decks.map((d) => d.id))}>
                  全选
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExamDeckIds([])}>
                  清空
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={saveExamPlanning} disabled={!dbReady || !examDate}>
              保存考试规划
            </Button>
            <Button
              variant="outline"
              onClick={handleGenerateAIExamPlan}
              disabled={examPlanning || !dbReady || !examDate}
            >
              {examPlanning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {examPlanning ? "AI 规划中…" : "AI 生成分阶段学习计划"}
            </Button>
            {examAiPlan && (
              <Button size="sm" variant="ghost" onClick={handleClearAIExamPlan}>
                清除计划
              </Button>
            )}
          </div>

          {examPlanMsg && (
            <p className={examPlanMsg.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
              {examPlanMsg.text}
            </p>
          )}

          {examAiPlan && (
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="mb-2 text-sm font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                AI 备考阶段计划
              </p>
              <MarkdownView content={examAiPlan} className="text-sm" />
            </div>
          )}
        </CardContent>
      </Card>

      <ExamPlanDialog
        open={examPlanDialogOpen}
        onOpenChange={setExamPlanDialogOpen}
        onSaved={loadExamSettings}
      />
    </div>
  );
}
