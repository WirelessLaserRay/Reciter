import { useEffect, useState } from "react";
import {
  Database,
  Languages,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDbStore } from "@/stores/useDbStore";
import { db } from "@/lib/db";
import { isTauri } from "@/lib/env";
import { AIClient, AI_PRESETS, getAIConfig, saveAIConfig } from "@/lib/ai-client";
import {
  clearDictionaryMemoryCache,
  getDeepLCorsProxy,
  getDeepLApiKey,
  getDeepLApiUrl,
  getTranslationProvider,
  testDeepL,
  type TranslationProvider,
} from "@/lib/dictionary";
import {
  getExampleCacheStats,
  clearAllExampleCache,
  formatBytes,
} from "@/lib/example-cache";
import AISetupWizard from "@/components/ai/AISetupWizard";

const TRANSLATION_PROVIDER_OPTIONS: {
  value: TranslationProvider;
  label: string;
  tag: string;
  desc: string;
}[] = [
  {
    value: "deepl",
    label: "DeepL 翻译",
    tag: "专业精准",
    desc: "高质量自然语境对照（推荐，需配置 Auth Key）",
  },
  {
    value: "fallback",
    label: "公共兜底方案",
    tag: "免密开箱",
    desc: "内置公共翻译接口分段解析（无需填 Key，直接可用）",
  },
];

interface AITabProps {
  onSaved?: () => void;
}

