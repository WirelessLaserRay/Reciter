import { Target, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { PreviewStats } from "./types";

interface ExamStabilitySettingsProps {
  targetStability: number;
  setTargetStability: (val: number) => void;
  isCustomStability: boolean;
  setIsCustomStability: (val: boolean) => void;
  customStabilityInput: string;
  setCustomStabilityInput: (val: string) => void;
  previewStats: PreviewStats | null;
  useManualNew: boolean;
  setUseManualNew: (val: boolean) => void;
  overrideDailyNew: string;
  setOverrideDailyNew: (val: string) => void;
  daysUntil: number;
}

const STABILITY_TIERS = [
  { value: 7, label: "基本掌握 (推荐)", desc: "稳定性 >= 7天 · 预留 7 天冲刺缓冲" },
  { value: 14, label: "深度牢固", desc: "稳定性 >= 14天 · 预留 14 天多轮强化" },
  { value: 30, label: "永久记忆", desc: "稳定性 >= 30天 · 预留 21 天高阶强化" },
  { value: 0, label: "学完即可", desc: "初识浏览 · 线性平摊至考前最后一天" },
] as const;

export default function ExamStabilitySettings({
  targetStability,
  setTargetStability,
  isCustomStability,
  setIsCustomStability,
  customStabilityInput,
  setCustomStabilityInput,
  previewStats,
  useManualNew,
  setUseManualNew,
  overrideDailyNew,
  setOverrideDailyNew,
  daysUntil,
}: ExamStabilitySettingsProps) {
  return (
    <>
      {/* 5. 目标熟练度要求设定 */}
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Target className="size-4 text-primary" />
            目标熟练度设定
          </Label>
          {previewStats && (
            <span className="text-xs text-muted-foreground">
              平均稳定性：<strong className="text-foreground">{previewStats.avgStability}</strong> 天 · 达成率{" "}
              <strong className="text-primary">{previewStats.masteryRate}%</strong>
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          设定考前希望达到的词汇熟练度。系统根据所选档位自动推算记忆沉淀所需的复习周期，在考前预留冲刺期并提早完成生词吸收。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {STABILITY_TIERS.map((tier) => (
            <button
              key={tier.value}
              type="button"
              onClick={() => {
                setTargetStability(tier.value);
                setIsCustomStability(false);
              }}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                !isCustomStability && targetStability === tier.value
                  ? "border-primary bg-primary/10 text-primary font-medium shadow-xs"
                  : "border-border bg-background/60 hover:bg-muted/60 text-muted-foreground"
              }`}
            >
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                {tier.label}
                {!isCustomStability && targetStability === tier.value && (
                  <Check className="size-3 text-primary" />
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{tier.desc}</div>
            </button>
          ))}
        </div>

        {/* 自定义熟练度稳定性天数 */}
        <div className="pt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCustomStability(true)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              isCustomStability
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border bg-background/60 text-muted-foreground hover:bg-muted/60"
            }`}
          >
            自定义目标稳定性
          </button>
          {isCustomStability && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={180}
                className="w-20 h-7 text-xs"
                value={customStabilityInput}
                onChange={(e) => {
                  setCustomStabilityInput(e.target.value);
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v) && v >= 0) {
                    setTargetStability(v);
                  }
                }}
                placeholder="如 10"
              />
              <span className="text-xs text-muted-foreground">天（考前预留对应天数用于复习固化）</span>
            </div>
          )}
        </div>
      </div>

      {/* 6. 每日新学目标安排方式 */}
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5">
        <Label className="text-sm font-medium">每日新学目标设定</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm">
            <input
              type="radio"
              name="daily-mode"
              checked={!useManualNew}
              onChange={() => setUseManualNew(false)}
            />
            <span>
              智能动态均摊：根据剩余新词量与有效天数自动计算
              {previewStats && previewStats.remainingNew > 0 && daysUntil > 0 && (
                <span className="font-semibold text-primary ml-1">
                  (约 {previewStats.recommendedDailyNew} 词/天)
                </span>
              )}
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm">
            <input
              type="radio"
              name="daily-mode"
              checked={useManualNew}
              onChange={() => setUseManualNew(true)}
            />
            <span>手动固定每日新学词数</span>
          </label>
          {useManualNew && (
            <div className="pl-6 pt-1 flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={500}
                className="w-28 h-8 text-xs"
                placeholder="如 30"
                value={overrideDailyNew}
                onChange={(e) => setOverrideDailyNew(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">张卡片 / 天</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
