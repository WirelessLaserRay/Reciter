import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
import { useStudyStore } from "@/stores/useStudyStore";
import { autoPullIfRemoteNewer } from "@/lib/sync";
import { initSyncStore } from "@/stores/useSyncStore";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "reciter-sidebar-collapsed";

export default function MainLayout() {
  const location = useLocation();
  const dbReady = useDbStore((s) => s.ready);
  const dbError = useDbStore((s) => s.error);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "1"
  );

  const activeDeckId = useStudyStore((s) => s.deckId);
  const isStudy = location.pathname === "/study";
  // 仅在真实进行卡片学习会话时（activeDeckId !== null），移动端才隐藏顶部 Header 与底部 BottomNav 进入沉浸背词；
  // 在选择词库时保留全局导航与顶部状态，避免突兀全屏
  const isImmersiveStudy = isStudy && activeDeckId !== null;

  useEffect(() => {
    if (!dbReady) return;
    void initSyncStore();
    void autoPullIfRemoteNewer()
      .then((pulled) => {
        if (pulled?.synced) {
          useDeckStore.getState().refresh();
        }
      })
      .catch(() => {});
  }, [dbReady]);

  const toggleSidebar = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="flex h-screen md:h-screen min-h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 学习会话进行中时在移动端隐藏全局 Header，选择词库时正常展示 */}
        <div className={cn(isImmersiveStudy && "hidden md:block")}>
          <Header />
        </div>
        {dbError && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-1.5 text-xs text-destructive">
            数据库不可用：{dbError}。请通过 <code>npm run tauri dev</code> 在桌面环境中运行。
          </div>
        )}
        <main
          key={location.pathname}
          className={cn(
            "flex-1 overflow-y-auto",
            isImmersiveStudy
              ? "p-2 sm:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))] md:pt-6 md:pb-6"
              : "p-3.5 sm:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6"
          )}
        >
          <Outlet />
        </main>
        {/* 学习会话进行中时在移动端隐藏底部导航栏，选择词库时正常展示 */}
        <div className={cn(isImmersiveStudy && "hidden md:block")}>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
