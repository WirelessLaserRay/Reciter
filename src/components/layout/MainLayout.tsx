import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
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

  const isStudy = location.pathname === "/study";

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
        {/* 学习界面在移动端自动隐藏全局顶部 Header，将全部垂直高度留给卡片 */}
        <div className={cn(isStudy && "hidden md:block")}>
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
            isStudy
              ? "p-2 sm:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))] md:pt-6 md:pb-6"
              : "p-3.5 sm:p-6 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-6"
          )}
        >
          <Outlet />
        </main>
        {/* 学习界面在移动端自动隐藏底部导航栏，进入沉浸式背词 */}
        <div className={cn(isStudy && "hidden md:block")}>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
