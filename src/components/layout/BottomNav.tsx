import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  MoreHorizontal,
  Newspaper,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const PRIMARY_TABS = [
  { to: "/", label: "今日", icon: LayoutDashboard },
  { to: "/decks", label: "词库", icon: BookOpen },
  { to: "/study", label: "学习", icon: GraduationCap },
  { to: "/daily-article", label: "一文", icon: Newspaper },
];

const MORE_TABS = [
  { to: "/weak-words", label: "弱词本", icon: AlertTriangle },
  { to: "/stats", label: "统计看板", icon: BarChart3 },
  { to: "/import", label: "导入词库", icon: FileUp },
  { to: "/settings", label: "系统设置", icon: Settings },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const isMoreActive = MORE_TABS.some((t) => t.to === currentPath);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border/80 bg-background/95 backdrop-blur-md px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:hidden select-none"
      aria-label="移动端底部导航"
    >
      {PRIMARY_TABS.map((tab) => {
        const isActive = currentPath === tab.to;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={cn(
              "flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors rounded-lg",
              isActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className={cn("size-5 transition-transform", isActive && "scale-110")} />
            <span className="mt-0.5 text-[11px] leading-none tracking-tight">{tab.label}</span>
          </NavLink>
        );
      })}

      {/* 更多菜单抽屉 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors rounded-lg outline-none",
              isMoreActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="更多功能"
          >
            <MoreHorizontal className={cn("size-5 transition-transform", isMoreActive && "scale-110")} />
            <span className="mt-0.5 text-[11px] leading-none tracking-tight">更多</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={10}
          className="w-44 mb-2 p-1.5 shadow-lg border border-border/70 backdrop-blur-md bg-background/95"
        >
          {MORE_TABS.map((tab, idx) => {
            const isActive = currentPath === tab.to;
            return (
              <div key={tab.to}>
                {idx === 3 && <DropdownMenuSeparator className="my-1" />}
                <DropdownMenuItem
                  onClick={() => navigate(tab.to)}
                  className={cn(
                    "flex items-center gap-2.5 py-2 px-3 text-xs cursor-pointer rounded-md",
                    isActive && "bg-primary/10 text-primary font-semibold"
                  )}
                >
                  <tab.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{tab.label}</span>
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
