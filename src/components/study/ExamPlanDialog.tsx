import { useEffect, useState, useMemo } from "react";
import {
  Sparkles,
  Check,
  GraduationCap,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { parseDayStartHour, getDayEndDate } from "@/lib/day";
import {
  getExamConfig,
  saveExamConfig,
  getDaysUntilExam,
  generateAIStudyPlan,
  saveAIStudyPlan,
  getSavedAIStudyPlan,
  type ExamConfig,
} from "@/lib/exam-planner";
import { useDeckStore } from "@/stores/useDeckStore";
import {
  type ExamPlanDialogProps,
  type PreviewStats,
  ExamBasicFields,
  ExamDeckSelector,
  ExamIgnoredTags,
  ExamStabilitySettings,
  ExamStatsPreview,
  ExamAiPlanSection,
} from "./exam-plan";

export default function ExamPlanDialog({
  open,
  onOpenChange,
  onSaved,
}: ExamPlanDialogProps) {
  const { decks, cardCounts } = useDeckStore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[]>([]);
  const [ignoredTags, setIgnoredTags] = useState<string[]>([]);
  const [showAllIgnored, setShowAllIgnored] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [overrideDailyNew, setOverrideDailyNew] = useState<string>("");
  const [useManualNew, setUseManualNew] = useState(false);
  const [targetStability, setTargetStability] = useState<number>(7);
  const [isCustomStability, setIsCustomStability] = useState(false);
  const [customStabilityInput, setCustomStabilityInput] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedMacroPlan, setSavedMacroPlan] = useState<string>("");

  // 实时预览统计数据
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [calculatingPreview, setCalculatingPreview] = useState(false);

  // 初始化加载已有配置
  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setLoading(true);
    (async () => {
      try {
        const [cfg, allTags, macroPlan] = await Promise.all([
          getExamConfig(),
          db.getAllTags(),
          getSavedAIStudyPlan(),
        ]);
        setTitle(cfg.title || "");
        setDate(cfg.date || "");
        setSelectedDeckIds(cfg.deckIds || []);
        setIgnoredTags(cfg.ignoredTags || []);
        setAvailableTags(allTags || []);
        setSavedMacroPlan(macroPlan || "");

        const stab = cfg.targetStability ?? 7;
        setTargetStability(stab);
        if (![0, 7, 14, 30].includes(stab)) {
          setIsCustomStability(true);
          setCustomStabilityInput(String(stab));
        } else {
          setIsCustomStability(false);
          setCustomStabilityInput("");
        }

        if (cfg.dailyNewOverride && cfg.dailyNewOverride > 0) {
          setUseManualNew(true);
          setOverrideDailyNew(String(cfg.dailyNewOverride));
        } else {
          setUseManualNew(false);
          setOverrideDailyNew("");
        }
      } catch (err) {
        setMsg({ ok: false, text: `加载配置失败: ${String(err)}` });
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  // 当选择词库变化时，动态更新可选标签
  useEffect(() => {
    if (!open) return;
    db.getAllTags(selectedDeckIds.length > 0 ? selectedDeckIds : undefined)
      .then((tags) => setAvailableTags(tags))
      .catch(() => {});
  }, [selectedDeckIds, open]);

  // 实时重新计算预览配额
  const daysUntil = useMemo(() => (date ? getDaysUntilExam(date) : 0), [date]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCalculatingPreview(true);

    const timer = setTimeout(async () => {
      try {
        const now = new Date();
        const hour = parseDayStartHour(await db.getSetting("day_start"));
        const dayEnd = getDayEndDate(hour, now);
        const [fresh, due, mastery] = await Promise.all([
          db.getNewCountByDecks(selectedDeckIds, ignoredTags),
          db.getDueCountByDecks(selectedDeckIds, dayEnd.toISOString(), ignoredTags),
          db.getMultiDeckMasteryStats(selectedDeckIds, ignoredTags, targetStability),
        ]);
        if (!active) return;

        const sprintBufferDays = targetStability > 0 ? Math.min(targetStability, 21) : 0;
        const effectiveBuffer = Math.min(
          sprintBufferDays,
          Math.max(0, Math.floor(daysUntil * 0.4))
        );
        const effectiveDays = Math.max(1, daysUntil - effectiveBuffer);
        const inSprintPhase =
          targetStability > 0 && daysUntil > 0 && daysUntil <= effectiveBuffer;

        let dailyNew = 0;
        if (fresh > 0) {
          if (useManualNew && overrideDailyNew) {
            dailyNew = Math.min(fresh, parseInt(overrideDailyNew, 10) || 0);
          } else if (inSprintPhase) {
            dailyNew = 0;
          } else if (daysUntil > 0) {
            dailyNew = Math.min(fresh, Math.max(5, Math.ceil(fresh / effectiveDays)));
          } else {
            dailyNew = Math.min(fresh, 20);
          }
        }

        setPreviewStats({
          remainingNew: fresh,
          dueToday: due,
          recommendedDailyNew: dailyNew,
          avgStability: mastery.avgStability,
          masteryRate: mastery.masteryRate,
          mastered: mastery.mastered,
          learning: mastery.learning,
          weak: mastery.weak,
          total: mastery.total,
          inSprintPhase,
          sprintBufferDays: effectiveBuffer,
        });
      } catch {
        // 忽略即时计算错误
      } finally {
        if (active) setCalculatingPreview(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    open,
    selectedDeckIds,
    ignoredTags,
    date,
    daysUntil,
    useManualNew,
    overrideDailyNew,
    targetStability,
  ]);

  const toggleDeck = (id: number) => {
    setSelectedDeckIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleIgnoredTag = (tag: string) => {
    setIgnoredTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    if (!ignoredTags.includes(trimmed)) {
      setIgnoredTags((prev) => [...prev, trimmed]);
    }
    if (!availableTags.includes(trimmed)) {
      setAvailableTags((prev) => [...prev, trimmed]);
    }
    setCustomTagInput("");
  };

  const handleSave = async () => {
    if (!date) {
      setMsg({ ok: false, text: "请选择目标考试日期" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const dailyOverride =
        useManualNew && overrideDailyNew ? parseInt(overrideDailyNew, 10) : null;
      const config: ExamConfig = {
        title: title.trim() || "备考任务",
        date,
        deckIds: selectedDeckIds,
        ignoredTags,
        dailyNewOverride:
          Number.isFinite(dailyOverride) && (dailyOverride ?? 0) > 0
            ? dailyOverride
            : null,
        targetStability: targetStability >= 0 ? targetStability : 0,
      };
      await saveExamConfig(config);
      setMsg({ ok: true, text: "备考编排已成功保存！" });
      onSaved?.();
      setTimeout(() => {
        onOpenChange(false);
      }, 500);
    } catch (err) {
      setMsg({ ok: false, text: `保存失败: ${String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!date) {
      setMsg({ ok: false, text: "请先选择考试日期" });
      return;
    }
    setGeneratingAI(true);
    setMsg(null);
    try {
      const dailyOverride =
        useManualNew && overrideDailyNew ? parseInt(overrideDailyNew, 10) : null;
      const config: ExamConfig = {
        title: title.trim() || "备考任务",
        date,
        deckIds: selectedDeckIds,
        ignoredTags,
        dailyNewOverride:
          Number.isFinite(dailyOverride) && (dailyOverride ?? 0) > 0
            ? dailyOverride
            : null,
        targetStability: targetStability >= 0 ? targetStability : 0,
      };
      await saveExamConfig(config);
      const plan = await generateAIStudyPlan(config, decks);
      await saveAIStudyPlan(plan);
      setSavedMacroPlan(plan);
      setMsg({ ok: true, text: "AI 学习计划已生成并保存！" });
      onSaved?.();
    } catch (err) {
      setMsg({ ok: false, text: `生成失败: ${String(err)}` });
    } finally {
      setGeneratingAI(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <GraduationCap className="size-5 text-primary" />
            AI 辅助学习任务编排
          </DialogTitle>
          <DialogDescription>
            自动结合目标考试时间、目标词库与忽略标签，科学计算每日学习配额与行动指南。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-5">
            <ExamBasicFields
              title={title}
              setTitle={setTitle}
              date={date}
              setDate={setDate}
              daysUntil={daysUntil}
            />

            <ExamDeckSelector
              decks={decks}
              cardCounts={cardCounts}
              selectedDeckIds={selectedDeckIds}
              setSelectedDeckIds={setSelectedDeckIds}
              toggleDeck={toggleDeck}
            />

            <ExamIgnoredTags
              ignoredTags={ignoredTags}
              setIgnoredTags={setIgnoredTags}
              availableTags={availableTags}
              toggleIgnoredTag={toggleIgnoredTag}
              customTagInput={customTagInput}
              setCustomTagInput={setCustomTagInput}
              addCustomTag={addCustomTag}
              showAllIgnored={showAllIgnored}
              setShowAllIgnored={setShowAllIgnored}
            />

            <ExamStabilitySettings
              targetStability={targetStability}
              setTargetStability={setTargetStability}
              isCustomStability={isCustomStability}
              setIsCustomStability={setIsCustomStability}
              customStabilityInput={customStabilityInput}
              setCustomStabilityInput={setCustomStabilityInput}
              previewStats={previewStats}
              useManualNew={useManualNew}
              setUseManualNew={setUseManualNew}
              overrideDailyNew={overrideDailyNew}
              setOverrideDailyNew={setOverrideDailyNew}
              daysUntil={daysUntil}
            />

            <ExamStatsPreview
              previewStats={previewStats}
              calculatingPreview={calculatingPreview}
              targetStability={targetStability}
              daysUntil={daysUntil}
              selectedDeckIds={selectedDeckIds}
              decks={decks}
              ignoredTags={ignoredTags}
            />

            <ExamAiPlanSection
              savedMacroPlan={savedMacroPlan}
              generatingAI={generatingAI}
            />

            {msg && (
              <div
                className={`rounded-md p-3 text-xs flex items-center gap-2 ${
                  msg.ok
                    ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
                    : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
                }`}
              >
                {msg.ok ? (
                  <Check className="size-4 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 shrink-0" />
                )}
                <span>{msg.text}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 pt-3 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateAI}
            disabled={loading || saving || generatingAI || !date}
            className="text-xs"
          >
            {generatingAI ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5 mr-1.5 text-primary" />
            )}
            {generatingAI ? "AI 生成中…" : "AI 生成分阶段宏观计划"}
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving || generatingAI}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || generatingAI || !date}
            >
              {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              保存编排
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
