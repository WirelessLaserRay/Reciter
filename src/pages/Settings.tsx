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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";

export default function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">设置</h2>
        <p className="text-sm text-muted-foreground">外观、学习偏好与 AI 配置</p>
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
              <CardTitle>学习偏好</CardTitle>
              <CardDescription>
                Phase 3 接入 FSRS 后生效
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>目标记忆率</Label>
                  <p className="text-xs text-muted-foreground">FSRS desired retention (默认 0.90)</p>
                </div>
                <span className="text-sm font-mono">0.90</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>每日新卡上限</Label>
                  <p className="text-xs text-muted-foreground">每个词库每日新卡配额</p>
                </div>
                <span className="text-sm font-mono">20</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Easy Days 负载均衡</Label>
                  <p className="text-xs text-muted-foreground">
                    避免周末复习堆积（Anki 2025 新特性对标）
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
