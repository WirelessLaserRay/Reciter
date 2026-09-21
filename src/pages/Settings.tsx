import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Brain,
  CalendarClock,
  Database,
  Newspaper,
  Palette,
  Sparkles,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GeneralTab from "./settings/tabs/GeneralTab";
import LearningTab from "./settings/tabs/LearningTab";
import ExamTab from "./settings/tabs/ExamTab";
import AITab from "./settings/tabs/AITab";
import ReadingTab from "./settings/tabs/ReadingTab";
import DataTab from "./settings/tabs/DataTab";

const VALID_TABS = ["general", "learning", "exam", "ai", "reading", "data"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const currentTab: TabValue = VALID_TABS.includes(rawTab as TabValue)
    ? (rawTab as TabValue)
    : "general";

  const [saved, setSaved] = useState(false);

  const flashSaved = useCallback(() => {
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleTabChange = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", val);
      return next;
    }, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">设置</h2>
          <p className="text-sm text-muted-foreground">外观、学习偏好与 AI 配置</p>
        </div>
        {saved && <span className="text-xs text-green-600 font-medium">已保存 ✓</span>}
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max min-w-full justify-start sm:justify-center gap-1.5 p-1 bg-muted/60">
            <TabsTrigger value="general" className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Palette className="size-4" />
              <span>外观与通用</span>
            </TabsTrigger>
            <TabsTrigger value="learning" className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Brain className="size-4" />
              <span>学习与记忆</span>
            </TabsTrigger>
            <TabsTrigger value="exam" className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <CalendarClock className="size-4" />
              <span>备考规划</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Sparkles className="size-4" />
              <span>AI与翻译</span>
            </TabsTrigger>
            <TabsTrigger value="reading" className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Newspaper className="size-4" />
              <span>阅读与订阅</span>
            </TabsTrigger>
            <TabsTrigger value="data" className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Database className="size-4" />
              <span>数据与同步</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="space-y-4">
          <GeneralTab onSaved={flashSaved} />
        </TabsContent>

        <TabsContent value="learning" className="space-y-4">
          <LearningTab onSaved={flashSaved} />
        </TabsContent>

        <TabsContent value="exam" className="space-y-4">
          <ExamTab onSaved={flashSaved} />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AITab onSaved={flashSaved} />
        </TabsContent>

        <TabsContent value="reading" className="space-y-4">
          <ReadingTab onSaved={flashSaved} />
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <DataTab onSaved={flashSaved} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
