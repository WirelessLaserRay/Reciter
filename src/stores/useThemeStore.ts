import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 统一主题：黑白 + 5 套彩色主题（每个主题同时决定背景/卡片/主色，不再拆分明暗与强调色） */
export type AppTheme = "dark" | "light" | "blue" | "green" | "purple" | "orange" | "rose";

export const THEME_IDS: AppTheme[] = ["dark", "light", "blue", "green", "purple", "orange", "rose"];

/** 暗色调主题（用于 color-scheme 与明暗快捷切换） */
export const DARK_THEMES: AppTheme[] = ["dark", "blue", "green", "purple"];

export interface ThemePreset {
  id: AppTheme;
  label: string;
  description: string;
  /** 预览色块：背景色 + 主色 */
  background: string;
  primary: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "dark", label: "石墨黑", description: "暗色 · 中性", background: "#171717", primary: "#e5e5e5" },
  { id: "light", label: "珍珠白", description: "亮色 · 中性", background: "#ffffff", primary: "#262626" },
  { id: "blue", label: "深海蓝", description: "暗色 · 蓝", background: "#102033", primary: "#3b82f6" },
  { id: "green", label: "森林绿", description: "暗色 · 绿", background: "#12241d", primary: "#22c55e" },
  { id: "purple", label: "星夜紫", description: "暗色 · 紫", background: "#1d1530", primary: "#a855f7" },
  { id: "orange", label: "暖阳橙", description: "亮色 · 橙", background: "#fdf6ee", primary: "#f97316" },
  { id: "rose", label: "玫瑰红", description: "亮色 · 玫红", background: "#fdf1f3", primary: "#e11d48" },
];

interface ThemeState {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  /** 明暗快捷切换：任意彩色主题 → 亮色；暗色 ↔ 亮色 */
  toggleDarkLight: () => void;
}

function isAppTheme(v: unknown): v is AppTheme {
  return typeof v === "string" && (THEME_IDS as string[]).includes(v);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (t) => set({ theme: t }),
      toggleDarkLight: () => get().setTheme(get().theme === "light" ? "dark" : "light"),
    }),
    {
      name: "reciter-theme",
      version: 3,
      // 兼容 v1（theme: dark/light）与 v2（mode + accent）持久化数据
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (isAppTheme(p.theme)) return { ...current, theme: p.theme };
        if (typeof p.accent === "string" && p.accent !== "neutral" && isAppTheme(p.accent)) {
          return { ...current, theme: p.accent };
        }
        if (isAppTheme(p.mode)) return { ...current, theme: p.mode };
        return current;
      },
    }
  )
);
