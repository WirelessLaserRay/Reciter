import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CalendarClock,
  CheckCircle2,
  Database,
  Download,
  Languages,
  Loader2,
  Newspaper,
  Palette,
  Sliders,
  Sparkles,
  Upload,
  Volume2,
  XCircle,
} from "lucide-react";
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
import { useDeckStore } from "@/stores/useDeckStore";
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
import { getCustomRssSources, getArticleMaxLength, saveCustomRssSources, type CustomRssSource } from "@/lib/news";
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
import {
  clearAIStudyPlan,
  generateAIStudyPlan,
  getExamConfig,
  getSavedAIStudyPlan,
  saveAIStudyPlan,
  saveExamConfig,
} from "@/lib/exam-planner";

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

  // 考试规划
  const { decks, cardCounts, refresh: refreshDecks } = useDeckStore();
  const [examDate, setExamDate] = useState("");
  const [examDeckIds, setExamDeckIds] = useState<number[]>([]);
  const [examAiPlan, setExamAiPlan] = useState("");
  const [examPlanning, setExamPlanning] = useState(false);
  const [examPlanMsg, setExamPlanMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
  const [articleMaxLength, setArticleMaxLength] = useState(30000);
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
      const [r, d, npd, rl, aiCfg, rm, ar, si, ir, qt, msc, rdm, ls, lt, ig, ed, tts, tr, dlk, dlu, dcp, syncCfg, vocabStd, aml, examCfg, examPlan] = await Promise.all([
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
        getArticleMaxLength(),
        getExamConfig(),
        getSavedAIStudyPlan(),
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
      setArticleMaxLength(aml);
      setExamDate(examCfg.date ?? "");
      setExamDeckIds(examCfg.deckIds);
      setExamAiPlan(examPlan);
      setAiBaseURL(aiCfg.baseURL);
      setAiKey(aiCfg.apiKey);
      setAiModel(aiCfg.model);
      setAiTemp(aiCfg.temperature);
      await refreshDecks();
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  const flashSaved = () => {
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), 1500);
  };
  const flashAiSaved = () => {
    setAiSaved(true);
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => setAiSaved(false), 1500);
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
    const tags = v.includes("\n")
      ? v.split("\n").map((s) => s.trim()).filter(Boolean)
      : v.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean);
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

  // ============ 考试规划动作 ============
  const toggleExamDeck = (id: number) => {
    setExamDeckIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveExamPlanning = async () => {
    if (!dbReady) return;
    if (!examDate) {
      setExamPlanMsg({ ok: false, text: "请先选择考试日期" });
      return;
    }
    await saveExamConfig({ date: examDate, deckIds: examDeckIds });
    setExamPlanMsg({ ok: true, text: "考试规划已保存，主页倒计时已更新" });
    flashSaved();
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
      const plan = await generateAIStudyPlan({ date: examDate, deckIds: examDeckIds }, decks);
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

  const handleArticleMaxLengthChange = async (v: number) => {
    const n = Math.min(100000, Math.max(1000, v || 30000));
    setArticleMaxLength(n);
    if (!dbReady) return;
    await db.setSetting("article_max_length", String(n));
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

      <Tabs defaultValue="general" className="space-y-6">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-full min-w-[560px] sm:min-w-0 justify-start sm:justify-center gap-1.5 p-1 bg-muted/60">
            <TabsTrigger value="general" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Palette className="size-4" />
              <span>外观与通用</span>
            </TabsTrigger>
            <TabsTrigger value="learning" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Brain className="size-4" />
              <span>学习与记忆</span>
            </TabsTrigger>
            <TabsTrigger value="exam" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <CalendarClock className="size-4" />
              <span>备考规划</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Sparkles className="size-4" />
              <span>AI与翻译</span>
            </TabsTrigger>
            <TabsTrigger value="reading" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Newspaper className="size-4" />
              <span>阅读与订阅</span>
            </TabsTrigger>
            <TabsTrigger value="data" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Database className="size-4" />
              <span>数据与同步</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. 外观与通用 */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="size-4 text-primary" />
                主题配色
              </CardTitle>
              <CardDescription>选择应用视觉配色，右上角按钮可快速切换明暗</CardDescription>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                词汇基准标准
              </CardTitle>
              <CardDescription>控制词库扫描拆分、生词识别标定与每日一文 AI 出题难度</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={vocabStandard}
                onValueChange={(v) => handleVocabStandardChange(v as VocabStandard)}
              >
                <SelectTrigger className="w-full sm:w-64">
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
                当前基准：{vocabStandard === "CET4" ? "四级" : vocabStandard === "CET6" ? "六级" : vocabStandard === "考研" ? "考研英语" : "专业英语"}。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="size-4 text-primary" />
                语音发音 (TTS)
              </CardTitle>
              <CardDescription>学习卡片单词与例句朗读的发音服务来源</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="tts-source">发音来源</Label>
                <Select value={ttsSource} onValueChange={(v) => void saveTTSSetting(v as TTSSource)}>
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动（优先系统，失败回退在线）</SelectItem>
                    <SelectItem value="system">系统 TTS（离线可用）</SelectItem>
                    <SelectItem value="youdao">有道 TTS（国内高速稳定）</SelectItem>
                    <SelectItem value="google">Google TTS（需科学网络）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  系统 TTS 离线可用；Google TTS 需要网络/代理；有道 TTS 适合国内直连。
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. 学习与记忆 */}
        <TabsContent value="learning" className="space-y-4">
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
                <Label htmlFor="ignored-tags">学习忽略标签（支持正则，一行一个）</Label>
                <Textarea
                  id="ignored-tags"
                  rows={3}
                  placeholder={"词组\n熟词生义\n^临时|^测试$"}
                  value={ignoredTags}
                  onChange={(e) => saveIgnoredTagsSetting(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  带这些标签的卡片不会进入「今日学习」默认队列；支持正则表达式
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. 备考规划 */}
        <TabsContent value="exam" className="space-y-4">
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
                <Label>目标词库（不选 = 全部词库）</Label>
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
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans">{examAiPlan}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. AI 与翻译服务 */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  AI 大模型接口
                </CardTitle>
                <CardDescription>
                  OpenAI 兼容接口（DeepSeek / Ollama / OpenAI），用于智能问答、深度复习与出题
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
                  引导配置向导
                </Button>
              </div>
              <div>
                <div className="mt-1.5 flex flex-wrap gap-2">
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
                <Label htmlFor="ai-model">模型名</Label>
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
                  越低越严谨稳定（出题推荐 0.7），越高越有发散创意
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
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

          {/* 翻译引擎 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="size-4 text-primary" />
                例句翻译引擎 (DeepL)
              </CardTitle>
              <CardDescription>例句与长难句翻译服务提供商；可配置 DeepL 高质量翻译</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="translation-provider">翻译接口</Label>
                <Select
                  value={translationProvider}
                  onValueChange={(v) => void saveTranslationProvider(v as TranslationProvider)}
                >
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepl">DeepL（推荐，需 API Key）</SelectItem>
                    <SelectItem value="fallback">公共兜底方案（MyMemory + AI 兜底）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  DeepL 翻译质量更高；未配置 Key 时会自动回退到公共兜底方案
                </p>
              </div>

              {translationProvider === "deepl" && (
                <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                  <div className="space-y-2">
                    <Label htmlFor="deepl-api-key">DeepL API Key</Label>
                    <Input
                      id="deepl-api-key"
                      type="password"
                      placeholder="DeepL Auth Key (如 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx)"
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
                        ? "桌面端可保持默认：免费版填 api-free，专业版填 https://api.deepl.com/v2/translate"
                        : "网页端存在浏览器跨域限制：请填写 CORS 代理地址（如 Cloudflare Workers），桌面端保持默认即可"}
                    </p>
                    {!isTauri() && (
                      <p className="text-xs text-amber-600">
                        ⚠️ 网页版 DeepL 需配置 CORS 代理才能生效；未配置时将自动回退
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
                  <div className="space-y-2 pt-1">
                    <Button variant="outline" size="sm" onClick={handleTestDeepL} disabled={deeplTesting}>
                      {deeplTesting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      测试 DeepL 连通性
                    </Button>
                    {deeplTestResult && (
                      <p className={deeplTestResult.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
                        {deeplTestResult.message}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. 阅读与订阅 */}
        <TabsContent value="reading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="size-4 text-primary" />
                每日一文服务与设置
              </CardTitle>
              <CardDescription>每日外刊精读抓取、生词讲解与正文展示配置</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={syncEndpoint.trim() || deeplCorsProxy.trim() ? "secondary" : "destructive"}>
                  Worker 代理：{syncEndpoint.trim() || deeplCorsProxy.trim() ? "已配置" : "未配置"}
                </Badge>
                <Badge variant={aiBaseURL.trim() && aiModel.trim() ? "secondary" : "destructive"}>
                  AI 助读出题：{aiBaseURL.trim() && aiModel.trim() ? "已配置" : "未配置"}
                </Badge>
                <Badge variant="secondary">
                  词汇基准：{vocabStandard === "CET4" ? "四级" : vocabStandard === "CET6" ? "六级" : vocabStandard === "考研" ? "考研英语" : "专业英语"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                文章抓取与全文解析依赖 Cloudflare Worker 代理；生词识别与 AI 出题使用已配置的 AI 模型。
              </p>
              <div className="flex items-center gap-2 pt-2">
                <Label htmlFor="article-max-length" className="shrink-0">文章截断字符数</Label>
                <Input
                  id="article-max-length"
                  type="number"
                  className="w-36"
                  min={1000}
                  max={100000}
                  value={articleMaxLength}
                  onChange={(e) => handleArticleMaxLengthChange(parseInt(e.target.value, 10) || 0)}
                />
                <span className="text-sm text-muted-foreground">字符</span>
              </div>
              <p className="text-xs text-muted-foreground">
                每日一文正文超过该长度时会自动智能截断（默认 30000 字符）
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/daily-article">前往「每日一文」</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                自定义 RSS 订阅源
              </CardTitle>
              <CardDescription>导入私有 RSS 订阅源；可为同一媒体配置多个分类频道</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="custom-rss-name">来源媒体名称</Label>
                <Input
                  id="custom-rss-name"
                  value={newRssName}
                  onChange={(e) => setNewRssName(e.target.value)}
                  placeholder="例如：The Verge / 经济学人"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-rss-links">主题链接（每行一个：分类名|URL）</Label>
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
                <div className="space-y-2 pt-2">
                  <Label className="text-xs text-muted-foreground">已订阅的自定义源</Label>
                  {customRssSources.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
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
        </TabsContent>

        {/* 6. 数据与同步 */}
        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                跨端快照同步 (Cloudflare)
              </CardTitle>
              <CardDescription>通过 Cloudflare Worker + KV 快照上传/下载，实现 Windows 桌面与 PWA 跨端同步</CardDescription>
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
                <Label htmlFor="sync-token">同步访问 Token</Label>
                <Input
                  id="sync-token"
                  type="password"
                  value={syncToken}
                  onChange={(e) => setSyncToken(e.target.value)}
                  placeholder="与 Worker 环境变量 SYNC_TOKEN 一致"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
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
                  <p>上传会用本地完整快照覆盖云端；下载会用云端完整快照覆盖本地。</p>
                  <p>需先在 Cloudflare 部署 Worker 并配置 KV 命名空间与 SYNC_TOKEN。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="size-4 text-primary" />
                本地数据备份与恢复
              </CardTitle>
              <CardDescription>全量导出为 JSON 离线文件（词库/卡片/记忆状态/复习记录/设置/日报），随时完整恢复</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleExport} disabled={backupBusy}>
                  {backupBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  导出全量备份 (JSON)
                </Button>
                <Button variant="outline" onClick={handleImport} disabled={backupBusy}>
                  {backupBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  从文件恢复
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
                  <p>备份文件包含本地全部数据；跨设备即时同步建议使用上方「跨端同步」。</p>
                  <p>从备份恢复会覆盖现有数据，请在恢复前确认。</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 危险区 */}
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" />
                危险区 (Danger Zone)
              </CardTitle>
              <CardDescription>以下重置操作无法撤回，执行前建议先导出本地备份</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/20 bg-background p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">重置学习进度</p>
                  <p className="text-xs text-muted-foreground">
                    保留全部词库与卡片，清空 FSRS 记忆状态、复习记录与学习统计（卡片全部回归「未学习」状态）
                  </p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setDangerTarget("progress")}>
                  重置进度
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/20 bg-background p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">重置统计数据</p>
                  <p className="text-xs text-muted-foreground">
                    清空复习记录与学习日报，但保留当前 FSRS 记忆进度（图表归零，已学卡片不会变回未学）
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
