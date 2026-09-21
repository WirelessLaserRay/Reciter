import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AIMode } from "@/lib/ai-generate";

interface ImportAiSectionProps {
  aiMode: AIMode;
  setAiMode: (val: AIMode) => void;
  aiText: string;
  setAiText: (val: string) => void;
  aiBusy: boolean;
  aiError: string | null;
  onAiGenerate: () => void;
}

export default function ImportAiSection({
  aiMode,
  setAiMode,
  aiText,
  setAiText,
  aiBusy,
  aiError,
  onAiGenerate,
}: ImportAiSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {aiMode === "study_material"
                ? "AI 识别：学习资料解析"
                : "AI 识别：语料生成闪卡"}
            </CardTitle>
            <CardDescription className="mt-1">
              {aiMode === "study_material"
                ? "精准解析学习资料中的单词/短语、词性、词义，并提取原文例句（或补齐例句）完整写入词库"
                : "粘贴整篇英文文章或外刊阅读材料，AI 根据词汇水平提炼最具学习价值的生词与短语生成闪卡"}
            </CardDescription>
          </div>

          <div className="inline-flex rounded-lg border bg-muted/50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setAiMode("study_material")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-all",
                aiMode === "study_material"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              学习资料解析
            </button>
            <button
              type="button"
              onClick={() => setAiMode("corpus")}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-all",
                aiMode === "corpus"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              语料生成闪卡
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={7}
          placeholder={
            aiMode === "study_material"
              ? "粘贴学习资料、生词笔记或教材讲义，例如：\n1. subtle adj. 微妙的，不易察觉的\n   He noticed a subtle change in her attitude. 他注意到她态度的微妙变化。\n2. take into account 考虑到，体谅\n3. reluctant adj. 不情愿的，勉强的"
              : "粘贴整篇英文文章、外刊报道或阅读材料段落，AI 将自动筛选提炼生词生成闪卡…"
          }
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
        />
        {aiError && <p className="text-xs text-red-600">{aiError}</p>}
        <Button onClick={onAiGenerate} disabled={aiBusy || !aiText.trim()}>
          {aiBusy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {aiMode === "study_material"
            ? "解析学习资料并生成卡片"
            : "提炼语料并生成闪卡"}
        </Button>
      </CardContent>
    </Card>
  );
}
