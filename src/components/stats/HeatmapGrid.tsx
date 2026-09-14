import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { toDateKey } from "@/lib/day";

interface HeatmapGridProps {
  /** { 'YYYY-MM-DD': 复习量 } */
  data: Record<string, number>;
  /** 覆盖天数（默认 365） */
  days?: number;
}

interface Thresholds {
  t1: number;
  t2: number;
  t3: number;
  t4: number;
}

/**
 * 根据历史复习强度动态计算分档阈值：
 * 避免固定阈值（如 16）在学习量极大或极小时所有方块深浅一样。
 */
function computeThresholds(data: Record<string, number>): Thresholds {
  const counts = Object.values(data)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);

  if (counts.length === 0) {
    return { t1: 1, t2: 4, t3: 8, t4: 16 };
  }

  const max = counts[counts.length - 1];
  if (max <= 4) {
    return { t1: 1, t2: 2, t3: 3, t4: 4 };
  }

  // 使用 25%, 50%, 75% 分位数计算强度分级
  const q1 = counts[Math.floor(counts.length * 0.25)];
  const q2 = counts[Math.floor(counts.length * 0.50)];
  const q3 = counts[Math.floor(counts.length * 0.75)];

  let t2 = Math.max(2, q1);
  let t3 = Math.max(t2 + 1, q2);
  let t4 = Math.max(t3 + 1, q3);

  // 如果分位数扎堆重复，回退到基于最大值的梯度比例
  if (t4 > max || t3 === t4 || t2 === t3) {
    t2 = Math.max(2, Math.round(max * 0.25));
    t3 = Math.max(t2 + 1, Math.round(max * 0.5));
    t4 = Math.max(t3 + 1, Math.round(max * 0.75));
  }

  return { t1: 1, t2, t3, t4 };
}

function getLevel(count: number, t: Thresholds): number {
  if (count <= 0) return 0;
  if (count < t.t2) return 1;
  if (count < t.t3) return 2;
  if (count < t.t4) return 3;
  return 4;
}

function getLevelClass(level: number): string {
  switch (level) {
    case 1:
      return "bg-primary/25 hover:bg-primary/40 transition-colors";
    case 2:
      return "bg-primary/50 hover:bg-primary/65 transition-colors";
    case 3:
      return "bg-primary/75 hover:bg-primary/90 transition-colors";
    case 4:
      return "bg-primary hover:brightness-110 transition-all shadow-2xs";
    default:
      return "bg-muted/60 dark:bg-muted/40 hover:bg-muted transition-colors";
  }
}

/** 动态学习热力图（根据用户历史复习强度自适应深浅度阶梯） */
export function HeatmapGrid({ data, days = 365 }: HeatmapGridProps) {
  const thresholds = useMemo(() => computeThresholds(data), [data]);

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

  const legendTiers = useMemo(
    () => [
      { level: 0, title: "0 次" },
      { level: 1, title: thresholds.t2 - 1 > 1 ? `1 ~ ${thresholds.t2 - 1} 次` : "1 次" },
      { level: 2, title: thresholds.t3 - 1 > thresholds.t2 ? `${thresholds.t2} ~ ${thresholds.t3 - 1} 次` : `${thresholds.t2} 次` },
      { level: 3, title: thresholds.t4 - 1 > thresholds.t3 ? `${thresholds.t3} ~ ${thresholds.t4 - 1} 次` : `${thresholds.t3} 次` },
      { level: 4, title: `${thresholds.t4}+ 次` },
    ],
    [thresholds]
  );

  return (
    <div className="space-y-2.5">
      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateRows: "repeat(7, 11px)", gridAutoFlow: "column" }}
        >
          {cells.map((c) => {
            const lvl = getLevel(c.count, thresholds);
            return (
              <div
                key={c.key}
                className={cn("size-[11px] rounded-[2px]", getLevelClass(lvl))}
                title={`${c.date}：${c.count} 次复习`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>近 {days} 天 · 共 {total} 次复习</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">少</span>
          {legendTiers.map((tier) => (
            <div
              key={tier.level}
              className={cn("size-[11px] rounded-[2px]", getLevelClass(tier.level))}
              title={tier.title}
            />
          ))}
          <span className="text-[11px]">多</span>
        </div>
      </div>
    </div>
  );
}
