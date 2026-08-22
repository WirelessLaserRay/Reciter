import { db } from "@/lib/db";

export interface EasyDaysConfig {
  enabled: boolean;
  /** 0=周日, 1=周一 ... 6=周六；值为复习系数（0~1） */
  weekdays: Record<number, number>;
  /** 特定日期 YYYY-MM-DD，当天系数为 0 */
  specificDates: string[];
}

const DEFAULT_CONFIG: EasyDaysConfig = {
  enabled: false,
  weekdays: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
  specificDates: [],
};

export async function getEasyDaysConfig(): Promise<EasyDaysConfig> {
  const raw = await db.getSetting("easy_days_config");
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<EasyDaysConfig>;
    return {
      enabled: !!parsed.enabled,
      weekdays: { ...DEFAULT_CONFIG.weekdays, ...(parsed.weekdays ?? {}) },
      specificDates: Array.isArray(parsed.specificDates) ? parsed.specificDates.map(String) : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveEasyDaysConfig(config: EasyDaysConfig): Promise<void> {
  await db.setSetting("easy_days_config", JSON.stringify(config));
}

export function getEasyDaysFactor(date: Date, config: EasyDaysConfig = DEFAULT_CONFIG): number {
  if (!config.enabled) return 1;
  const key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  if (config.specificDates.includes(key)) return 0;
  const factor = config.weekdays[date.getDay()];
  return typeof factor === "number" ? Math.min(1, Math.max(0, factor)) : 1;
}
