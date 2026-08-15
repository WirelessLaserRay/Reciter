import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  Languages,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* 品牌区 */}
      <div className={cn("flex h-14 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "gap-2 px-4")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Languages className="size-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">Reciter</div>
            <div className="truncate text-xs text-muted-foreground">英语学习与记忆</div>
          </div>
        )}
      </div>

      {/* 导航区：折叠后仅保留图标 */}
      <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "p-2" : "p-3")}>
        {NAV_ITEMS.map((item) => {
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground"
                )
              }
            >
              <item.icon className={collapsed ? "size-5" : "size-4"} />
              {!collapsed && item.label}
            </NavLink>
          );
          return collapsed ? (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <span className="block">{link}</span>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      {/* 底部：折叠开关 + 版本 */}
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className="w-full justify-center gap-2 text-xs"
          onClick={onToggle}
          title={collapsed ? "展开侧栏" : "折叠侧栏"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && "折叠侧栏"}
        </Button>
        {!collapsed && (
          <div className="mt-2 px-2 text-center text-[10px] text-muted-foreground">
            Reciter v0.11.0 · Phase 6C
          </div>
        )}
      </div>
    </aside>
  );
}
