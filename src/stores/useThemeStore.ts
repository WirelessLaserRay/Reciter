import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light";
export type ThemeAccent = "neutral" | "blue" | "green" | "purple" | "orange" | "rose";

interface ThemeState {
  mode: ThemeMode;
  accent: ThemeAccent;
  setMode: (t: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (a: ThemeAccent) => void;
}

type LegacyPersisted = { theme?: ThemeMode };

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "dark", // 默认暗色主题
      accent: "neutral", // 默认中性强调色
      setMode: (t) => set({ mode: t }),
      toggleMode: () => get().setMode(get().mode === "dark" ? "light" : "dark"),
      setAccent: (a) => set({ accent: a }),
    }),
    {
      name: "reciter-theme",
      version: 2,
      // 兼容旧版本：{ theme: "dark" } → { mode: "dark", accent: "neutral" }
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ThemeState & LegacyPersisted>;
        if (p.mode === undefined && p.theme !== undefined) {
          return { ...current, ...p, mode: p.theme, accent: p.accent ?? current.accent };
        }
        return { ...current, ...p };
      },
    }
  )
);
