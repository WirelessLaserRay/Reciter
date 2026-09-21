import { CalendarClock, GraduationCap, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface DashboardStatsGridProps {
  dueCount: number;
  newCount: number;
  deckCount: number;
  cardTotal: number;
}

export default function DashboardStatsGrid({
  dueCount,
  newCount,
  deckCount,
  cardTotal,
}: DashboardStatsGridProps) {
  const stats = [
    {
      label: "今日待复习",
      value: String(dueCount),
      icon: CalendarClock,
      hint: "今日到期 · 配额内",
    },
    {
      label: "新卡待学",
      value: String(newCount),
      icon: GraduationCap,
      hint: "FSRS state = New",
    },
    {
      label: "词库总数",
      value: String(deckCount),
      icon: BookOpen,
      hint: "本地 SQLite",
    },
    {
      label: "卡片总数",
      value: String(cardTotal),
      icon: GraduationCap,
      hint: "本地 SQLite",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      {stats.map((s) => (
        <Card
          key={s.label}
          className="transition-all hover:border-border hover:shadow-xs"
        >
          <CardContent className="flex items-center gap-3 p-3.5 sm:p-4">
            <div className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <s.icon className="size-4 sm:size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-bold tracking-tight">{s.value}</div>
              <div className="truncate text-xs font-medium text-muted-foreground">
                {s.label}
              </div>
              <div className="truncate text-[10px] text-muted-foreground/75 mt-0.5">
                {s.hint}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
