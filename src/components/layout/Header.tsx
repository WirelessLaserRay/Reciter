import { Moon, Sun, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTaskStore } from "@/stores/useTaskStore";

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

export default function Header() {
  const theme = useThemeStore((s) => s.theme);
  const toggleDarkLight = useThemeStore((s) => s.toggleDarkLight);
  const tasks = useTaskStore((s) => s.tasks);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const navigate = useNavigate();

  const runningTasks = Object.values(tasks).filter((t) => t.status === "running");

  const title =
    TITLES[window.location.hash.replace("#", "")] ?? "Reciter";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
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
