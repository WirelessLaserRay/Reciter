import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useDbStore } from "@/stores/useDbStore";

const SIDEBAR_KEY = "reciter-sidebar-collapsed";

export default function MainLayout() {
  const location = useLocation();
  const dbError = useDbStore((s) => s.error);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "1"
  );

  const toggleSidebar = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {dbError && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-1.5 text-xs text-destructive">
            数据库不可用：{dbError}。请通过 <code>npm run tauri dev</code> 在桌面环境中运行。
          </div>
        )}
        <main key={location.pathname} className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
