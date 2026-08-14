import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { toDateKey } from "@/lib/day";

interface HeatmapGridProps {
  /** { 'YYYY-MM-DD': 复习量 } */
  data: Record<string, number>;
  /** 覆盖天数（默认 365） */
  days?: number;
}

const LEVELS: { min: number; className: string }[] = [
  { min: 16, className: "bg-primary" },
  { min: 8, className: "bg-primary/70" },
  { min: 4, className: "bg-primary/40" },
  { min: 1, className: "bg-primary/20" },
];

function levelClass(count: number): string {
  for (const l of LEVELS) if (count >= l.min) return l.className;
  return "bg-muted";
}

/** GitHub 风格学习热力图（纯 CSS Grid，零依赖） */
export function HeatmapGrid({ data, days = 365 }: HeatmapGridProps) {
  const cells = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    // 对齐到周日（0），保证 7 行网格连续
    start.setDate(start.getDate() - start.getDay());
    const arr: { key: string; count: number; date: string }[] = [];
    for (let d = new Date(start); d.getTime() <= today.getTime(); d.setDate(d.getDate() + 1)) {
      const key = toDateKey(d);
      arr.push({ key, count: data[key] ?? 0, date: key });
    }
    return arr;
  }, [data, days]);

  const total = Object.values(data).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateRows: "repeat(7, 11px)", gridAutoFlow: "column" }}
        >
          {cells.map((c) => (
            <div
              key={c.key}
              className={cn("size-[11px] rounded-[2px]", levelClass(c.count))}
              title={c.date + "：" + c.count + " 次复习"}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>近 {days} 天 · 共 {total} 次复习</span>
        <div className="flex items-center gap-1">
          <span>少</span>
          {[0, 1, 4, 8, 16].map((m) => (
            <div key={m} className={cn("size-[11px] rounded-[2px]", levelClass(m))} />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  );
}
