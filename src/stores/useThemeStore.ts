import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 统一主题：黑白 + 5 套彩色主题（每个主题同时决定背景/卡片/主色，不再拆分明暗与强调色） */
export type AppTheme = "dark" | "light" | "nordic" | "blue" | "green" | "purple" | "matcha" | "orange" | "rose";

export const THEME_IDS: AppTheme[] = ["dark", "light", "nordic", "blue", "green", "purple", "matcha", "orange", "rose"];

/** 暗色调主题（用于 color-scheme 与明暗快捷切换） */
export const DARK_THEMES: AppTheme[] = ["dark", "nordic", "blue", "green", "purple"];

export interface ThemePreset {
  id: AppTheme;
  label: string;
  description: string;
  /** 预览色块：背景色 + 主色 */
  background: string;
  primary: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "dark", label: "石墨黑", description: "暗色 · 灰阶", background: "#141416", primary: "#f4f4f5" },
  { id: "light", label: "珍珠白", description: "亮色 · 极简", background: "#fbfcfd", primary: "#18181b" },
  { id: "nordic", label: "灰蓝", description: "暗色 · 灰蓝", background: "#0f172a", primary: "#38bdf8" },
  { id: "blue", label: "深海蓝", description: "暗色 · 蓝色", background: "#0a1628", primary: "#60a5fa" },
  { id: "green", label: "森林绿", description: "暗色 · 绿色", background: "#0c1e18", primary: "#34d399" },
  { id: "purple", label: "星夜紫", description: "暗色 · 紫色", background: "#171228", primary: "#c084fc" },
  { id: "matcha", label: "清新绿", description: "亮色 · 浅绿", background: "#f6f8f5", primary: "#15803d" },
  { id: "orange", label: "暖阳橙", description: "亮色 · 橙色", background: "#fcf8f3", primary: "#ea580c" },
  { id: "rose", label: "玫瑰红", description: "亮色 · 红色", background: "#fdf4f6", primary: "#e11d48" },
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
