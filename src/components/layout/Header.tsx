import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";

const TITLES: Record<string, string> = {
  "/": "今日学习",
  "/decks": "词库",
  "/import": "导入",
  "/stats": "统计",
  "/settings": "设置",
  "/study": "学习",
};

export default function Header() {
  const mode = useThemeStore((s) => s.mode);
  const toggleMode = useThemeStore((s) => s.toggleMode);

  const title =
    TITLES[window.location.hash.replace("#", "")] ?? "Reciter";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMode}
          aria-label="切换明暗主题"
          title={mode === "dark" ? "切换到亮色主题" : "切换到暗色主题"}
        >
          {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
