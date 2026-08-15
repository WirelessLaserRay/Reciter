import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useThemeStore, DARK_THEMES } from "@/stores/useThemeStore";
import { useDbStore } from "@/stores/useDbStore";
import Dashboard from "@/pages/Dashboard";
import DeckList from "@/pages/DeckList";
import DeckDetail from "@/pages/DeckDetail";
import Study from "@/pages/Study";
import Import from "@/pages/Import";
import Stats from "@/pages/Stats";
import Settings from "@/pages/Settings";
import WeakWords from "@/pages/WeakWords";

function App() {
  const theme = useThemeStore((s) => s.theme);

  // 应用统一主题到 <html>：data-theme 控制配色，.dark 类控制暗色变体与 color-scheme
  useEffect(() => {
    const root = document.documentElement;
    const dark = DARK_THEMES.includes(theme);
    root.classList.toggle("dark", dark);
    root.dataset.theme = theme;
    root.style.colorScheme = dark ? "dark" : "light";
  }, [theme]);

  // 应用启动时初始化本地数据库（tauri-plugin-sql）
  useEffect(() => {
    useDbStore.getState().init();
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="/decks" element={<DeckList />} />
          <Route path="/decks/:id" element={<DeckDetail />} />
          <Route path="/study" element={<Study />} />
          <Route path="/import" element={<Import />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/weak-words" element={<WeakWords />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
    </TooltipProvider>
  );
}

export default App;
