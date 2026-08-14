import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarClock, FileUp, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
import { getDayEndDate, parseDayStartHour } from "@/lib/day";

export default function Dashboard() {
  const dbReady = useDbStore((s) => s.ready);
  const { decks, cardCounts, refresh } = useDeckStore();
  const [dueCount, setDueCount] = useState(0);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (dbReady) {
      refresh();
      (async () => {
        const hour = parseDayStartHour(await db.getSetting("day_start"));
        const dayEnd = getDayEndDate(hour);
        const [due, fresh] = await Promise.all([
          db.getGlobalDueCount(dayEnd.toISOString()),
          db.getGlobalNewCount(),
        ]);
        setDueCount(due);
        setNewCount(fresh);
      })().catch(() => {});
    }
  }, [dbReady, refresh]);

  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const deckCount = decks.length;
  const cardTotal = Object.values(cardCounts).reduce((a, b) => a + b, 0);

  const STATS = [
    { label: "今日待复习", value: String(dueCount), icon: CalendarClock, hint: "due 今日 04:00 前" },
    { label: "新卡待学", value: String(newCount), icon: GraduationCap, hint: "FSRS state = New" },
    { label: "词库总数", value: String(deckCount), icon: BookOpen, hint: "本地 SQLite" },
    { label: "卡片总数", value: String(cardTotal), icon: GraduationCap, hint: "本地 SQLite" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">你好 👋</h2>
        <p className="text-muted-foreground">{today}</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <s.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="truncate text-xs text-muted-foreground">{s.label}</div>
                <div className="truncate text-[10px] text-muted-foreground/70">{s.hint}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 快捷操作 */}
      <Card>
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
          <CardDescription>FSRS-5 调度：今日到期卡片 + 配额内新卡</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/study">开始学习</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/import">
              <FileUp className="size-4" />
              导入词库
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/decks">浏览词库</Link>
          </Button>
        </CardContent>
      </Card>

      {/* 今日计划 */}
      <Card>
        <CardHeader>
          <CardTitle>今日计划</CardTitle>
          <CardDescription>学习配额与复习安排</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            今日待复习 <span className="font-medium text-foreground">{dueCount}</span> 张，
            新卡可学 <span className="font-medium text-foreground">{newCount}</span> 张
            （受各词库每日配额限制）。
            进入「学习」页选择词库即可开始。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
