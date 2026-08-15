import { useEffect, useState } from "react";
import { CheckCircle2, Database, Download, Loader2, Upload, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useThemeStore, THEME_PRESETS } from "@/stores/useThemeStore";
import { useDbStore } from "@/stores/useDbStore";
import { db } from "@/lib/db";
import { invalidateFSRS } from "@/lib/fsrs";
import { AIClient, AI_PRESETS, getAIConfig, saveAIConfig } from "@/lib/ai-client";
import { exportToJSON, importFromJSON } from "@/lib/backup";
import AISetupWizard from "@/components/ai/AISetupWizard";
import {
  getActiveRecallEnabled,
  getInterleaveRatio,
  getLearningSteps,
  getQuickTestMs,
  getRatingMode,
  getSummaryInterval,
  saveActiveRecallEnabled,
  saveInterleaveRatio,
  saveLearningSteps,
  saveQuickTestMs,
  saveRatingMode,
  saveSummaryInterval,
} from "@/lib/study-prefs";

export default function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const dbReady = useDbStore((s) => s.ready);

  // 学习设置
  const [retention, setRetention] = useState(0.9);
  const [dayStart, setDayStart] = useState("04:00");
  const [defaultNewPerDay, setDefaultNewPerDay] = useState(20);
  const [dailyReviewLimit, setDailyReviewLimit] = useState(200);
  const [ratingMode, setRatingMode] = useState<"3" | "4">("3");
  const [activeRecallEnabled, setActiveRecallEnabled] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState(10);
  const [interleaveRatio, setInterleaveRatio] = useState(5);
  const [quickTestSeconds, setQuickTestSeconds] = useState(5);
  const [learningSteps, setLearningSteps] = useState("1m,10m");
  const [saved, setSaved] = useState(false);

  // AI 配置
  const [setupOpen, setSetupOpen] = useState(false);
  const [aiBaseURL, setAiBaseURL] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiTemp, setAiTemp] = useState(0.7);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiSaved, setAiSaved] = useState(false);

  // 数据备份
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 加载设置
  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [r, d, npd, rl, aiCfg, rm, ar, si, ir, qt, ls] = await Promise.all([
        db.getSetting("desired_retention"),
        db.getSetting("day_start"),
        db.getSetting("default_new_per_day"),
        db.getSetting("daily_review_limit"),
        getAIConfig(),
        getRatingMode(),
        getActiveRecallEnabled(),
        getSummaryInterval(),
        getInterleaveRatio(),
        getQuickTestMs(),
        getLearningSteps(),
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
      setLearningSteps(ls);
      setAiBaseURL(aiCfg.baseURL);
      setAiKey(aiCfg.apiKey);
      setAiModel(aiCfg.model);
      setAiTemp(aiCfg.temperature);
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const flashAiSaved = () => {
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 1500);
  };

  // ============ 学习设置动作 ============
  const saveRetention = async (v: number) => {
    setRetention(v);
    if (!dbReady) return;
    await db.setSetting("desired_retention", String(v));
    invalidateFSRS();
    flashSaved();
  };

  const saveNewPerDay = async (v: number) => {
    setDefaultNewPerDay(v);
    if (!dbReady || v <= 0) return;
    await db.setSetting("default_new_per_day", String(v));
    flashSaved();
  };

  const saveReviewLimit = async (v: number) => {
    setDailyReviewLimit(v);
    if (!dbReady || v <= 0) return;
    await db.setSetting("daily_review_limit", String(v));
    flashSaved();
  };

  const saveDayStart = async (v: string) => {
    setDayStart(v);
    if (!dbReady) return;
    await db.setSetting("day_start", v || "04:00");
    flashSaved();
  };

  const handleInterleaveRatioChange = async (v: number) => {
    const n = Math.min(10, Math.max(1, v || 5));
    setInterleaveRatio(n);
    if (!dbReady) return;
    await saveInterleaveRatio(n);
    flashSaved();
  };

  const handleQuickTestSecondsChange = async (v: number) => {
    const n = Math.min(15, Math.max(2, v || 5));
    setQuickTestSeconds(n);
    if (!dbReady) return;
    await saveQuickTestMs(n * 1000);
    flashSaved();
  };

  const handleLearningStepsChange = async (v: string) => {
    setLearningSteps(v);
    if (!dbReady) return;
    await saveLearningSteps(v);
    invalidateFSRS();
    flashSaved();
  };

  const handleRatingModeChange = async (v: "3" | "4") => {
    setRatingMode(v);
    if (!dbReady) return;
    await saveRatingMode(v);
    flashSaved();
  };

  const handleActiveRecallChange = async (v: boolean) => {
    setActiveRecallEnabled(v);
    if (!dbReady) return;
    await saveActiveRecallEnabled(v);
    flashSaved();
  };

  const handleSummaryIntervalChange = async (v: number) => {
    const n = Math.min(50, Math.max(1, v || 10));
    setSummaryInterval(n);
    if (!dbReady) return;
    await saveSummaryInterval(n);
    flashSaved();
  };

  // ============ AI 动作 ============
  const applyPreset = (p: (typeof AI_PRESETS)[number]) => {
    setAiBaseURL(p.baseURL);
    setAiKey(p.apiKey);
    setAiModel(p.model);
    setAiTestResult(null);
  };

  const saveAI = async () => {
    await saveAIConfig({
      baseURL: aiBaseURL,
      apiKey: aiKey,
      model: aiModel,
      temperature: aiTemp,
    });
    flashAiSaved();
  };

  const testAI = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const client = new AIClient({
        enabled: true,
        baseURL: aiBaseURL,
        apiKey: aiKey,
        model: aiModel,
        temperature: aiTemp,
      });
      const res = await client.testConnection();
      setAiTestResult(res);
    } catch (e) {
      setAiTestResult({ ok: false, message: String(e) });
    } finally {
      setAiTesting(false);
    }
  };

  const handleExport = async () => {
    setBackupBusy(true);
    const r = await exportToJSON();
    setBackupBusy(false);
    setBackupMsg({ ok: r.ok, text: r.message });
  };

  const handleImport = async () => {
    const confirm = window.confirm("导入将清空现有数据并恢复为备份内容，确定继续？");
    if (!confirm) return;
    setBackupBusy(true);
    const r = await importFromJSON();
    setBackupBusy(false);
    setBackupMsg({ ok: r.ok, text: r.message });
  };

  const isLocal = aiBaseURL.includes("localhost") || aiBaseURL.includes("127.0.0.1");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">设置</h2>
          <p className="text-sm text-muted-foreground">外观、学习偏好与 AI 配置</p>
        </div>
        {saved && <span className="text-xs text-green-600">已保存 ✓</span>}
      </div>

      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance">外观</TabsTrigger>
          <TabsTrigger value="learning">学习设置</TabsTrigger>
          <TabsTrigger value="ai">AI 配置</TabsTrigger>
          <TabsTrigger value="data">数据</TabsTrigger>
        </TabsList>

        {/* 外观 */}
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>主题</CardTitle>
              <CardDescription>
                每套主题同时决定背景、卡片与主色；右上角太阳/月亮按钮可在暗色与亮色主题间快速切换
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {THEME_PRESETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={
                      "group overflow-hidden rounded-lg border text-left transition-all " +
                      (theme === t.id
                        ? "border-primary ring-2 ring-ring/40"
                        : "border-border hover:bg-accent")
                    }
                  >
                    <span
                      className="flex h-14 items-center gap-2 px-3"
                      style={{ backgroundColor: t.background }}
                    >
                      <span
                        className="size-4 rounded-full"
                        style={{ backgroundColor: t.primary }}
                      />
                      <span
                        className="text-xs font-medium"
                        style={{ color: t.primary }}
                      >
                        Aa
                      </span>
                    </span>
                    <span className="block border-t px-3 py-2">
                      <span className="block text-sm font-medium">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                选择后立即生效并自动保存；黑白主题的边框对比度已同步增强。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 学习设置 */}
        <TabsContent value="learning" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>FSRS 学习偏好</CardTitle>
              <CardDescription>修改后立即生效（下次加载队列时应用）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                  越高复习越频繁、记忆越牢；越低复习间隔越长。考研备考建议 0.90，时间紧张可降至 0.85（复习量约少 30%）
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="day-start">今日起始时间（新的一天起点）</Label>
                <Input
                  id="day-start"
                  type="time"
                  value={dayStart}
                  onChange={(e) => saveDayStart(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  默认 04:00（Anki 惯例）。日界之前的复习计入前一天（时区陷阱对策）
                </p>
              </div>

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
                  <span className="text-sm text-muted-foreground">张/天</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  新词库的默认配额；可在「词库」页对单个词库单独调整（重命名对话框）
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
                  <span className="text-sm text-muted-foreground">次/天</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  全局复习预算（对标 Anki maximum reviews/day）；超出部分留到次日，避免过度复习
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="interleave-ratio">新卡交错比例（P0-①）</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="interleave-ratio"
                    type="number"
                    min={1}
                    max={10}
                    value={interleaveRatio}
                    onChange={(e) => handleInterleaveRatioChange(parseInt(e.target.value, 10) || 0)}
                  />
                  <span className="text-sm text-muted-foreground">张复习卡插 1 张新卡</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  交错练习长期记忆提升 20-40%；默认 5（每 5 张复习卡插入 1 张新卡）
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-test-seconds">熟练卡秒答阈值（P2-⑨）</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="quick-test-seconds"
                    type="number"
                    min={2}
                    max={15}
                    value={quickTestSeconds}
                    onChange={(e) => handleQuickTestSecondsChange(parseInt(e.target.value, 10) || 0)}
                  />
                  <span className="text-sm text-muted-foreground">秒</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  阈值内答对自动记为「记得」；研究建议 5 秒（想不起来说明未真正掌握）
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="learning-steps">学习步骤（P3-⑪）</Label>
                <Input
                  id="learning-steps"
                  type="text"
                  placeholder="1m,10m"
                  value={learningSteps}
                  onChange={(e) => handleLearningStepsChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  新卡 Learning 阶段的重复间隔（m=分钟/h=小时/d=天），逗号分隔；建议短且少（如 1m,10m），第二天起交给 FSRS 动态调度
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Easy Days 负载均衡</Label>
                  <p className="text-xs text-muted-foreground">
                    避免周末/特定日期复习堆积（规划中）
                  </p>
                </div>
                <Switch disabled />
              </div>

              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium">学习体验</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label>评分模式</Label>
                      <p className="text-xs text-muted-foreground">
                        三档更直觉（推荐）；开启四档保留 Anki 式 Easy
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
                        先回忆释义再显示答案，记忆效果更好（默认开启）
                      </p>
                    </div>
                    <Switch
                      checked={activeRecallEnabled}
                      onCheckedChange={handleActiveRecallChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="summary-interval">迷你小结间隔</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="summary-interval"
                        type="number"
                        min={1}
                        max={50}
                        value={summaryInterval}
                        onChange={(e) => handleSummaryIntervalChange(parseInt(e.target.value, 10) || 10)}
                      />
                      <span className="text-sm text-muted-foreground">张/次</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      每学习 N 张卡片后插入一次阶段性小结（10/15/20 推荐）
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI 配置 */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>AI 接口</CardTitle>
                <CardDescription>
                  OpenAI 兼容接口（DeepSeek 云端 / Ollama 本地 / OpenAI），经 tauri-plugin-http 直连，无 CORS 限制
                </CardDescription>
              </div>
              {isLocal ? (
                <Badge variant="secondary">本地模型</Badge>
              ) : (
                <Badge>云端模型</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">快速切换预设</Label>
                <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
                  引导配置
                </Button>
              </div>
              <div>
                <div className="mt-1.5 flex gap-2">
                  {AI_PRESETS.map((p) => (
                    <Button key={p.name} size="sm" variant="outline" onClick={() => applyPreset(p)}>
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url">API 地址</Label>
                <Input
                  id="ai-base-url"
                  placeholder="https://api.deepseek.com/v1 或 http://localhost:11434/v1"
                  value={aiBaseURL}
                  onChange={(e) => setAiBaseURL(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-key">API Key（本地模型可留空）</Label>
                <Input
                  id="ai-key"
                  type="password"
                  placeholder="sk-..."
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-model">模型</Label>
                <Input
                  id="ai-model"
                  placeholder="deepseek-chat / qwen2.5:7b / gpt-4o-mini"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>温度（temperature）</Label>
                  <span className="font-mono text-sm">{aiTemp.toFixed(1)}</span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.1}
                  value={[aiTemp]}
                  onValueChange={(v) => setAiTemp(v[0])}
                />
                <p className="text-xs text-muted-foreground">
                  越低越稳定（出题推荐 0.7），越高越有创意
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={testAI} disabled={aiTesting || !aiBaseURL || !aiModel}>
                  {aiTesting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  测试连接
                </Button>
                <Button onClick={saveAI}>
                  {aiSaved && <CheckCircle2 className="size-3.5" />}
                  保存配置
                </Button>
                {aiTestResult && (
                  <span className={aiTestResult.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
                    {aiTestResult.ok ? <CheckCircle2 className="mr-1 inline size-3.5" /> : <XCircle className="mr-1 inline size-3.5" />}
                    {aiTestResult.message}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI 出题与判分</CardTitle>
              <CardDescription>
                内置模板自动生效，无需手动配置
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>· 出题 / 判分 Prompt 已内置为 JSON 结构化模板，并按学习状态自动选择策略（新卡教学 / 识别练习 / 产出练习 / 顽固词深度攻克）。</p>
              <p>· 历史版本中可编辑的 Prompt 模板入口已移除；设置项只保留必要的接口连接配置，避免误改导致 AI 输出格式异常。</p>
              <p>· 如需恢复旧数据中的自定义模板，可在设置 KV 中直接删除 <code className="rounded bg-muted px-1">prompt_*</code> 键，应用会自动回退内置默认值。</p>
            </CardContent>
          </Card>
        </TabsContent>
        {/* 数据备份 */}
        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>数据备份</CardTitle>
              <CardDescription>全量导出（词库/卡片/记忆状态/复习记录/设置/日报）为 JSON 文件，可随时恢复</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleExport} disabled={backupBusy}>
                  {backupBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  导出备份
                </Button>
                <Button variant="outline" onClick={handleImport} disabled={backupBusy}>
                  {backupBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  导入恢复
                </Button>
              </div>
              {backupMsg && (
                <p className={backupMsg.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
                  {backupMsg.ok ? <CheckCircle2 className="mr-1 inline size-3.5" /> : <XCircle className="mr-1 inline size-3.5" />}
                  {backupMsg.text}
                </p>
              )}
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <Database className="mt-0.5 size-3.5 shrink-0" />
                <div>
                  <p>备份文件为本地 JSON（不含 WebDAV 同步，按需自行保存/迁移）。</p>
                  <p>恢复操作会清空当前全部数据后写入备份内容，请谨慎使用。</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AISetupWizard open={setupOpen} onOpenChange={setSetupOpen} />
    </div>
  );
}
