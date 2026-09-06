import { useEffect, useState, useMemo } from "react";
import {
  Sparkles,
  Check,
  Plus,
  X,
  BookOpen,
  Tag,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import {
  getExamConfig,
  saveExamConfig,
  getDaysUntilExam,
  generateAIStudyPlan,
  saveAIStudyPlan,
  getSavedAIStudyPlan,
  formatCompactList,
  type ExamConfig,
} from "@/lib/exam-planner";
import { useDeckStore } from "@/stores/useDeckStore";
import { matchTagPattern } from "@/lib/tag-filter";
import MarkdownView from "@/components/common/MarkdownView";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const QUICK_EXAM_PRESETS = [
  "大学英语四级 (CET-4)",
  "大学英语六级 (CET-6)",
  "考研英语",
  "雅思 (IELTS)",
  "托福 (TOEFL)",
  "GRE",
  "高考英语",
];

export default function ExamPlanDialog({ open, onOpenChange, onSaved }: Props) {
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

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedMacroPlan, setSavedMacroPlan] = useState<string>("");

  // 实时预览统计数据
  const [previewStats, setPreviewStats] = useState<{
    remainingNew: number;
    dueToday: number;
    recommendedDailyNew: number;
  } | null>(null);
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
        const [fresh, due] = await Promise.all([
          db.getNewCountByDecks(selectedDeckIds, ignoredTags),
          db.getDueCountByDecks(selectedDeckIds, now.toISOString(), ignoredTags),
        ]);
        if (!active) return;

        let dailyNew = 0;
        if (fresh > 0) {
          if (useManualNew && overrideDailyNew) {
            dailyNew = Math.min(fresh, parseInt(overrideDailyNew, 10) || 0);
          } else if (daysUntil > 0) {
            dailyNew = Math.min(fresh, Math.max(5, Math.ceil(fresh / daysUntil)));
          } else {
            dailyNew = Math.min(fresh, 20);
          }
        }

        setPreviewStats({
          remainingNew: fresh,
          dueToday: due,
          recommendedDailyNew: dailyNew,
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
  }, [open, selectedDeckIds, ignoredTags, date, daysUntil, useManualNew, overrideDailyNew]);

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
        dailyNewOverride: Number.isFinite(dailyOverride) && (dailyOverride ?? 0) > 0 ? dailyOverride : null,
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
        dailyNewOverride: Number.isFinite(dailyOverride) && (dailyOverride ?? 0) > 0 ? dailyOverride : null,
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
            {/* 1. 考试名称与快速填入 */}
            <div className="space-y-2">
              <Label htmlFor="exam-title" className="text-sm font-medium">
                考试 / 目标名称
              </Label>
              <Input
                id="exam-title"
                placeholder="例如：大学英语六级、考研英语、托福单词冲刺"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK_EXAM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTitle(preset)}
                    className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 考试日期与倒计时 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exam-date" className="text-sm font-medium">
                  考试目标日期 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="exam-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="flex items-end pb-1">
                {date ? (
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3.5 py-2 text-sm text-blue-700 dark:text-blue-300 w-full flex items-center justify-between">
                    <span className="font-medium">距离目标考试：</span>
                    <span className="font-bold text-lg">{daysUntil} 天</span>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground w-full">
                    请先选择考试日期以计算每日配额
                  </div>
                )}
              </div>
            </div>

            {/* 3. 词库选择 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <BookOpen className="size-4 text-primary" />
                  学习目标词库
                </Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDeckIds(decks.map((d) => d.id))}
                    className="text-xs text-primary hover:underline"
                  >
                    全选
                  </button>
                  <span className="text-muted-foreground/40 text-xs">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDeckIds([])}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    全部 (不限制)
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                支持勾选多个词库进行联合学习调度。若未勾选任何词库，则默认覆盖全部词库。
              </p>
              {selectedDeckIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                  <span className="text-muted-foreground">已选词库：</span>
                  {(() => {
                    const names = decks
                      .filter((d) => selectedDeckIds.includes(d.id))
                      .map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name));
                    const summary = formatCompactList(names, 3);
                    return (
                      <>
                        {summary.displayed.map((n) => (
                          <Badge
                            key={n}
                            variant="secondary"
                            className="px-2 py-0.5 text-xs font-normal max-w-[150px] truncate bg-primary/10 text-primary border border-primary/20"
                          >
                            {n}
                          </Badge>
                        ))}
                        {summary.remainingCount > 0 && (
                          <Badge
                            variant="outline"
                            className="px-2 py-0.5 text-xs font-normal text-muted-foreground cursor-help hover:bg-muted"
                            title={`全部已选词库 (${summary.totalCount}个):\n${summary.fullText}`}
                          >
                            ……等共 {summary.totalCount} 个词库
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1 bg-background/50">
                {decks.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    暂无词库，请先创建或导入词库
                  </div>
                ) : (
                  decks.map((d) => {
                    const isSelected = selectedDeckIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-sm transition-colors ${
                          isSelected ? "bg-primary/10 font-medium" : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-gray-300 text-primary"
                            checked={isSelected}
                            onChange={() => toggleDeck(d.id)}
                          />
                          <span className="truncate">
                            {d.folder ? `${d.folder}/${d.name}` : d.name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {cardCounts?.[d.id] ?? 0} 词
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* 4. 要忽略的标签 (可多选排除) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Tag className="size-4 text-amber-500" />
                  要忽略/跳过的标签
                </Label>
                {ignoredTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIgnoredTags([])}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    清空已选
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                带有这些标签的单词将不会被安排到今日新学与到期复习中（如“已掌握”、“简单”等已熟悉的单词集合）。
              </p>

              {/* 现有标签芯片选择 */}
              {availableTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-md border bg-muted/20">
                  {availableTags.map((tag) => {
                    const isDirectlyIgnored = ignoredTags.includes(tag);
                    const isPatternIgnored = !isDirectlyIgnored && ignoredTags.some((p) => matchTagPattern(tag, p));
                    const isIgnored = isDirectlyIgnored || isPatternIgnored;
                    return (
                      <Badge
                        key={tag}
                        variant={isIgnored ? "destructive" : "outline"}
                        className="cursor-pointer select-none px-2.5 py-1 text-xs transition-all hover:scale-105"
                        onClick={() => toggleIgnoredTag(tag)}
                        title={isPatternIgnored ? "匹配已设定的模糊/正则规则" : undefined}
                      >
                        {isIgnored && <Check className="mr-1 inline size-3" />}
                        {tag}
                        {isPatternIgnored && (
                          <span className="ml-1 text-[10px] opacity-75">(规则匹配)</span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  当前词库中暂无可用标签，可在下方手动输入需要排除的标签名。
                </p>
              )}

              {/* 自定义添加忽略标签（支持模糊与正则） */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="输入标签名、通配符（如*四级*）或正则（如^CET[46]、简单|已学）"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomTag();
                      }
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addCustomTag}
                    disabled={!customTagInput.trim()}
                    className="h-8 shrink-0 text-xs"
                  >
                    <Plus className="size-3.5 mr-1" />
                    添加规则
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  支持关键词模糊匹配（如“简单”）、通配符（如“*四级*”）及正则表达式（如“^CET[46]”、“简单|已掌握”）。
                </p>
              </div>

              {/* 已选忽略标签清单展示 */}
              {ignoredTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">已排除规则：</span>
                  {(() => {
                    const isFolded = !showAllIgnored && ignoredTags.length > 6;
                    const displayed = isFolded ? ignoredTags.slice(0, 5) : ignoredTags;
                    return (
                      <>
                        {displayed.map((t) => {
                          const matchCount = availableTags.filter((tag) => matchTagPattern(tag, t)).length;
                          return (
                            <Badge
                              key={t}
                              variant="secondary"
                              className="gap-1 border-destructive/30 bg-destructive/10 text-destructive text-xs"
                              title={matchCount > 0 ? `匹配当前 ${matchCount} 个词库标签` : undefined}
                            >
                              {t}
                              {matchCount > 1 && (
                                <span className="ml-0.5 rounded-full bg-destructive/20 px-1 text-[10px] font-mono">
                                  {matchCount}
                                </span>
                              )}
                              <X
                                className="size-3 cursor-pointer hover:opacity-75"
                                onClick={() => toggleIgnoredTag(t)}
                              />
                            </Badge>
                          );
                        })}
                        {ignoredTags.length > 6 && (
                          <Badge
                            variant="outline"
                            className="cursor-pointer gap-1 text-xs border-dashed text-muted-foreground hover:bg-muted"
                            onClick={() => setShowAllIgnored(!showAllIgnored)}
                          >
                            {showAllIgnored ? "收起" : `……等共 ${ignoredTags.length} 条 (点击展开)`}
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 5. 每日新学目标安排方式 */}
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5">
              <Label className="text-sm font-medium">每日新学目标设定</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm">
                  <input
                    type="radio"
                    name="daily-mode"
                    checked={!useManualNew}
                    onChange={() => setUseManualNew(false)}
                  />
                  <span>
                    智能动态均摊：根据剩余新词量与剩余天数自动计算
                    {previewStats && previewStats.remainingNew > 0 && daysUntil > 0 && (
                      <span className="font-semibold text-primary ml-1">
                        (约 {previewStats.recommendedDailyNew} 词/天)
                      </span>
                    )}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm">
                  <input
                    type="radio"
                    name="daily-mode"
                    checked={useManualNew}
                    onChange={() => setUseManualNew(true)}
                  />
                  <span>手动固定每日新学词数</span>
                </label>
                {useManualNew && (
                  <div className="pl-6 pt-1 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      className="w-28 h-8 text-xs"
                      placeholder="如 30"
                      value={overrideDailyNew}
                      onChange={(e) => setOverrideDailyNew(e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">张卡片 / 天</span>
                  </div>
                )}
              </div>
            </div>

            {/* 6. 实时任务编排预览 */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
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
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-md bg-background/80 p-2.5 shadow-xs">
                  <div className="text-xl font-bold text-primary">
                    {previewStats?.recommendedDailyNew ?? 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground">今日新学目标</div>
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

            {/* 已生成的 AI 分阶段宏观规划 */}
            {savedMacroPlan && (
              <details className="rounded-xl border border-primary/25 bg-muted/20 p-3.5 text-xs group" open={generatingAI}>
                <summary className="cursor-pointer font-medium hover:text-foreground list-none flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-primary font-semibold">
                    <Sparkles className="size-3.5" />
                    AI 分阶段宏观备考规划
                  </span>
                  <span className="text-[11px] text-muted-foreground group-open:hidden">点击展开查看 ▸</span>
                  <span className="text-[11px] text-muted-foreground hidden group-open:inline">收起 ▾</span>
                </summary>
                <div className="mt-2.5 max-h-48 overflow-y-auto rounded-md bg-background/80 border p-3">
                  <MarkdownView content={savedMacroPlan} className="text-xs" />
                </div>
              </details>
            )}

            {/* 提示消息 */}
            {msg && (
              <div
                className={`rounded-md p-3 text-xs flex items-center gap-2 ${
                  msg.ok
                    ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
                    : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
                }`}
              >
                {msg.ok ? <Check className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
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