export default function AITab({ onSaved }: AITabProps) {
  const dbReady = useDbStore((s) => s.ready);

  const [setupOpen, setSetupOpen] = useState(false);
  const [aiBaseURL, setAiBaseURL] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiTemp, setAiTemp] = useState(0.7);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiSaved, setAiSaved] = useState(false);

  const [translationProvider, setTranslationProvider] = useState<TranslationProvider>("deepl");
  const [deeplApiKey, setDeeplApiKey] = useState("");
  const [deeplApiUrl, setDeeplApiUrl] = useState("");
  const [deeplCorsProxy, setDeeplCorsProxy] = useState("");
  const [deeplTesting, setDeeplTesting] = useState(false);
  const [deeplTestResult, setDeeplTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [cacheStats, setCacheStats] = useState<{ count: number; sizeBytes: number }>({ count: 0, sizeBytes: 0 });
  const [cacheMsg, setCacheMsg] = useState("");
  const [confirmClearCacheOpen, setConfirmClearCacheOpen] = useState(false);

  const refreshCacheStats = async () => {
    const stats = await getExampleCacheStats();
    setCacheStats(stats);
  };

  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [aiCfg, tr, dlk, dlu, dcp] = await Promise.all([
        getAIConfig(),
        getTranslationProvider(),
        getDeepLApiKey(),
        getDeepLApiUrl(),
        getDeepLCorsProxy(),
      ]);
      setAiBaseURL(aiCfg.baseURL);
      setAiKey(aiCfg.apiKey);
      setAiModel(aiCfg.model);
      setAiTemp(aiCfg.temperature);
      setTranslationProvider(tr);
      setDeeplApiKey(dlk);
      setDeeplApiUrl(dlu);
      setDeeplCorsProxy(dcp);
      await refreshCacheStats();
    })().catch(() => {});
  }, [dbReady]);

  const applyPreset = (p: (typeof AI_PRESETS)[number]) => {
    setAiBaseURL(p.baseURL);
    setAiKey(p.apiKey);
    setAiModel(p.model);
    setAiTestResult(null);
  };

  const flashAiSaved = () => {
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
    onSaved?.();
  };

  const saveAI = async () => {
    await saveAIConfig({
      enabled: true,
      baseURL: aiBaseURL,
      apiKey: aiKey,
      model: aiModel,
      temperature: aiTemp,
    });
    flashAiSaved();
  };

  const handleTestAI = async () => {
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

  const handleTranslationProviderChange = async (v: TranslationProvider) => {
    setTranslationProvider(v);
    if (!dbReady) return;
    await db.setSetting("translation_provider", v);
    onSaved?.();
  };

  const handleDeeplApiKeyChange = async (v: string) => {
    setDeeplApiKey(v);
    if (!dbReady) return;
    await db.setSetting("deepl_api_key", v.trim());
    onSaved?.();
  };

  const handleDeeplApiUrlChange = async (v: string) => {
    setDeeplApiUrl(v);
    if (!dbReady) return;
    await db.setSetting("deepl_api_url", v.trim());
    onSaved?.();
  };

  const handleDeeplCorsProxyChange = async (v: string) => {
    setDeeplCorsProxy(v);
    if (!dbReady) return;
    await db.setSetting("deepl_cors_proxy", v.trim());
    onSaved?.();
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

  const handleClearCache = async () => {
    setConfirmClearCacheOpen(false);
    clearDictionaryMemoryCache();
    await clearAllExampleCache();
    await refreshCacheStats();
    setCacheMsg("已清空本地离线例句缓存");
    setTimeout(() => setCacheMsg(""), 3000);
  };

  const isLocal = aiBaseURL.includes("localhost") || aiBaseURL.includes("127.0.0.1");

  return (
    <div className="space-y-4">
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
            <Label htmlFor="ai-model">模型名称</Label>
            <Input
              id="ai-model"
              placeholder="deepseek-chat / qwen2.5:7b / gpt-4o-mini"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature（创造性 / 随机性）</Label>
              <span className="font-mono text-sm">{aiTemp.toFixed(1)}</span>
            </div>
            <Slider
              min={0}
              max={1.5}
              step={0.1}
              value={[aiTemp]}
              onValueChange={(v) => setAiTemp(v[0])}
            />
            <p className="text-xs text-muted-foreground">
              0.3 严谨稳定（适合例句讲解），0.7 平衡（推荐），1.0 富有创意
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={saveAI}>保存配置</Button>
            <Button variant="outline" onClick={handleTestAI} disabled={aiTesting}>
              {aiTesting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              测试连通性
            </Button>
            {aiSaved && <span className="text-xs text-green-600">已保存 ✓</span>}
          </div>

          {aiTestResult && (
            <div
              className={`rounded-md p-3 text-xs ${
                aiTestResult.ok
                  ? "bg-green-500/10 text-green-700 dark:text-green-300"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {aiTestResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. 划词与释义翻译引擎配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-4 text-primary" />
            划词与释义翻译引擎
          </CardTitle>
          <CardDescription>
            阅读每日一文、生词查询与释义扩展时使用的机器翻译通道
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="translation-provider">翻译提供商</Label>
            <Select
              value={translationProvider}
              onValueChange={(v) => void handleTranslationProviderChange(v as TranslationProvider)}
            >
              <SelectTrigger id="translation-provider" className="w-full sm:w-[320px]">
                <SelectValue>
                  {(() => {
                    const cur = TRANSLATION_PROVIDER_OPTIONS.find((o) => o.value === translationProvider) ?? TRANSLATION_PROVIDER_OPTIONS[0];
                    return (
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-medium text-foreground">{cur.label}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary font-normal">
                          {cur.tag}
                        </span>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-full sm:w-[320px]">
                {TRANSLATION_PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="py-2.5 px-3">
                    <div className="flex flex-col gap-0.5 text-left w-full pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{opt.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded border border-primary/20 bg-primary/10 text-primary font-normal">
                          {opt.tag}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground leading-snug whitespace-normal break-words">
                        {opt.desc}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {translationProvider === "deepl" && (
            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-2">
                <Label htmlFor="deepl-api-key">DeepL Authentication Key</Label>
                <Input
                  id="deepl-api-key"
                  type="password"
                  placeholder="例如：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
                  value={deeplApiKey}
                  onChange={(e) => handleDeeplApiKeyChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  免费版 API Key 通常以 :fx 结尾；配置后划词释义将获得专业级中英互译
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deepl-api-url">API 地址（可选，默认根据 Key 自动识别）</Label>
                <Input
                  id="deepl-api-url"
                  placeholder="https://api-free.deepl.com 或 https://api.deepl.com"
                  value={deeplApiUrl}
                  onChange={(e) => handleDeeplApiUrlChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  留空即可，系统会自动按 Key 是否以 :fx 结尾路由至对应接口
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
                  onChange={(e) => handleDeeplCorsProxyChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  网页端翻译 DeepL 时优先使用该代理地址；桌面端可留空
                </p>
              </div>
              <div className="space-y-2 pt-1">
                <Button variant="outline" size="sm" onClick={handleTestDeepL} disabled={deeplTesting}>
                  {deeplTesting ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
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

      {/* 3. 例句离线缓存管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            例句离线缓存管理
          </CardTitle>
          <CardDescription>
            学习时查询到的词典及 AI 例句会自动持久化至本地 IndexedDB 缓存；下次复习时秒级加载，无需重复消耗网络或 API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 bg-muted/20">
            <div>
              <p className="text-xs text-muted-foreground">已缓存词条数</p>
              <p className="text-2xl font-bold mt-1">
                {cacheStats.count} <span className="text-xs font-normal text-muted-foreground">个单词</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">估算存储占用</p>
              <p className="text-2xl font-bold mt-1">{formatBytes(cacheStats.sizeBytes)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmClearCacheOpen(true)}
              disabled={cacheStats.count === 0}
            >
              <Trash2 className="size-3.5 mr-1.5" />
              清空例句缓存
            </Button>
            {cacheMsg && (
              <span className="text-xs text-green-600 font-medium">{cacheMsg}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            提示：卡片编辑或词库详情中「批量匹配例句」直接写入了卡片标签，不会受清空缓存影响。此处仅管理背词时动态查询所留存的本地临时数据。
          </p>
        </CardContent>
      </Card>

      <AISetupWizard open={setupOpen} onOpenChange={setSetupOpen} />

      <ConfirmDialog
        open={confirmClearCacheOpen}
        onOpenChange={setConfirmClearCacheOpen}
        title="清空例句离线缓存？"
        description="清空后，动态查询留存在本地的例句缓存将被清除；卡片内通过标签预存的例句不会受影响。下次学习时将按需重新联网查询。"
        destructive
        confirmLabel="清空缓存"
        cancelLabel="取消"
        onConfirm={handleClearCache}
        onCancel={() => setConfirmClearCacheOpen(false)}
      />
    </div>
  );
}
