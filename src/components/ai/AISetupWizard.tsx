import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AIClient, AI_PRESETS, saveAIConfig } from "@/lib/ai-client";
import { db } from "@/lib/db";

interface AISetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AISetupWizard({ open, onOpenChange }: AISetupWizardProps) {
  const [tab, setTab] = useState("deepseek");
  const [baseURL, setBaseURL] = useState(AI_PRESETS[0].baseURL);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(AI_PRESETS[0].model);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setTesting(false);
  }, [open]);

  const applyPreset = (name: string) => {
    const p = AI_PRESETS.find((x) => x.name === name);
    if (!p) return;
    setBaseURL(p.baseURL);
    setModel(p.model);
    if (name === "DeepSeek" || name === "OpenAI") {
      // 云端需要用户填写 Key；Ollama 本地可留空
    }
    setResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setResult(null);
    try {
      const client = new AIClient({
        enabled: true,
        baseURL,
        apiKey,
        model,
        temperature: 0.7,
      });
      const res = await client.testConnection();
      setResult(res);
    } catch (e) {
      setResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    await saveAIConfig({ baseURL, apiKey, model, temperature: 0.7 });
    await db.setSetting("ai_setup_completed", "true");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-purple-500" />
            开启 AI 学习助手
          </DialogTitle>
          <DialogDescription>
            选择你的 AI 服务，30 秒完成配置。之后可随时在设置中修改。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deepseek" onClick={() => applyPreset("DeepSeek")}>
              DeepSeek
            </TabsTrigger>
            <TabsTrigger value="ollama" onClick={() => applyPreset("Ollama（本地）")}>
              Ollama
            </TabsTrigger>
            <TabsTrigger value="custom" onClick={() => applyPreset("OpenAI")}>
              自定义
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deepseek" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              推荐 · 高性价比。需要到 DeepSeek 开放平台申请 API Key。
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ds-key">API Key</Label>
              <Input
                id="ds-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="ollama" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              本地 · 免费 · 离线。请先安装 Ollama 并拉取模型，例如 qwen2.5:7b。
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ollama-url">API 地址</Label>
              <Input
                id="ollama-url"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ollama-model">模型</Label>
              <Input
                id="ollama-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="custom" className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="custom-url">API 地址</Label>
              <Input
                id="custom-url"
                placeholder="https://api.openai.com/v1"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-key">API Key（本地可留空）</Label>
              <Input
                id="custom-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-model">模型</Label>
              <Input
                id="custom-model"
                placeholder="gpt-4o-mini"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        {result && (
          <p className={result.ok ? "flex items-center gap-1 text-xs text-green-600" : "flex items-center gap-1 text-xs text-red-600"}>
            {result.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            {result.message}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={testConnection} disabled={testing || !baseURL || !model}>
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : null}
            测试连接
          </Button>
          <Button onClick={save} disabled={!baseURL || !model}>
            保存并开始
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
