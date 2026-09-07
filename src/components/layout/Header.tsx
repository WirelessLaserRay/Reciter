import { Moon, Sun, Loader2, X, Cloud, CloudUpload, CloudAlert, CloudOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useSyncStore } from "@/stores/useSyncStore";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/": "今日学习",
  "/decks": "词库",
  "/import": "导入",
  "/stats": "统计",
  "/settings": "设置",
  "/study": "学习",
  "/weak-words": "弱词本",
  "/daily-article": "每日一文",
};

function formatSyncTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  } catch {
    return "";
  }
}

export default function Header() {
  const theme = useThemeStore((s) => s.theme);
  const toggleDarkLight = useThemeStore((s) => s.toggleDarkLight);
  const tasks = useTaskStore((s) => s.tasks);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const syncStatus = useSyncStore((s) => s.status);
  const syncMessage = useSyncStore((s) => s.message);
  const isConfigured = useSyncStore((s) => s.isConfigured);
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime);
  const navigate = useNavigate();

  const runningTasks = Object.values(tasks).filter((t) => t.status === "running");

  const title =
    TITLES[window.location.hash.replace("#", "")] ?? "Reciter";

  return (
    <header className="flex h-13 sm:h-14 shrink-0 items-center justify-between border-b bg-background px-4 sm:px-6 pt-[env(safe-area-inset-top)]">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
        {isConfigured && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (syncStatus === "conflict" || syncStatus === "error") {
                    navigate("/settings");
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors border",
                  syncStatus === "syncing" && "border-primary/30 bg-primary/10 text-primary animate-pulse",
                  syncStatus === "synced" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15",
                  syncStatus === "conflict" && "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 cursor-pointer",
                  syncStatus === "error" && "border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/25 cursor-pointer",
                  syncStatus === "idle" && "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                aria-label="云端同步状态"
              >
                {syncStatus === "syncing" && <Loader2 className="size-3.5 animate-spin shrink-0" />}
                {syncStatus === "synced" && <CloudUpload className="size-3.5 shrink-0" />}
                {syncStatus === "conflict" && <CloudAlert className="size-3.5 shrink-0" />}
                {syncStatus === "error" && <CloudOff className="size-3.5 shrink-0" />}
                {syncStatus === "idle" && <Cloud className="size-3.5 shrink-0" />}
                <span className="hidden sm:inline text-xs font-normal">
                  {syncStatus === "syncing" && "同步中..."}
                  {syncStatus === "synced" && (lastSyncTime ? `已同步 ${formatSyncTime(lastSyncTime)}` : "已同步")}
                  {syncStatus === "conflict" && "同步冲突"}
                  {syncStatus === "error" && "同步失败"}
                  {syncStatus === "idle" && "云同步就绪"}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              <p>
                {syncMessage || (syncStatus === "synced" ? `最近同步：${lastSyncTime || "刚刚"}` : "云端同步")}
              </p>
              {(syncStatus === "conflict" || syncStatus === "error") && (
                <p className="text-[10px] text-muted-foreground mt-1">点击前往设置页处理</p>
              )}
            </TooltipContent>
          </Tooltip>
        )}
        {runningTasks.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors cursor-pointer hover:bg-primary/15"
            onClick={() => navigate(`/decks/${t.deckId}`)}
            title={`点击前往词库「${t.deckName}」查看进度`}
          >
            <Loader2 className="size-3 animate-spin shrink-0" />
            <span className="max-w-44 truncate">
              {t.title} ({t.done}/{t.total})
            </span>
            <button
              type="button"
              className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                cancelTask(t.id);
              }}
              title="取消该后台任务"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDarkLight}
          aria-label="明暗快捷切换"
          title={theme === "light" ? "切换到暗色主题" : "切换到亮色主题"}
        >
          {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
