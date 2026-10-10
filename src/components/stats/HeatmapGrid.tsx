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
 * 避免固定阈值在学习量极大或极小时所有方块深浅一样。
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

interface CellData {
  key: string;
  count: number;
  date: string;
  dayOfWeek: number;
  month: number;
  dayOfMonth: number;
}

/** 动态学习热力图（自适应网格尺寸、紧凑列对齐、星期与月份标尺、整体居中排布） */
export function HeatmapGrid({ data, days = 365 }: HeatmapGridProps) {
  // 根据跨度天数智能适配单元格尺寸与间距，彻底消除列宽被拉大与方块过小问题
  const config = useMemo(() => {
    if (days <= 30) {
      return {
        size: 24,
        gap: 6,
        radius: "rounded-md",
        labelFontSize: 11,
        weekdayLabelWidth: 16,
        showMonthLabels: true,
      };
    }
    if (days <= 90) {
      return {
        size: 16,
        gap: 4,
        radius: "rounded-[3px]",
        labelFontSize: 10,
        weekdayLabelWidth: 16,
        showMonthLabels: true,
      };
    }
    return {
      size: 11,
      gap: 3,
      radius: "rounded-[2px]",
      labelFontSize: 9,
      weekdayLabelWidth: 14,
      showMonthLabels: true,
    };
  }, [days]);

  const { cells, weeks, monthHeaders } = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    // 对齐到周日（0），保证 7 行连续垂直周期
    start.setDate(start.getDate() - start.getDay());

    const arr: CellData[] = [];
    for (let d = new Date(start); d.getTime() <= today.getTime(); d.setDate(d.getDate() + 1)) {
      const key = toDateKey(d);
      arr.push({
        key,
        count: data[key] ?? 0,
        date: key,
        dayOfWeek: d.getDay(),
        month: d.getMonth() + 1,
        dayOfMonth: d.getDate(),
      });
    }

    // 每 7 天分为一列（周）
    const weekCols: CellData[][] = [];
    for (let i = 0; i < arr.length; i += 7) {
      weekCols.push(arr.slice(i, i + 7));
    }

    // 计算各周列上方的月份标签位置（避免密集重叠）
    const headers: { colIndex: number; text: string }[] = [];
    let lastHeaderCol = -3;
    let prevMonth = -1;

    weekCols.forEach((week, colIdx) => {
      const firstDay = week[0];
      const hasFirstOfMonth = week.some((c) => c.dayOfMonth === 1);
      const isStartCol = colIdx === 0;

      if ((hasFirstOfMonth || isStartCol) && firstDay.month !== prevMonth) {
        if (colIdx - lastHeaderCol >= 2 || isStartCol) {
          headers.push({ colIndex: colIdx, text: `${firstDay.month}月` });
          lastHeaderCol = colIdx;
          prevMonth = firstDay.month;
        }
      }
    });

    return { cells: arr, weeks: weekCols, monthHeaders: headers };
  }, [data, days]);

  const thresholds = useMemo(() => {
    const activeData: Record<string, number> = {};
    for (const c of cells) {
      if (c.count > 0) activeData[c.key] = c.count;
    }
    return computeThresholds(activeData);
  }, [cells]);

  const total = useMemo(() => cells.reduce((a, b) => a + b.count, 0), [cells]);

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

  const rangeText = days === 365 ? "近一年" : days === 90 ? "近三个月" : days === 30 ? "近一个月" : `近 ${days} 天`;

  return (
    <div className="space-y-4">
      {/* 居中排布的热力图主网格容器 */}
      <div className="overflow-x-auto pb-1">
        <div className="flex justify-center min-w-full py-1">
          <div className="inline-flex flex-col gap-1.5">
            {/* 月份表头 */}
            {config.showMonthLabels && (
              <div
                className="relative h-4 text-muted-foreground select-none"
                style={{
                  marginLeft: `${config.weekdayLabelWidth + 8}px`,
                  width: `${weeks.length * (config.size + config.gap) - config.gap}px`,
                }}
              >
                {monthHeaders.map((m) => (
                  <span
                    key={`${m.colIndex}-${m.text}`}
                    className="absolute font-medium text-xs leading-none"
                    style={{
                      left: `${m.colIndex * (config.size + config.gap)}px`,
                      fontSize: `${Math.max(10, config.labelFontSize)}px`,
                    }}
                  >
                    {m.text}
                  </span>
                ))}
              </div>
            )}

            {/* 网格主体（星期纵坐标 + 方块矩阵） */}
            <div className="inline-flex items-start gap-2">
              {/* 星期标签（周一、周三、周五像素级垂直居中对齐） */}
              <div
                className="grid text-muted-foreground select-none shrink-0"
                style={{
                  gridTemplateRows: `repeat(7, ${config.size}px)`,
                  rowGap: `${config.gap}px`,
                  fontSize: `${config.labelFontSize}px`,
                  width: `${config.weekdayLabelWidth}px`,
                }}
              >
                <div className="flex items-center justify-end" />
                <div className="flex items-center justify-end leading-none">一</div>
                <div className="flex items-center justify-end" />
                <div className="flex items-center justify-end leading-none">三</div>
                <div className="flex items-center justify-end" />
                <div className="flex items-center justify-end leading-none">五</div>
                <div className="flex items-center justify-end" />
              </div>

              {/* 核心方块矩阵（inline-grid 紧凑列宽，彻底消除空白间距） */}
              <div
                className="inline-grid"
                style={{
                  gridAutoFlow: "column",
                  gridAutoColumns: `${config.size}px`,
                  gridTemplateRows: `repeat(7, ${config.size}px)`,
                  gap: `${config.gap}px`,
                }}
              >
                {cells.map((c) => {
                  const lvl = getLevel(c.count, thresholds);
                  return (
                    <div
                      key={c.key}
                      style={{ width: `${config.size}px`, height: `${config.size}px` }}
                      className={cn(
                        "shrink-0 transition-all",
                        config.radius,
                        getLevelClass(lvl)
                      )}
                      title={`${c.date}：${c.count} 次复习`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部信息栏（总计与图例） */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40 text-xs text-muted-foreground">
        <span>{rangeText}（{days} 天） · 共 {total} 次复习</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">少</span>
          {legendTiers.map((tier) => (
            <div
              key={tier.level}
              style={{ width: `${Math.min(13, Math.max(10, config.size))}px`, height: `${Math.min(13, Math.max(10, config.size))}px` }}
              className={cn("rounded-[2px]", getLevelClass(tier.level))}
              title={tier.title}
            />
          ))}
          <span className="text-[11px]">多</span>
        </div>
      </div>
    </div>
  );
}
