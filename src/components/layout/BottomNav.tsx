import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Compass,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  Moon,
  MoreHorizontal,
  Newspaper,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useSearchStore } from "@/stores/useSearchStore";
import { useThemeStore } from "@/stores/useThemeStore";
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
  { to: "/deck-hub", label: "词库广场", icon: Compass },
  { to: "/weak-words", label: "弱词本", icon: AlertTriangle },
  { to: "/stats", label: "统计看板", icon: BarChart3 },
  { to: "/import", label: "导入词库", icon: FileUp },
  { to: "/settings", label: "系统设置", icon: Settings },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const openSearch = useSearchStore((s) => s.openSearch);
  const theme = useThemeStore((s) => s.theme);
  const toggleDarkLight = useThemeStore((s) => s.toggleDarkLight);
  const currentPath = location.pathname;

  const isMoreActive = MORE_TABS.some((t) => t.to === currentPath);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-around border-t border-border/70 bg-background/90 backdrop-blur-lg px-2 pb-[env(safe-area-inset-bottom)] md:hidden select-none shadow-sm transition-colors"
      aria-label="移动端底部导航"
    >
      {PRIMARY_TABS.map((tab) => {
        const isActive = currentPath === tab.to;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={cn(
              "group flex flex-1 flex-col items-center justify-center py-1 text-center transition-all duration-150 active:scale-95",
              isActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div
              className={cn(
                "flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200",
                isActive ? "bg-primary/15 text-primary shadow-2xs" : "text-muted-foreground group-hover:bg-muted/50"
              )}
            >
              <tab.icon className={cn("size-4.5 transition-transform duration-150", isActive && "scale-105")} />
            </div>
            <span className="mt-0.5 text-[10px] leading-tight tracking-tight font-medium">{tab.label}</span>
          </NavLink>
        );
      })}

      {/* 更多菜单抽屉 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group flex flex-1 flex-col items-center justify-center py-1 text-center transition-all duration-150 active:scale-95 outline-none",
              isMoreActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="更多功能"
          >
            <div
              className={cn(
                "flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200",
                isMoreActive ? "bg-primary/15 text-primary shadow-2xs" : "text-muted-foreground group-hover:bg-muted/50"
              )}
            >
              <MoreHorizontal className={cn("size-4.5 transition-transform duration-150", isMoreActive && "scale-105")} />
            </div>
            <span className="mt-0.5 text-[10px] leading-tight tracking-tight font-medium">更多</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={10}
          className="w-48 mb-2 p-1.5 shadow-xl border border-border/80 backdrop-blur-lg bg-background/95 rounded-xl"
        >
          {/* 全词库卡片查找 */}
          <DropdownMenuItem
            onClick={() => openSearch()}
            className="flex items-center gap-2.5 py-2 px-3 text-xs cursor-pointer rounded-lg font-medium text-primary hover:bg-primary/10"
          >
            <Search className="size-4 shrink-0 text-primary" />
            <span>全库查找卡片</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />

          {MORE_TABS.map((tab, idx) => {
            const isActive = currentPath === tab.to;
            return (
              <div key={tab.to}>
                {idx === 3 && <DropdownMenuSeparator className="my-1" />}
                <DropdownMenuItem
                  onClick={() => navigate(tab.to)}
                  className={cn(
                    "flex items-center gap-2.5 py-2 px-3 text-xs cursor-pointer rounded-lg transition-colors",
                    isActive
                      ? "bg-primary/12 text-primary font-semibold"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <tab.icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span>{tab.label}</span>
                </DropdownMenuItem>
              </div>
            );
          })}

          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem
            onClick={toggleDarkLight}
            className="flex items-center gap-2.5 py-2 px-3 text-xs cursor-pointer rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {theme === "light" ? <Moon className="size-4 shrink-0" /> : <Sun className="size-4 shrink-0" />}
            <span>{theme === "light" ? "切换暗色" : "切换亮色"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
