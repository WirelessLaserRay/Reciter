import { Coffee, RotateCcw, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { EasyDaysConfig } from "@/lib/easy-days";

interface ExamEasyDaysSectionProps {
  config: EasyDaysConfig;
  onChange: (cfg: EasyDaysConfig) => void;
}

const WEEKDAYS = [
  { day: 1, label: "周一" },
  { day: 2, label: "周二" },
  { day: 3, label: "周三" },
  { day: 4, label: "周四" },
  { day: 5, label: "周五" },
  { day: 6, label: "周六" },
  { day: 0, label: "周日" },
] as const;

const PRESETS = [
  {
    name: "周日休整 (0%)",
    desc: "周日完全休息，其余全额",
    weekdays: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
  },
  {
    name: "周末减半 (50%)",
    desc: "周六周日减负 50%，平摊至工作日",
    weekdays: { 0: 0.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.5 },
  },
  {
    name: "周末双休 (0%)",
    desc: "周六周日不学新词与复习免除",
    weekdays: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0 },
  },
  {
    name: "周三/周日减负",
    desc: "每周三和周日半负荷休整",
    weekdays: { 0: 0.5, 1: 1, 2: 1, 3: 0.5, 4: 1, 5: 1, 6: 1 },
  },
  {
    name: "每日全勤 (100%)",
    desc: "每天保持 100% 学习强度",
    weekdays: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
  },
] as const;

export default function ExamEasyDaysSection({
  config,
  onChange,
}: ExamEasyDaysSectionProps) {
  const todayDay = new Date().getDay();
  const currentTodayFactor = config.enabled
    ? (config.weekdays[todayDay] ?? 1)
    : 1;

  const handleToggle = (enabled: boolean) => {
    const next: EasyDaysConfig = {
      ...config,
      enabled,
      weekdays: { ...config.weekdays },
      specificDates: [...config.specificDates],
    };
    // 若开启且周末尚未设置过减负，则默认将周日和周六减半
    if (enabled && next.weekdays[0] === 1 && next.weekdays[6] === 1) {
      next.weekdays[0] = 0.5;
      next.weekdays[6] = 0.5;
    }
    onChange(next);
  };

  const applyPreset = (presetWeekdays: Record<number, number>) => {
    onChange({
      ...config,
      enabled: true,
      weekdays: {
        ...config.weekdays,
        ...presetWeekdays,
      },
    });
  };

  const cycleWeekday = (day: number) => {
    const current = config.weekdays[day] ?? 1;
    let next = 1;
    if (current >= 0.9) {
      next = 0.5;
    } else if (current >= 0.4) {
      next = 0;
    } else {
      next = 1;
    }

    onChange({
      ...config,
      weekdays: {
        ...config.weekdays,
        [day]: next,
      },
    });
  };

  const isPresetActive = (presetWeekdays: Record<number, number>) => {
    if (!config.enabled) return false;
    return Object.entries(presetWeekdays).every(
      ([day, val]) => (config.weekdays[Number(day)] ?? 1) === val
    );
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Coffee className="size-4 text-primary" />
            Easy Days 减负日与周期调控
          </Label>
          <p className="text-xs text-muted-foreground">
            自主调节每周学习与复习负荷。在减负日/休整日自动按系数缩减编排指标，防止考前疲劳与断签。
          </p>
        </div>
        <Switch checked={config.enabled} onCheckedChange={handleToggle} />
      </div>

      {config.enabled && (
        <div className="space-y-3 pt-1 border-t border-border/60">
          {/* 快捷预设方案 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>快捷预设方案</span>
              <span className="text-[11px]">点击即可快速套用</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => {
                const active = isPresetActive(preset.weekdays);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset.weekdays)}
                    title={preset.desc}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors flex items-center gap-1 ${
                      active
                        ? "border-primary bg-primary/10 text-primary font-medium shadow-2xs"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    {active && <Check className="size-3 text-primary" />}
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 周一至周日独立排期 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>周一至周日负荷排期</span>
              <span className="text-[11px]">点击单日卡片切换：100% ➔ 50% ➔ 0%</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {WEEKDAYS.map(({ day, label }) => {
                const factor = config.weekdays[day] ?? 1;
                const isToday = day === todayDay;

                let badgeStyle = "bg-background/80 border-border text-foreground";
                let statusLabel = "100%";
                let statusDesc = "正常";

                if (factor <= 0.01) {
                  badgeStyle =
                    "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300 font-semibold";
                  statusLabel = "0%";
                  statusDesc = "休整";
                } else if (factor < 0.99) {
                  badgeStyle =
                    "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold";
                  statusLabel = `${Math.round(factor * 100)}%`;
                  statusDesc = "减负";
                }

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => cycleWeekday(day)}
                    className={`group relative rounded-lg border p-1.5 transition-all hover:border-primary/50 ${badgeStyle} ${
                      isToday ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background" : ""
                    }`}
                    title={`${label}: 点击切换负荷 (当前: ${statusDesc} ${statusLabel})`}
                  >
                    {isToday && (
                      <span className="absolute -top-1.5 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                      </span>
                    )}
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {label}
                      {isToday && <span className="text-[9px] text-primary ml-0.5">(今)</span>}
                    </div>
                    <div className="text-xs font-bold mt-0.5">{statusLabel}</div>
                    <div className="text-[10px] text-muted-foreground/90 mt-0.5">
                      {statusDesc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 今日执行状态与提示 */}
          <div className="rounded-md bg-background/80 border p-2 text-xs flex items-center justify-between text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">
                今日 (
                {WEEKDAYS.find((w) => w.day === todayDay)?.label ?? "当天"}
                ) 负荷状态：
              </span>
              {currentTodayFactor === 0 ? (
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 text-[10px] h-4"
                >
                  休整日 (0% 负荷 · 新词暂停，复习免除)
                </Badge>
              ) : currentTodayFactor < 1 ? (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] h-4"
                >
                  减负日 ({Math.round(currentTodayFactor * 100)}% 负荷 · 配额按比例缩减)
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] h-4"
                >
                  全额学习 (100% 负荷)
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  weekdays: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
                })
              }
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              title="重置全周为 100%"
            >
              <RotateCcw className="size-3" />
              重置
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
