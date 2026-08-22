import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AIClient, getAIConfig, type AIGradeResult } from "@/lib/ai-client";
import { getAIStrategy, buildLearnerContext, type AIStrategy } from "@/lib/ai-strategy";
import { getLeechThreshold } from "@/lib/settings";
import { getStrategyPrompt } from "@/lib/ai-prompts";
import type { CardState } from "@/types";
import AISetupWizard from "./AISetupWizard";
import { MessageContent } from "./AIReply";

interface ChatMessage {
  role: "system" | "assistant" | "user";
  content: string;
  timestamp: number;
}

/** 会话缓存条目：同一单词/词组的首次生成结果（消息/策略/判分），避免折叠重开重复调用 AI */
interface CachedConversation {
  messages: ChatMessage[];
  strategy: AIStrategy;
  gradeResult: AIGradeResult | null;
  finalGrade: 1 | 2 | 3 | 4;
  lastQuestion: string;
  lastAnswer: string;
}

const CACHE_LIMIT = 30;
const conversationCache = new Map<string, CachedConversation>();

function conversationKey(front: string, back: string): string {
  return front + "\u0000" + back;
}

function rememberConversation(key: string, entry: CachedConversation): void {
  if (conversationCache.has(key)) conversationCache.delete(key);
  conversationCache.set(key, entry);
  while (conversationCache.size > CACHE_LIMIT) {
    const oldest = conversationCache.keys().next().value;
    if (oldest === undefined) break;
    conversationCache.delete(oldest);
  }
}

interface AIChatPanelProps {
  front: string;
  back: string;
  cardState: CardState;
  /** 统一学习流模式注入的策略（Phase 6C）；缺省时按 FSRS 状态自动推断 */
  strategyOverride?: AIStrategy;
  /** 嵌入侧栏模式：不渲染自带折叠头，内容始终展开（由外层侧栏控制折叠） */
  embedded?: boolean;
  /** AI 判分确认后回调；question/answer 为最近一次判分的题目与用户回答 */
  onGradeDecided?: (grade: 1 | 2 | 3 | 4, question?: string, answer?: string) => void;
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
  strategyOverride,
  embedded = false,
  onGradeDecided,
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

  // 初始化：优先复用同一单词/词组的会话缓存（不重复调用 AI），否则加载配置并生成首轮内容
  useEffect(() => {
    let cancelled = false;
    initializedRef.current = true;
    setExpanded(defaultExpanded);
    setError(null);
    setInput("");
    setGradeResult(null);
    setFinalGrade(3);
    setLastQuestion("");
    setLastAnswer("");

    const key = conversationKey(front, back);
    const cached = conversationCache.get(key);

    if (cached) {
      // 命中缓存：直接恢复首次生成内容，节省 token
      setMessages(cached.messages);
      setStrategy(cached.strategy);
      setGradeResult(cached.gradeResult);
      setFinalGrade(cached.finalGrade);
      setLastQuestion(cached.lastQuestion);
      setLastAnswer(cached.lastAnswer);
    } else {
      setMessages([]);
    }

    (async () => {
      const cfg = await getAIConfig();
      if (cancelled) return;
      const c = new AIClient(cfg);
      setClient(c);
      const leech = await getLeechThreshold();
      if (cancelled) return;

      if (cached) {
        if (!c.isReady) setError("未配置 AI 接口，请先完成 AI 设置。");
        return;
      }

      if (!c.isReady) {
        setError("未配置 AI 接口，请先完成 AI 设置。");
        return;
      }

      const s = strategyOverride ?? getAIStrategy(cardState, leech);
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
        const finalMessages: ChatMessage[] = [
          systemMsg,
          { role: "assistant", content: reply, timestamp: Date.now() },
        ];
        setMessages(finalMessages);
        rememberConversation(key, {
          messages: finalMessages,
          strategy: s,
          gradeResult: null,
          finalGrade: 3,
          lastQuestion: "",
          lastAnswer: "",
        });
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
      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        { ...assistantMsg, content: full },
      ];
      setMessages(finalMessages);
      rememberConversation(conversationKey(front, back), {
        messages: finalMessages,
        strategy,
        gradeResult,
        finalGrade,
        lastQuestion,
        lastAnswer,
      });
    } catch (e) {
      setError(String(e));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
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
      rememberConversation(conversationKey(front, back), {
        messages,
        strategy,
        gradeResult: res,
        finalGrade: res.grade,
        lastQuestion: question,
        lastAnswer: answer,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmGrade = () => {
    onGradeDecided?.(finalGrade, lastQuestion, lastAnswer);
    setGradeResult(null);
    rememberConversation(conversationKey(front, back), {
      messages,
      strategy,
      gradeResult: null,
      finalGrade,
      lastQuestion,
      lastAnswer,
    });
  };

  return (
    <div className={cn("overflow-hidden", !embedded && "rounded-xl border bg-card")}>
      {!embedded && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] font-medium transition-colors hover:bg-accent/50"
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
      )}

      {(embedded || expanded) && (
        <div className={cn("space-y-3 p-3", !embedded && "border-t")}>
          {embedded && strategy && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[11px]">
                {STRATEGY_LABEL[strategy]}
              </Badge>
              <span className="truncate text-sm font-medium">
                {front} · {back}
              </span>
            </div>
          )}

          {error && !client?.isReady && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
                去配置 AI
              </Button>
            </div>
          )}

          <div
            className={cn(
              "space-y-2.5 overflow-y-auto rounded-lg bg-muted/40 p-3 text-[15px]",
              embedded ? "max-h-[58vh]" : "max-h-80"
            )}
          >
            {messages
              .filter((m) => m.role !== "system")
              .map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user" ? "text-right" : "text-left"}
                >
                  <div
                    className={
                      "inline-block max-w-[90%] rounded-lg px-3 py-2 text-left text-[15px] leading-relaxed " +
                      (m.role === "user"
                        ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                        : "border bg-background")
                    }
                  >
                    {m.role === "assistant" ? (
                      m.content ? (
                        <MessageContent content={m.content} />
                      ) : busy && i === messages.length - 1 ? (
                        <span className="text-sm text-muted-foreground">思考中…</span>
                      ) : (
                        ""
                      )
                    ) : (
                      m.content
                    )}
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
              className="min-h-20 text-sm"
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
        </div>
      )}

      <AISetupWizard open={setupOpen} onOpenChange={setSetupOpen} />
    </div>
  );
}
