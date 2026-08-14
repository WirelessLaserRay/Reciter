import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark", // 默认暗色主题
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
    }),
    { name: "reciter-theme" }
  )
);
