import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AIClient, getAIConfig, type AIGradeResult } from "@/lib/ai-client";
import { getPromptTemplate, renderTemplate } from "@/lib/ai-prompts";
import { cleanQuestionDisplay } from "@/lib/ai-adapter";
import { cn } from "@/lib/utils";

type Stage = "idle" | "generating" | "answering" | "grading" | "graded";

const GRADE_LABELS: Record<number, string> = { 1: "忘了", 2: "困难", 3: "良好", 4: "简单" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  front: string;
  back: string;
  /** 完成（评分确定后回调，父组件据其推进学习队列） */
  onComplete: (grade: 1 | 2 | 3 | 4, aiQuestion: string, aiAnswer: string) => void;
}

/** AI 深度复习：流式生成完形/语境题 → 用户作答 → AI 判分 → 可申诉 → 回填 FSRS */
export default function AIDeepReviewDialog({ open, onOpenChange, front, back, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [client, setClient] = useState<AIClient | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"example" | "context">("example");
  const [question, setQuestion] = useState(""); // 流式累积（生成中展示）
  const [cleanQuestion, setCleanQuestion] = useState(""); // 适配层清洗后的题目（作答/判分展示）
  const [answer, setAnswer] = useState("");
  const [gradeResult, setGradeResult] = useState<AIGradeResult | null>(null);
  const [finalGrade, setFinalGrade] = useState<1 | 2 | 3 | 4>(3);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 打开时重置并加载 AI 配置
  useEffect(() => {
    if (!open) return;
    setStage("idle");
    setQuestion("");
    setCleanQuestion("");
    setAnswer("");
    setGradeResult(null);
    setFinalGrade(3);
    setError(null);
    setBusy(false);
    getAIConfig()
      .then((cfg) => {
        const c = new AIClient(cfg);
        setClient(c);
        setReady(c.isReady);
        if (!c.isReady) setError("未配置 AI 接口，请先到 设置 → AI 配置 填写 API 地址与模型。");
      })
      .catch((e) => setError(String(e)));
  }, [open]);

  /** 生成题目：流式接收但不实时展示，输出完成后经适配层清洗再一次性显示 */
  const generate = async (m: "example" | "context") => {
    if (!client || busy) return;
    setBusy(true);
    setMode(m);
    setStage("generating");
    setQuestion("");
    setCleanQuestion("");
    setError(null);
    try {
      const template = await getPromptTemplate(m);
      const prompt = renderTemplate(template, { word: front, meaning: back, level: "B2" });
      let acc = "";
      await client.streamChat(
        [
          { role: "system", content: "你是 Reciter 英语学习应用的题目生成器，严格按模板输出。" },
          { role: "user", content: prompt },
        ],
        (token) => {
          acc += token; // 仅累积，不实时渲染
        }
      );
      if (!acc.trim()) throw new Error("AI 未返回内容");
      setQuestion(acc); // 原始回复（存档）
      setCleanQuestion(cleanQuestionDisplay(acc)); // 适配清洗后展示
      setStage("answering");
    } catch (e) {
      setError(String(e));
      setStage("idle");
    } finally {
      setBusy(false);
    }
  };

  /** 提交判分 */
  const grade = async () => {
    if (!client || !answer.trim() || busy) return;
    setBusy(true);
    setStage("grading");
    try {
      const res = await client.gradeAnswer({
        question: cleanQuestion || question,
        answer: front + "（" + back + "）",
        userAnswer: answer.trim(),
      });
      setGradeResult(res);
      setFinalGrade(res.grade);
      setStage("graded");
    } catch (e) {
      setError(String(e));
      setStage("answering");
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    onComplete(finalGrade, cleanQuestion || question, answer.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-purple-500" />
            AI 深度复习
          </DialogTitle>
          <DialogDescription>
            目标单词：<span className="font-semibold text-foreground">{front}</span>
            <span className="ml-2 text-muted-foreground">{back}</span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* 步骤 1：选择题型并生成 */}
        {stage === "idle" && (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!ready || busy} onClick={() => generate("example")}>
              生成例句
            </Button>
            <Button className="flex-1" variant="outline" disabled={!ready || busy} onClick={() => generate("context")}>
              生成语境题
            </Button>
          </div>
        )}

        {/* 流式生成中 */}
        {stage === "generating" && (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            AI 正在生成并适配{mode === "example" ? "例句" : "语境题"}，请稍候…
          </div>
        )}

        {/* 作答 */}
        {stage === "answering" && (
          <div className="space-y-3">
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
              {cleanQuestion || question}
            </div>
            <Textarea
              value={answer}
              disabled={busy}
              placeholder="输入你的回答…"
              rows={3}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) grade();
              }}
              autoFocus
            />
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => generate(mode)} disabled={busy}>
                <RefreshCw className="size-3.5" />
                换一题（{mode === "example" ? "例句" : "语境题"}）
              </Button>
              <Button onClick={grade} disabled={!answer.trim() || busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                提交判分
              </Button>
            </div>
          </div>
        )}

        {/* 判分中 */}
        {stage === "grading" && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            AI 正在评估你的回答…
          </div>
        )}

        {/* 判分结果 + 申诉 */}
        {stage === "graded" && gradeResult && (
          <div className="space-y-3">
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              {cleanQuestion || question}
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-4 text-green-500" />
                AI 评分：{gradeResult.grade} · {GRADE_LABELS[gradeResult.grade]}
              </p>
              <p className="text-muted-foreground">{gradeResult.comment}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                若不认同 AI 评分，可手动修改（申诉）：
              </p>
              <div className="grid grid-cols-4 gap-2">
                {([1, 2, 3, 4] as const).map((g) => (
                  <Button
                    key={g}
                    size="sm"
                    variant={finalGrade === g ? (g === 1 ? "destructive" : "default") : "outline"}
                    onClick={() => setFinalGrade(g)}
                  >
                    {g} · {GRADE_LABELS[g]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === "graded" && (
            <Button
              className={cn("w-full")}
              onClick={confirm}
              disabled={busy}
            >
              确认评分（{finalGrade} · {GRADE_LABELS[finalGrade]}）并继续
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
