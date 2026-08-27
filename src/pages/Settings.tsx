import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Database, Download, Loader2, Upload, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useThemeStore, THEME_PRESETS } from "@/stores/useThemeStore";
import { useDbStore } from "@/stores/useDbStore";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getEasyDaysConfig, saveEasyDaysConfig } from "@/lib/easy-days";
import { getTTSSource, saveTTSSource, type TTSSource } from "@/lib/tts";
import { isTauri } from "@/lib/env";
import {
  getDeepLCorsProxy,
  getDeepLApiKey,
  getDeepLApiUrl,
  getTranslationProvider,
  testDeepL,
  type TranslationProvider,
} from "@/lib/dictionary";
import { db } from "@/lib/db";
import { invalidateFSRS } from "@/lib/fsrs";
import { AIClient, AI_PRESETS, getAIConfig, saveAIConfig } from "@/lib/ai-client";
import { exportToJSON, importFromJSON, readBackupFile } from "@/lib/backup";
import { getSyncConfig, saveSyncConfig, testSyncConnection, pushSnapshot, pullSnapshot } from "@/lib/sync";
import { getVocabStandard, saveVocabStandard, type VocabStandard } from "@/lib/vocab";
import { getCustomRssSources, saveCustomRssSources, type CustomRssSource } from "@/lib/news";
import AISetupWizard from "@/components/ai/AISetupWizard";
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
  const [maxSessionCards, setMaxSessionCards] = useState(100);
  const [restDurationMinutes, setRestDurationMinutes] = useState(15);
  const [learningSteps, setLearningSteps] = useState("1m,10m");
  const [leechThreshold, setLeechThreshold] = useState(3);
  const [ignoredTags, setIgnoredTags] = useState("");
  const [easyDaysEnabled, setEasyDaysEnabled] = useState(false);
  const [ttsSource, setTtsSource] = useState<TTSSource>("auto");
  const [translationProvider, setTranslationProvider] = useState<TranslationProvider>("deepl");
  const [deeplApiKey, setDeeplApiKey] = useState("");
  const [deeplApiUrl, setDeeplApiUrl] = useState("");
  const [deeplCorsProxy, setDeeplCorsProxy] = useState("");
  const [deeplTesting, setDeeplTesting] = useState(false);
  const [deeplTestResult, setDeeplTestResult] = useState<{ ok: boolean; message: string } | null>(null);
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
  const [vocabStandard, setVocabStandard] = useState<VocabStandard>("考研");

  // 数据备份
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 跨端同步
  const [syncEndpoint, setSyncEndpoint] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncTesting, setSyncTesting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 自定义 RSS 源
  const [customRssSources, setCustomRssSources] = useState<CustomRssSource[]>(() => getCustomRssSources());
  const [newRssName, setNewRssName] = useState("");
  const [newRssText, setNewRssText] = useState("");
  const [rssMsg, setRssMsg] = useState("");

  // 危险区
  const [dangerTarget, setDangerTarget] = useState<"progress" | "stats" | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [backupPreview, setBackupPreview] = useState<{ decks: number; cards: number; reviews: number } | null>(null);

  // 加载设置
  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [r, d, npd, rl, aiCfg, rm, ar, si, ir, qt, msc, rdm, ls, lt, ig, ed, tts, tr, dlk, dlu, dcp, syncCfg, vocabStd] = await Promise.all([
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
        getMaxSessionCards(),
        getRestDurationMinutes(),
        getLearningSteps(),
        db.getSetting("leech_threshold"),
        getIgnoredTags(),
        getEasyDaysConfig(),
        getTTSSource(),
        getTranslationProvider(),
        getDeepLApiKey(),
        getDeepLApiUrl(),
        getDeepLCorsProxy(),
        getSyncConfig(),
        getVocabStandard(),
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
      setIgnoredTags(ig.join("、"));
      setEasyDaysEnabled(ed.enabled);
      setTtsSource(tts);
      setTranslationProvider(tr);
      setDeeplApiKey(dlk);
      setDeeplApiUrl(dlu);
      setDeeplCorsProxy(dcp);
      setSyncEndpoint(syncCfg.endpoint);
      setSyncToken(syncCfg.token);
      setVocabStandard(vocabStd);
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

  const saveLeechThreshold = async (v: number) => {
    setLeechThreshold(v);
    if (!dbReady || v <= 0) return;
    await db.setSetting("leech_threshold", String(v));
    flashSaved();
  };

  const saveIgnoredTagsSetting = async (v: string) => {
    setIgnoredTags(v);
    if (!dbReady) return;
    const tags = v
      .split(/[,，、;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    await saveIgnoredTags(tags);
    flashSaved();
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
    flashSaved();
  };

  const saveTTSSetting = async (v: TTSSource) => {
    setTtsSource(v);
    if (!dbReady) return;
    await saveTTSSource(v);
    flashSaved();
  };

  const saveTranslationProvider = async (v: TranslationProvider) => {
    setTranslationProvider(v);
    if (!dbReady) return;
    await db.setSetting("translation_provider", v);
    flashSaved();
  };

  const saveDeeplApiKey = async (v: string) => {
    setDeeplApiKey(v);
    if (!dbReady) return;
    await db.setSetting("deepl_api_key", v.trim());
    flashSaved();
  };

  const saveDeeplApiUrl = async (v: string) => {
    setDeeplApiUrl(v);
    if (!dbReady) return;
    await db.setSetting("deepl_api_url", v.trim());
    flashSaved();
  };

  const saveDeeplCorsProxy = async (v: string) => {
    setDeeplCorsProxy(v);
    if (!dbReady) return;
    await db.setSetting("deepl_cors_proxy", v.trim());
    flashSaved();
  };

  const handleTestDeepL = async () => {
    setDeeplTesting(true);
    setDeeplTestResult(null);
    try {
      const r = await testDeepL();
      setDeeplTestResult(r);
    } catch (e) {
      setDeeplTestResult({ ok: false, message: String(e) });
    } finally {
      setDeeplTesting(false);
    }
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

  const handleMaxSessionCardsChange = async (v: number) => {
    const n = Math.min(500, Math.max(10, v || 100));
    setMaxSessionCards(n);
    if (!dbReady) return;
    await saveMaxSessionCards(n);
    flashSaved();
  };

  const handleRestDurationChange = async (v: number) => {
    const n = Math.min(120, Math.max(1, v || 15));
    setRestDurationMinutes(n);
    if (!dbReady) return;
    await saveRestDurationMinutes(n);
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

  const handleVocabStandardChange = async (v: VocabStandard) => {
    setVocabStandard(v);
    if (!dbReady) return;
    await saveVocabStandard(v);
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
    try {
      const data = await readBackupFile();
      if (!data) return;
      setBackupPreview({
        decks: data.decks.length,
        cards: data.cards.length,
        reviews: data.reviewLogs?.length ?? 0,
      });
      setConfirmImportOpen(true);
    } catch (e) {
      setBackupMsg({ ok: false, text: String(e) });
    }
  };

  const confirmImport = async () => {
    setConfirmImportOpen(false);
    setBackupPreview(null);
    setBackupBusy(true);
    const r = await importFromJSON();
    setBackupBusy(false);
    setBackupMsg({ ok: r.ok, text: r.message });
  };

  const handleSaveSync = async () => {
    await saveSyncConfig(syncEndpoint, syncToken);
    setSyncMsg({ ok: true, text: "同步设置已保存" });
  };

  const handleTestSync = async () => {
    setSyncTesting(true);
    setSyncMsg(null);
    const r = await testSyncConnection();
    setSyncTesting(false);
    setSyncMsg({ ok: r.ok, text: r.message });
  };

  const handlePushSync = async () => {
    setSyncBusy(true);
    setSyncMsg(null);
    const r = await pushSnapshot();
    setSyncBusy(false);
    setSyncMsg({ ok: r.ok, text: r.message });
  };

  const handlePullSync = async () => {
    setSyncBusy(true);
    setSyncMsg(null);
    const r = await pullSnapshot();
    setSyncBusy(false);
    setSyncMsg({ ok: r.ok, text: r.message });
  };

  const handleAddCustomRss = () => {
    const name = newRssName.trim();
    if (!name) {
      setRssMsg("请填写来源名称");
      return;
    }
    const lines = newRssText.split("\n").map((s) => s.trim()).filter(Boolean);
    const topics: CustomRssSource["topics"] = [];
    for (const line of lines) {
      const sep = line.lastIndexOf("|");
      if (sep <= 0 || sep === line.length - 1) {
        setRssMsg(`无效行（应为：主题名|URL）：${line}`);
        return;
      }
      const label = line.slice(0, sep).trim();
      const url = line.slice(sep + 1).trim();
      if (!/^https?:\/\//i.test(url)) {
        setRssMsg(`无效 URL：${url}`);
        return;
      }
      topics.push({ id: "t" + topics.length + "-" + Date.now().toString(36), label, url });
    }
    if (topics.length === 0) {
      setRssMsg("请至少填写一个主题链接");
      return;
    }
    const id = "custom-" + Date.now().toString(36);
    const next = [...customRssSources, { id, name, topics }];
    setCustomRssSources(next);
    saveCustomRssSources(next);
    setNewRssName("");
    setNewRssText("");
    setRssMsg(`已添加自定义 RSS 源「${name}」`);
  };

  const handleDeleteCustomRss = (id: string) => {
    const next = customRssSources.filter((c) => c.id !== id);
    setCustomRssSources(next);
    saveCustomRssSources(next);
    setRssMsg("已删除自定义 RSS 源");
  };

  const confirmDangerReset = async () => {
    if (!dangerTarget) return;
    setDangerBusy(true);
    try {
      if (dangerTarget === "progress") {
        await db.resetLearningProgress();
        setBackupMsg({ ok: true, text: "已重置学习进度：卡片保留，FSRS 状态、复习记录与统计数据已清空。" });
      } else {
        await db.resetStatistics();
        setBackupMsg({ ok: true, text: "已重置统计数据：复习记录与学习日报已清空，记忆进度保留。" });
      }
    } catch (e) {
      setBackupMsg({ ok: false, text: String(e) });
    } finally {
      setDangerBusy(false);
      setDangerTarget(null);
    }
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
              <CardDescription>选择配色，右上角按钮可快速切换明暗</CardDescription>
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
                选择后立即生效并自动保存。
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
                  数值越高复习越频繁；考研建议 0.90，时间紧可降至 0.85
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
                  默认 04:00（Anki 惯例），日界前复习计入前一天
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
                  新词库默认配额，词库页可单独调整
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
                  全局复习预算，超出部分留到次日
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="leech-threshold">弱词收录阈值（遗忘次数）</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="leech-threshold"
                    type="number"
                    min={1}
                    max={10}
                    value={leechThreshold}
                    onChange={(e) => saveLeechThreshold(parseInt(e.target.value, 10) || 0)}
                  />
                  <span className="text-sm text-muted-foreground">次</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  达到该遗忘次数自动进入弱词本；默认 3，下调可更早收录
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ignored-tags">学习忽略标签</Label>
                <Input
                  id="ignored-tags"
                  placeholder="如：词组、熟词生义（用 、 或逗号分隔）"
                  value={ignoredTags}
                  onChange={(e) => saveIgnoredTagsSetting(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  带这些标签的卡片不会进入主页「今日学习」默认队列
                </p>
              </div>

              <div className="space-y-2">
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
                  <span className="text-sm text-muted-foreground">张复习卡插 1 张新卡</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  默认 5（每 5 张复习卡插 1 张新卡）
                </p>
              </div>

              <div className="space-y-2">
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
                  <span className="text-sm text-muted-foreground">秒</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  阈值内答对提示「建议记得」，仍需确认评分后进入下一张
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-session-cards">最大单轮学习数量</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="max-session-cards"
                    type="number"
                    min={10}
                    max={500}
                    value={maxSessionCards}
                    onChange={(e) => handleMaxSessionCardsChange(parseInt(e.target.value, 10) || 0)}
                  />
                  <span className="text-sm text-muted-foreground">张</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  达到上限后提醒休息，并开启学习锁（默认 100）
                </p>
              </div>

              <div className="space-y-2">
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
                  <span className="text-sm text-muted-foreground">分钟</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  达到单轮上限后，休息期间无法开始新学习（默认 15 分钟）
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="learning-steps">学习步骤</Label>
                <Input
                  id="learning-steps"
                  type="text"
                  placeholder="1m,10m"
                  value={learningSteps}
                  onChange={(e) => handleLearningStepsChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  新卡 Learning 阶段的重复间隔（m=分钟/h=小时/d=天），建议 1m,10m
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Easy Days 负载均衡</Label>
                  <p className="text-xs text-muted-foreground">
                    开启后周末复习量默认减半，可避免堆积
                  </p>
                </div>
                <Switch
                  checked={easyDaysEnabled}
                  onCheckedChange={(v) => void saveEasyDays(v)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tts-source">发音来源</Label>
                <Select value={ttsSource} onValueChange={(v) => void saveTTSSetting(v as TTSSource)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动（优先系统，失败用 Google）</SelectItem>
                    <SelectItem value="system">系统 TTS（离线可用）</SelectItem>
                    <SelectItem value="youdao">有道 TTS</SelectItem>
                    <SelectItem value="google">Google TTS（需网络）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  系统 TTS 离线可用；Google TTS 需要网络/代理
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="translation-provider">例句翻译接口</Label>
                <Select
                  value={translationProvider}
                  onValueChange={(v) => void saveTranslationProvider(v as TranslationProvider)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepl">DeepL（默认，需 API Key）</SelectItem>
                    <SelectItem value="fallback">现有方案（MyMemory + AI 兜底）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  DeepL 翻译质量更高；未配置 Key 时自动回退到现有方案
                </p>
              </div>

              {translationProvider === "deepl" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="deepl-api-key">DeepL API Key</Label>
                    <Input
                      id="deepl-api-key"
                      type="password"
                      placeholder="DeepL Auth Key"
                      value={deeplApiKey}
                      onChange={(e) => saveDeeplApiKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deepl-api-url">DeepL API URL（可选）</Label>
                    <Input
                      id="deepl-api-url"
                      placeholder="https://api-free.deepl.com/v2/translate"
                      value={deeplApiUrl}
                      onChange={(e) => saveDeeplApiUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isTauri()
                        ? "桌面端可保持默认：免费版 api-free，专业版改为 https://api.deepl.com/v2/translate"
                        : "网页端存在跨域限制：请填写你的 CORS 代理地址（如 Cloudflare Workers），桌面端可保持默认"}
                    </p>
                    {!isTauri() && (
                      <p className="text-xs text-amber-600">
                        ⚠️ 网页版 DeepL 需配置 CORS 代理才能生效；否则会自动回退到现有方案
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deepl-cors-proxy">CORS 代理地址（网页端）</Label>
                    <Input
                      id="deepl-cors-proxy"
                      placeholder="https://your-worker.example.workers.dev/translate"
                      value={deeplCorsProxy}
                      onChange={(e) => saveDeeplCorsProxy(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      网页端翻译 DeepL 时优先使用该代理地址；桌面端可留空
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" onClick={handleTestDeepL} disabled={deeplTesting}>
                      {deeplTesting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      测试 DeepL
                    </Button>
                    {deeplTestResult && (
                      <p className={deeplTestResult.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
                        {deeplTestResult.message}
                      </p>
                    )}
                  </div>
                </>
              )}

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
                  OpenAI 兼容接口（DeepSeek / Ollama / OpenAI），桌面端无 CORS 限制
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
              <CardTitle>词汇标准</CardTitle>
              <CardDescription>用于闪卡生成、生词识别、每日一文 AI 出题</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={vocabStandard}
                onValueChange={(v) => handleVocabStandardChange(v as VocabStandard)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CET4">四级（CET-4）</SelectItem>
                  <SelectItem value="CET6">六级（CET-6）</SelectItem>
                  <SelectItem value="考研">考研英语</SelectItem>
                  <SelectItem value="专业英语">专业英语</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                当前默认：{vocabStandard === "CET4" ? "四级" : vocabStandard === "CET6" ? "六级" : vocabStandard === "考研" ? "考研英语" : "专业英语"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>每日一文所需设置</CardTitle>
              <CardDescription>文章抓取需要 Worker 地址；AI 出题 / 生词 / 翻译需要 AI 接口</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={syncEndpoint.trim() || deeplCorsProxy.trim() ? "secondary" : "destructive"}>
                  Worker 地址：{syncEndpoint.trim() || deeplCorsProxy.trim() ? "已配置" : "未配置"}
                </Badge>
                <Badge variant={aiBaseURL.trim() && aiModel.trim() ? "secondary" : "destructive"}>
                  AI 接口：{aiBaseURL.trim() && aiModel.trim() ? "已配置" : "未配置"}
                </Badge>
                <Badge variant="secondary">
                  词汇标准：{vocabStandard === "CET4" ? "四级" : vocabStandard === "CET6" ? "六级" : vocabStandard === "考研" ? "考研英语" : "专业英语"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Worker 地址可使用「跨端同步地址」或「DeepL CORS 代理地址」；AI 接口在「AI 接口」区域配置。
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/daily-article">前往每日一文</Link>
              </Button>
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
              <p>· 出题与判分 Prompt 已内置 JSON 结构化模板，按学习状态自动选择策略，无需手动配置。</p>
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
                  <p>备份为本地 JSON；跨端同步请使用下方「跨端同步」。</p>
                  <p>恢复会清空现有数据，请谨慎使用。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 跨端同步 */}
          <Card>
            <CardHeader>
              <CardTitle>跨端同步</CardTitle>
              <CardDescription>通过 Cloudflare Worker + KV 上传/下载完整快照，实现 PWA 与 Windows 之间同步</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sync-endpoint">同步地址（Worker URL）</Label>
                <Input
                  id="sync-endpoint"
                  value={syncEndpoint}
                  onChange={(e) => setSyncEndpoint(e.target.value)}
                  placeholder="https://your-worker.example.workers.dev"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sync-token">同步 Token</Label>
                <Input
                  id="sync-token"
                  type="password"
                  value={syncToken}
                  onChange={(e) => setSyncToken(e.target.value)}
                  placeholder="与 Worker 环境变量 SYNC_TOKEN 一致"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveSync}>
                  保存设置
                </Button>
                <Button variant="outline" size="sm" onClick={handleTestSync} disabled={syncTesting || syncBusy}>
                  {syncTesting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  测试连接
                </Button>
                <Button size="sm" onClick={handlePushSync} disabled={syncBusy || syncTesting}>
                  {syncBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  上传快照到云端
                </Button>
                <Button variant="secondary" size="sm" onClick={handlePullSync} disabled={syncBusy || syncTesting}>
                  {syncBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  从云端下载快照
                </Button>
              </div>
              {syncMsg && (
                <p className={syncMsg.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
                  {syncMsg.ok ? <CheckCircle2 className="mr-1 inline size-3.5" /> : <XCircle className="mr-1 inline size-3.5" />}
                  {syncMsg.text}
                </p>
              )}
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <Database className="mt-0.5 size-3.5 shrink-0" />
                <div>
                  <p>上传会用本地完整备份覆盖云端；下载会用云端完整备份覆盖本地。</p>
                  <p>请先部署 Worker 并配置 KV 命名空间与 SYNC_TOKEN，再填写上面的地址和 Token。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 自定义 RSS 源 */}
          <Card>
            <CardHeader>
              <CardTitle>自定义 RSS 源</CardTitle>
              <CardDescription>可导入自己的 RSS 订阅链接；同一媒体可添加多个主题链接</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="custom-rss-name">来源名称</Label>
                <Input
                  id="custom-rss-name"
                  value={newRssName}
                  onChange={(e) => setNewRssName(e.target.value)}
                  placeholder="例如：My Tech News"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-rss-links">主题链接（每行一个：主题名|URL）</Label>
                <Textarea
                  id="custom-rss-links"
                  value={newRssText}
                  onChange={(e) => setNewRssText(e.target.value)}
                  rows={4}
                  placeholder={"World|https://example.com/world.xml\nTech|https://example.com/tech.xml"}
                />
              </div>
              <Button size="sm" onClick={handleAddCustomRss}>
                添加自定义源
              </Button>
              {rssMsg && <p className="text-xs text-muted-foreground">{rssMsg}</p>}
              {customRssSources.length > 0 && (
                <div className="space-y-2">
                  {customRssSources.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.topics.map((t) => t.label).join(" / ")}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteCustomRss(c.id)}>
                        删除
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 危险区 */}
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" />
                危险区
              </CardTitle>
              <CardDescription>以下操作不可撤销，建议先导出备份</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">重置学习进度</p>
                  <p className="text-xs text-muted-foreground">
                    保留全部词库与卡片，清空 FSRS 记忆状态、复习记录与学习统计（卡片全部回到「未学习」）
                  </p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setDangerTarget("progress")}>
                  重置进度
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">重置统计数据</p>
                  <p className="text-xs text-muted-foreground">
                    清空复习记录与学习日报，但保留当前 FSRS 记忆进度（图表归零，卡片不会被重学）
                  </p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setDangerTarget("stats")}>
                  重置统计
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 危险区确认对话框 */}
      <Dialog open={dangerTarget !== null} onOpenChange={(open) => !open && !dangerBusy && setDangerTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              {dangerTarget === "progress" ? "重置学习进度" : "重置统计数据"}
            </DialogTitle>
            <DialogDescription>
              {dangerTarget === "progress"
                ? "将清空全部卡片的 FSRS 记忆状态、复习记录与学习统计，词库和卡片本身会保留。此操作不可撤销！"
                : "将清空复习记录与学习统计，当前记忆进度保留。此操作不可撤销！"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDangerTarget(null)} disabled={dangerBusy}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDangerReset} disabled={dangerBusy}>
              {dangerBusy ? <Loader2 className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入恢复确认 */}
      <ConfirmDialog
        open={confirmImportOpen}
        onOpenChange={setConfirmImportOpen}
        title="导入恢复"
        description={
          backupPreview
            ? `备份内容：${backupPreview.decks} 词库 / ${backupPreview.cards} 卡片 / ${backupPreview.reviews} 复习记录。导入将清空现有数据并恢复为备份内容，确定继续？此操作不可撤销！`
            : "导入将清空现有数据并恢复为备份内容，确定继续？此操作不可撤销！"
        }
        destructive
        confirmLabel="确认导入"
        cancelLabel="取消"
        onConfirm={confirmImport}
        onCancel={() => setConfirmImportOpen(false)}
      />

      <AISetupWizard open={setupOpen} onOpenChange={setSetupOpen} />
    </div>
  );
}
