import { Sparkles } from "lucide-react";
import MarkdownView from "@/components/common/MarkdownView";

interface ExamAiPlanSectionProps {
  savedMacroPlan: string;
  generatingAI: boolean;
}

export default function ExamAiPlanSection({
  savedMacroPlan,
  generatingAI,
}: ExamAiPlanSectionProps) {
  if (!savedMacroPlan) return null;

  return (
    <details
      className="rounded-xl border border-primary/25 bg-muted/20 p-3.5 text-xs group"
      open={generatingAI}
    >
      <summary className="cursor-pointer font-medium hover:text-foreground list-none flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-primary font-semibold">
          <Sparkles className="size-3.5" />
          AI 分阶段宏观备考规划
        </span>
        <span className="text-[11px] text-muted-foreground group-open:hidden">
          点击展开查看 ▸
        </span>
        <span className="text-[11px] text-muted-foreground hidden group-open:inline">
          收起 ▾
        </span>
      </summary>
      <div className="mt-2.5 max-h-48 overflow-y-auto rounded-md bg-background/80 border p-3">
        <MarkdownView content={savedMacroPlan} className="text-xs" />
      </div>
    </details>
  );
}
