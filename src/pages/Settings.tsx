import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
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
import { useThemeStore } from "@/stores/useThemeStore";
import { useDbStore } from "@/stores/useDbStore";
import { db } from "@/lib/db";
import { invalidateFSRS } from "@/lib/fsrs";

export default function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const dbReady = useDbStore((s) => s.ready);

  const [retention, setRetention] = useState(0.9);
  const [dayStart, setDayStart] = useState("04:00");
  const [saved, setSaved] = useState(false);

  // 加载设置
  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [r, d] = await Promise.all([
        db.getSetting("desired_retention"),
        db.getSetting("day_start"),
      ]);
      const rv = r ? parseFloat(r) : 0.9;
      if (Number.isFinite(rv)) setRetention(Math.min(0.95, Math.max(0.8, rv)));
      setDayStart(d ?? "04:00");
    })().catch(() => {});
  }, [dbReady]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveRetention = async (v: number) => {
    setRetention(v);
    if (!dbReady) return;
    await db.setSetting("desired_retention", String(v));
    invalidateFSRS(); // 调度器按新目标记忆率重建
    flashSaved();
  };

  const saveDayStart = async (v: string) => {
    setDayStart(v);
    if (!dbReady) return;
    await db.setSetting("day_start", v || "04:00");
    flashSaved();
  };

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
            <CardHeader>
              <CardTitle>AI 接口</CardTitle>
              <CardDescription>
                OpenAI 兼容接口，支持 DeepSeek 云端与 Ollama 本地（Phase 4 实现）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url">API 地址</Label>
                <Input id="ai-base-url" placeholder="https://api.deepseek.com/v1" disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-key">API Key</Label>
                <Input id="ai-key" type="password" placeholder="sk-..." disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-model">模型</Label>
                <Input id="ai-model" placeholder="deepseek-chat" disabled />
              </div>
              <Button disabled>测试连接</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
