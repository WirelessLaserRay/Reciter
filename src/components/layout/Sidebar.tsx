import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "今日学习", icon: LayoutDashboard },
  { to: "/decks", label: "词库", icon: BookOpen },
  { to: "/study", label: "学习", icon: GraduationCap },
  { to: "/weak-words", label: "弱词本", icon: AlertTriangle },
  { to: "/import", label: "导入", icon: FileUp },
  { to: "/stats", label: "统计", icon: BarChart3 },
  { to: "/settings", label: "设置", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* 品牌区 */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Languages className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Reciter</div>
          <div className="text-xs text-muted-foreground">英语学习与记忆</div>
        </div>
      </div>

      {/* 导航区 */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground"
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* 版本区 */}
      <div className="border-t p-4 text-xs text-muted-foreground">
        Reciter v0.10.0 · Phase 6C
      </div>
    </aside>
  );
}
