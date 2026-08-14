import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Moon, Sun, XCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDbStore } from "@/stores/useDbStore";
import { db } from "@/lib/db";
import { invalidateFSRS } from "@/lib/fsrs";
import { AIClient, AI_PRESETS, getAIConfig, saveAIConfig } from "@/lib/ai-client";
import {
  DEFAULT_PROMPTS,
  getPromptTemplate,
  resetPromptTemplate,
  savePromptTemplate,
  type PromptType,
} from "@/lib/ai-prompts";

const PROMPT_TYPES: PromptType[] = ["cloze", "context", "grading"];

export default function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const dbReady = useDbStore((s) => s.ready);

  // 学习设置
  const [retention, setRetention] = useState(0.9);
  const [dayStart, setDayStart] = useState("04:00");
  const [saved, setSaved] = useState(false);

  // AI 配置
  const [aiBaseURL, setAiBaseURL] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiTemp, setAiTemp] = useState(0.7);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiSaved, setAiSaved] = useState(false);

  // Prompt 模板
  const [promptTab, setPromptTab] = useState<PromptType>("cloze");
  const [prompts, setPrompts] = useState<Record<PromptType, string>>({
    cloze: DEFAULT_PROMPTS.cloze.default,
    context: DEFAULT_PROMPTS.context.default,
    grading: DEFAULT_PROMPTS.grading.default,
  });
  const [promptSaved, setPromptSaved] = useState(false);

  // 加载设置
  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [r, d, aiCfg] = await Promise.all([
        db.getSetting("desired_retention"),
        db.getSetting("day_start"),
        getAIConfig(),
      ]);
      const rv = r ? parseFloat(r) : 0.9;
      if (Number.isFinite(rv)) setRetention(Math.min(0.95, Math.max(0.8, rv)));
      setDayStart(d ?? "04:00");
      setAiBaseURL(aiCfg.baseURL);
      setAiKey(aiCfg.apiKey);
      setAiModel(aiCfg.model);
      setAiTemp(aiCfg.temperature);

      const p = { ...prompts };
      for (const t of PROMPT_TYPES) p[t] = await getPromptTemplate(t);
      setPrompts(p);
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
  const flashPromptSaved = () => {
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 1500);
  };

  // ============ 学习设置动作 ============
  const saveRetention = async (v: number) => {
    setRetention(v);
    if (!dbReady) return;
    await db.setSetting("desired_retention", String(v));
    invalidateFSRS();
    flashSaved();
  };

  const saveDayStart = async (v: string) => {
    setDayStart(v);
    if (!dbReady) return;
    await db.setSetting("day_start", v || "04:00");
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

  const savePrompts = async () => {
    for (const t of PROMPT_TYPES) await savePromptTemplate(t, prompts[t]);
    flashPromptSaved();
  };

  const resetOnePrompt = async (t: PromptType) => {
    await resetPromptTemplate(t);
    setPrompts((p) => ({ ...p, [t]: DEFAULT_PROMPTS[t].default }));
    flashPromptSaved();
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
        </TabsList>

        {/* 外观 */}
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>主题</CardTitle>
              <CardDescription>选择应用的明暗外观</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {theme === "dark" ? (
                  <Moon className="size-4 text-muted-foreground" />
                ) : (
                  <Sun className="size-4 text-muted-foreground" />
                )}
                当前：{theme === "dark" ? "暗色" : "亮色"}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                >
                  暗色
                </Button>
                <Button
                  size="sm"
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                >
                  亮色
                </Button>
              </div>
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
                <p className="text-xs text-muted-foreground">
                  越高复习越频繁、记忆越牢；越低复习间隔越长。默认 0.90（FSRS 推荐区间 0.8~0.95）
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

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>每日新卡上限</Label>
                  <p className="text-xs text-muted-foreground">
                    在「词库」页逐词库配置（默认 20 张/天）
                  </p>
                </div>
                <span className="text-sm font-mono text-muted-foreground">按词库</span>
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
              <div>
                <Label className="text-xs text-muted-foreground">快速切换预设</Label>
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Prompt 模板</CardTitle>
                <CardDescription>
                  AI 出题与判分的提示词，支持 {"{word}"} {"{meaning}"} {"{level}"} {"{question}"} {"{answer}"} {"{userAnswer}"} 占位符
                </CardDescription>
              </div>
              {promptSaved && <span className="text-xs text-green-600">已保存 ✓</span>}
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={promptTab} onValueChange={(v) => setPromptTab(v as PromptType)}>
                <TabsList>
                  {PROMPT_TYPES.map((t) => (
                    <TabsTrigger key={t} value={t}>
                      {DEFAULT_PROMPTS[t].label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {PROMPT_TYPES.map((t) => (
                  <TabsContent key={t} value={t} className="space-y-2">
                    <p className="text-xs text-muted-foreground">{DEFAULT_PROMPTS[t].description}</p>
                    <Textarea
                      rows={12}
                      className="font-mono text-xs"
                      value={prompts[t]}
                      onChange={(e) => setPrompts((p) => ({ ...p, [t]: e.target.value }))}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => resetOnePrompt(t)}>
                        恢复默认
                      </Button>
                      <Button size="sm" onClick={savePrompts}>
                        保存模板
                      </Button>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
