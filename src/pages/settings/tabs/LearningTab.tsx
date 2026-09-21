import { useEffect, useState } from "react";
import { Brain, Sliders } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useDbStore } from "@/stores/useDbStore";
import { db } from "@/lib/db";
import { invalidateFSRS } from "@/lib/fsrs";
import { getEasyDaysConfig, saveEasyDaysConfig } from "@/lib/easy-days";
import {
  getActiveRecallEnabled,
  getIgnoredTags,
  getInterleaveRatio,
  getLearningSteps,
  getMaxSessionCards,
  getQuickTestMs,
  getRatingMode,
  getRestDurationMinutes,
  getSummaryInterval,
  saveActiveRecallEnabled,
  saveIgnoredTags,
  saveInterleaveRatio,
  saveLearningSteps,
  saveMaxSessionCards,
  saveQuickTestMs,
  saveRatingMode,
  saveRestDurationMinutes,
  saveSummaryInterval,
} from "@/lib/study-prefs";

interface LearningTabProps {
  onSaved?: () => void;
}

export default function LearningTab({ onSaved }: LearningTabProps) {
  const dbReady = useDbStore((s) => s.ready);

  const [retention, setRetention] = useState(0.9);
  const [dayStart, setDayStart] = useState("04:00");
  const [defaultNewPerDay, setDefaultNewPerDay] = useState(20);
  const [dailyReviewLimit, setDailyReviewLimit] = useState(200);
  const [ratingMode, setRatingMode] = useState<"3" | "4">("3");
  const [activeRecallEnabled, setActiveRecallEnabled] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState(10);
  const [interleaveRatio, setInterleaveRatio] = useState(5);
  const [quickTestSeconds, setQuickTestSeconds] = useState(5);
  const [maxSessionCards, setMaxSessionCards] = useState(100);
  const [restDurationMinutes, setRestDurationMinutes] = useState(15);
  const [learningSteps, setLearningSteps] = useState("1m,10m");
  const [leechThreshold, setLeechThreshold] = useState(3);
  const [ignoredTags, setIgnoredTags] = useState("");
  const [easyDaysEnabled, setEasyDaysEnabled] = useState(false);

  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [r, d, npd, rl, rm, ar, si, ir, qt, msc, rdm, ls, lt, ig, ed] =
        await Promise.all([
          db.getSetting("desired_retention"),
          db.getSetting("day_start"),
          db.getSetting("default_new_per_day"),
          db.getSetting("daily_review_limit"),
          getRatingMode(),
          getActiveRecallEnabled(),
          getSummaryInterval(),
          getInterleaveRatio(),
          getQuickTestMs(),
          getMaxSessionCards(),
          getRestDurationMinutes(),
          getLearningSteps(),
          db.getSetting("leech_threshold"),
          getIgnoredTags(),
          getEasyDaysConfig(),
        ]);

      const rv = r ? parseFloat(r) : 0.9;
      if (Number.isFinite(rv)) setRetention(Math.min(0.95, Math.max(0.8, rv)));
      setDayStart(d ?? "04:00");
      const np = npd ? parseInt(npd, 10) : 20;
      if (Number.isFinite(np) && np > 0) setDefaultNewPerDay(np);
      const rlN = rl ? parseInt(rl, 10) : 200;
      if (Number.isFinite(rlN) && rlN > 0) setDailyReviewLimit(rlN);
      setRatingMode(rm);
      setActiveRecallEnabled(ar);
      setSummaryInterval(si);
      setInterleaveRatio(ir);
      setQuickTestSeconds(Math.round(qt / 1000));
      setMaxSessionCards(msc);
      setRestDurationMinutes(rdm);
      setLearningSteps(ls);
      const ltN = lt ? parseInt(lt, 10) : 3;
      if (Number.isFinite(ltN) && ltN > 0) setLeechThreshold(ltN);
      setIgnoredTags(ig.join("\n"));
      setEasyDaysEnabled(ed.enabled);
    })().catch(() => {});
  }, [dbReady]);

  const saveRetention = async (v: number) => {
    setRetention(v);
    if (!dbReady) return;
    await db.setSetting("desired_retention", String(v));
    invalidateFSRS();
    onSaved?.();
  };

  const saveDayStart = async (v: string) => {
    setDayStart(v);
    if (!dbReady) return;
    await db.setSetting("day_start", v);
    onSaved?.();
  };

  const handleLearningStepsChange = async (v: string) => {
    setLearningSteps(v);
    if (!dbReady) return;
    await saveLearningSteps(v);
    invalidateFSRS();
    onSaved?.();
  };

  const saveNewPerDay = async (v: number) => {
    setDefaultNewPerDay(v);
    if (!dbReady || v <= 0) return;
    await db.setSetting("default_new_per_day", String(v));
    onSaved?.();
  };

  const saveReviewLimit = async (v: number) => {
    setDailyReviewLimit(v);
    if (!dbReady || v <= 0) return;
    await db.setSetting("daily_review_limit", String(v));
    onSaved?.();
  };

  const handleRatingModeChange = async (v: "3" | "4") => {
    setRatingMode(v);
    if (!dbReady) return;
    await saveRatingMode(v);
    onSaved?.();
  };

  const handleActiveRecallChange = async (v: boolean) => {
    setActiveRecallEnabled(v);
    if (!dbReady) return;
    await saveActiveRecallEnabled(v);
    onSaved?.();
  };

  const handleInterleaveRatioChange = async (v: number) => {
    setInterleaveRatio(v);
    if (!dbReady || v <= 0) return;
    await saveInterleaveRatio(v);
    onSaved?.();
  };

  const handleQuickTestSecondsChange = async (v: number) => {
    setQuickTestSeconds(v);
    if (!dbReady || v <= 0) return;
    await saveQuickTestMs(v * 1000);
    onSaved?.();
  };

  const handleSummaryIntervalChange = async (v: number) => {
    setSummaryInterval(v);
    if (!dbReady || v <= 0) return;
    await saveSummaryInterval(v);
    onSaved?.();
  };

  const saveLeechThreshold = async (v: number) => {
    setLeechThreshold(v);
    if (!dbReady || v <= 0) return;
    await db.setSetting("leech_threshold", String(v));
    onSaved?.();
  };

  const handleMaxSessionCardsChange = async (v: number) => {
    setMaxSessionCards(v);
    if (!dbReady || v <= 0) return;
    await saveMaxSessionCards(v);
    onSaved?.();
  };

  const handleRestDurationChange = async (v: number) => {
    setRestDurationMinutes(v);
    if (!dbReady || v <= 0) return;
    await saveRestDurationMinutes(v);
    onSaved?.();
  };

  const saveIgnoredTagsSetting = async (v: string) => {
    setIgnoredTags(v);
    if (!dbReady) return;
    const tags = v.includes("\n")
      ? v.split("\n").map((s) => s.trim()).filter(Boolean)
      : v.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean);
    await saveIgnoredTags(tags);
    onSaved?.();
  };

  const saveEasyDays = async (enabled: boolean) => {
    setEasyDaysEnabled(enabled);
    if (!dbReady) return;
    const cfg = await getEasyDaysConfig();
    cfg.enabled = enabled;
    if (enabled && cfg.weekdays[0] === 1 && cfg.weekdays[6] === 1) {
      cfg.weekdays[0] = 0.5;
      cfg.weekdays[6] = 0.5;
    }
    await saveEasyDaysConfig(cfg);
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      {/* 算法核心 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-4 text-primary" />
            FSRS 记忆算法核心
          </CardTitle>
          <CardDescription>基于现代自由时间间隔重复算法（FSRS-5），智能计算下一复习时刻</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>目标记忆率（desired retention）</Label>
              <span className="font-mono text-sm">{retention.toFixed(2)}</span>
            </div>
            <Slider
              min={0.8}
              max={0.95}
              step={0.01}
              value={[retention]}
              onValueChange={(v) => saveRetention(v[0])}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={retention === 0.9 ? "default" : "outline"} onClick={() => saveRetention(0.9)}>
                考研/考试 0.90
              </Button>
              <Button size="sm" variant={retention === 0.85 ? "default" : "outline"} onClick={() => saveRetention(0.85)}>
                日常阅读 0.85
              </Button>
              <Button size="sm" variant={retention === 0.8 ? "default" : "outline"} onClick={() => saveRetention(0.8)}>
                轻量维持 0.80
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              数值越高复习越频繁；考研建议 0.90，时间紧可降至 0.85。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="day-start">今日起始时间（新的一天起点）</Label>
            <Input
              id="day-start"
              type="time"
              className="w-40"
              value={dayStart}
              onChange={(e) => saveDayStart(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              默认 04:00（Anki 惯例），跨午夜学习仍计入前一天的连续天数。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="learning-steps">新卡学习步骤 (Learning Steps)</Label>
            <Input
              id="learning-steps"
              type="text"
              placeholder="1m,10m"
              className="w-60 font-mono"
              value={learningSteps}
              onChange={(e) => handleLearningStepsChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              新卡学习过程中的重复间隔（m=分钟/h=小时/d=天），建议 1m,10m。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 每日配额 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="size-4 text-primary" />
            每日配额与复习预算
          </CardTitle>
          <CardDescription>设定每日学习与复习上限，防过度疲劳与任务堆积</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="new-per-day">每日新卡上限（默认）</Label>
            <div className="flex items-center gap-2">
              <Input
                id="new-per-day"
                type="number"
                min={1}
                max={500}
                value={defaultNewPerDay}
                onChange={(e) => saveNewPerDay(parseInt(e.target.value, 10) || 0)}
              />
              <span className="shrink-0 text-sm text-muted-foreground">张/天</span>
            </div>
            <p className="text-xs text-muted-foreground">
              新词库默认配额，词库详情页可单独个性化覆盖。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-limit">每日复习上限</Label>
            <div className="flex items-center gap-2">
              <Input
                id="review-limit"
                type="number"
                min={1}
                max={2000}
                value={dailyReviewLimit}
                onChange={(e) => saveReviewLimit(parseInt(e.target.value, 10) || 0)}
              />
              <span className="shrink-0 text-sm text-muted-foreground">次/天</span>
            </div>
            <p className="text-xs text-muted-foreground">
              全局复习预算保护，超出部分安全顺延至次日。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 学习流交互 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-4 text-primary" />
            学习流与交互体验
          </CardTitle>
          <CardDescription>记忆卡片展示、评测模式与自适应选项</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>评分模式</Label>
              <p className="text-xs text-muted-foreground">
                三档（生疏 / 犹豫 / 记得）更直觉；四档保留 Anki 经典 Easy 选项
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">三档</span>
              <Switch
                checked={ratingMode === "4"}
                onCheckedChange={(v) => handleRatingModeChange(v ? "4" : "3")}
              />
              <span className="text-xs text-muted-foreground">四档</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>主动回忆模式</Label>
              <p className="text-xs text-muted-foreground">
                先回忆释义再点按翻转答案，显著强化提取练习（强烈建议开启）
              </p>
            </div>
            <Switch
              checked={activeRecallEnabled}
              onCheckedChange={handleActiveRecallChange}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="interleave-ratio">新卡交错比例</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="interleave-ratio"
                  type="number"
                  min={1}
                  max={10}
                  value={interleaveRatio}
                  onChange={(e) => handleInterleaveRatioChange(parseInt(e.target.value, 10) || 0)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">复习插 1 新</span>
              </div>
              <p className="text-[11px] text-muted-foreground">默认 5（每 5 张复习卡插 1 张新卡）</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quick-test-seconds">熟练卡秒答阈值</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="quick-test-seconds"
                  type="number"
                  min={2}
                  max={15}
                  value={quickTestSeconds}
                  onChange={(e) => handleQuickTestSecondsChange(parseInt(e.target.value, 10) || 0)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">秒</span>
              </div>
              <p className="text-[11px] text-muted-foreground">快速答对提示「建议记得」</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-interval">阶段小结间隔</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="summary-interval"
                  type="number"
                  min={1}
                  max={50}
                  value={summaryInterval}
                  onChange={(e) => handleSummaryIntervalChange(parseInt(e.target.value, 10) || 10)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">张/次</span>
              </div>
              <p className="text-[11px] text-muted-foreground">学习 N 张后插入小结进度</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 节奏调控与智能减负 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="size-4 text-primary" />
            节奏调控与智能减负
          </CardTitle>
          <CardDescription>疲劳保护锁、弱词阈值与 Easy Days 周末减负机制</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Easy Days 智能负载均衡</Label>
              <p className="text-xs text-muted-foreground">
                开启后周末复习量默认减半，平摊至工作日，避免周末集中堆积
              </p>
            </div>
            <Switch
              checked={easyDaysEnabled}
              onCheckedChange={(v) => void saveEasyDays(v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="leech-threshold">弱词收录阈值</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="leech-threshold"
                  type="number"
                  min={1}
                  max={10}
                  value={leechThreshold}
                  onChange={(e) => saveLeechThreshold(parseInt(e.target.value, 10) || 0)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">次遗忘</span>
              </div>
              <p className="text-[11px] text-muted-foreground">达到该遗忘次数自动进入弱词本</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max-session-cards">单轮学习上限</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max-session-cards"
                  type="number"
                  min={10}
                  max={500}
                  value={maxSessionCards}
                  onChange={(e) => handleMaxSessionCardsChange(parseInt(e.target.value, 10) || 0)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">张</span>
              </div>
              <p className="text-[11px] text-muted-foreground">达到上限提醒休息并开启学习锁</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rest-duration-minutes">休息锁时长</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="rest-duration-minutes"
                  type="number"
                  min={1}
                  max={120}
                  value={restDurationMinutes}
                  onChange={(e) => handleRestDurationChange(parseInt(e.target.value, 10) || 0)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">分钟</span>
              </div>
              <p className="text-[11px] text-muted-foreground">休息期间锁定新轮次启动</p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Label htmlFor="ignored-tags">学习忽略标签（支持模糊包含、通配符与正则，一行一个）</Label>
            <Textarea
              id="ignored-tags"
              rows={3}
              placeholder={"简单\n*四级*\n^CET[46]\n已掌握|生词"}
              value={ignoredTags}
              onChange={(e) => saveIgnoredTagsSetting(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              带这些标签的卡片不会进入「今日学习」默认队列；支持关键词模糊包含（如“简单”）、通配符（*、?）与正则表达式（如 ^CET[46]、简单|已学）
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
