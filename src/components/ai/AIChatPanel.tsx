import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AIClient, getAIConfig, type AIGradeResult } from "@/lib/ai-client";
import { getAIStrategy, buildLearnerContext, type AIStrategy } from "@/lib/ai-strategy";
import { getStrategyPrompt } from "@/lib/ai-prompts";
import type { CardState } from "@/types";
import AISetupWizard from "./AISetupWizard";

interface ChatMessage {
  role: "system" | "assistant" | "user";
  content: string;
  timestamp: number;
}

interface AIChatPanelProps {
  front: string;
  back: string;
  cardState: CardState;
  /** AI 判分确认后回调；question/answer 为最近一次判分的题目与用户回答 */
  onGradeDecided?: (grade: 1 | 2 | 3 | 4, question?: string, answer?: string) => void;
  onNext?: () => void;
  defaultExpanded?: boolean;
}

const STRATEGY_LABEL: Record<AIStrategy, string> = {
  teach: "教学",
  recognition: "识别",
  production: "产出",
  deep_drill: "深度攻克",
};

export default function AIChatPanel({
  front,
  back,
  cardState,
  onGradeDecided,
  onNext,
  defaultExpanded = false,
}: AIChatPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<AIClient | null>(null);
  const [strategy, setStrategy] = useState<AIStrategy>("recognition");
  const [setupOpen, setSetupOpen] = useState(false);
  const [gradeResult, setGradeResult] = useState<AIGradeResult | null>(null);
  const [finalGrade, setFinalGrade] = useState<1 | 2 | 3 | 4>(3);
  const [lastQuestion, setLastQuestion] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const initializedRef = useRef(false);

  // 初始化：加载 AI 配置、确定策略并自动发送首轮消息
  useEffect(() => {
    let cancelled = false;
    initializedRef.current = true;
    setExpanded(defaultExpanded);
    setMessages([]);
    setError(null);
    setGradeResult(null);
    setInput("");

    (async () => {
      const cfg = await getAIConfig();
      if (cancelled) return;
      const c = new AIClient(cfg);
      setClient(c);
      if (!c.isReady) {
        setError("未配置 AI 接口，请先完成 AI 设置。");
        return;
      }

      const s = getAIStrategy(cardState);
      setStrategy(s);
      const strategyPrompt = await getStrategyPrompt(s);
      if (cancelled) return;
      const systemContent = [
        "你是 Reciter 的 AI 学习助手，请用中文与学习者交流。",
        buildLearnerContext(cardState),
        `当前单词：${front}（${back}）`,
        strategyPrompt,
      ].join("\n\n");
      const systemMsg: ChatMessage = { role: "system", content: systemContent, timestamp: Date.now() };
      setMessages([systemMsg]);

      setBusy(true);
      try {
        const reply = await c.streamChat(
          [
            { role: "system", content: systemContent },
            { role: "user", content: "请根据我的学习状态开始。" },
          ],
          () => {},
          0.7
        );
        if (cancelled) return;
        setMessages([
          systemMsg,
          { role: "assistant", content: reply, timestamp: Date.now() },
        ]);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front, back]);

  const sendText = async (text: string) => {
    const content = text.trim();
    if (!content || !client || busy) return;
    const userMsg: ChatMessage = { role: "user", content, timestamp: Date.now() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);

    const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: Date.now() };
    setMessages([...nextMessages, assistantMsg]);
    let acc = "";
    try {
      const full = await client.streamChat(
        nextMessages.map((m) => ({ role: m.role, content: m.content })),
        (token) => {
          acc += token;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: acc };
            return copy;
          });
        },
        0.7
      );
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: full };
        return copy;
      });
    } catch (e) {
      setError(String(e));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const handleExplain = () => void sendText("请帮我详细讲解这个词");
  const handleSwitchPractice = () => void sendText("请用另一种方式出题");

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else if (onGradeDecided) {
      onGradeDecided(3);
    }
  };

  const handleGrade = async () => {
    if (!client || !input.trim() || busy) return;
    const question =
      [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
    const answer = input.trim();
    setBusy(true);
    setError(null);
    try {
      const res = await client.gradeAnswer({
        question,
        answer: `${front}（${back}）`,
        userAnswer: answer,
      });
      setGradeResult(res);
      setFinalGrade(res.grade);
      setLastQuestion(question);
      setLastAnswer(answer);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmGrade = () => {
    onGradeDecided?.(finalGrade, lastQuestion, lastAnswer);
    setGradeResult(null);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent/50"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-purple-500" />
          AI 学习助手
          {expanded && strategy && (
            <Badge variant="secondary" className="text-[10px]">
              {STRATEGY_LABEL[strategy]}
            </Badge>
          )}
        </span>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-3">
          {error && !client?.isReady && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
                去配置 AI
              </Button>
            </div>
          )}

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm">
            {messages
              .filter((m) => m.role !== "system")
              .map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user" ? "text-right" : "text-left"}
                >
                  <div
                    className={
                      "inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-left " +
                      (m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border")
                    }
                  >
                    {m.content || (busy && i === messages.length - 1 ? "思考中…" : "")}
                  </div>
                </div>
              ))}
            {messages.filter((m) => m.role !== "system").length === 0 && !busy && (
              <p className="text-xs text-muted-foreground">等待 AI 回复…</p>
            )}
          </div>

          {gradeResult && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                AI 评分：{gradeResult.grade} · {["", "忘了", "困难", "良好", "简单"][gradeResult.grade]}
              </p>
              <p className="mb-2 text-muted-foreground">{gradeResult.comment}</p>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {([1, 2, 3, 4] as const).map((g) => (
                  <Button
                    key={g}
                    size="sm"
                    variant={finalGrade === g ? (g === 1 ? "destructive" : "default") : "outline"}
                    onClick={() => setFinalGrade(g)}
                  >
                    {g}
                  </Button>
                ))}
              </div>
              <Button size="sm" className="w-full" onClick={confirmGrade}>
                确认评分并继续
              </Button>
            </div>
          )}

          {error && client?.isReady && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入回答或提问…"
              rows={2}
              disabled={busy || !client?.isReady}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void sendText(input);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <Button
                size="icon"
                disabled={!input.trim() || busy || !client?.isReady}
                onClick={() => void sendText(input)}
                title="发送"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="outline"
                disabled={!input.trim() || busy || !client?.isReady}
                onClick={handleGrade}
                title="AI 判分"
              >
                <BookOpen className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={handleExplain} disabled={busy || !client?.isReady}>
              <BookOpen className="size-3.5" />
              帮我讲解
            </Button>
            <Button size="sm" variant="outline" onClick={handleSwitchPractice} disabled={busy || !client?.isReady}>
              <RefreshCw className="size-3.5" />
              换个方式练
            </Button>
            <Button size="sm" variant="ghost" onClick={handleNext} disabled={busy}>
              下一个词
            </Button>
          </div>
        </div>
      )}

      <AISetupWizard open={setupOpen} onOpenChange={setSetupOpen} />
    </div>
  );
}
