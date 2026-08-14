import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/db";
import { applyReview, masteryToGrade, type Mastery } from "@/lib/review";
import { AIClient, getAIConfig } from "@/lib/ai-client";
import { cn } from "@/lib/utils";
import type { Card as CardType } from "@/types";

export type QuizType = "fill-cn2en" | "choice-cn2en" | "choice-en2cn" | "mixed";

type ItemType = "fill-cn2en" | "choice-cn2en" | "choice-en2cn";

interface QuizItem {
  card: CardType;
  type: ItemType;
  options?: string[]; // 选择题选项（含正确答案）
  correctAnswer: string;
  userAnswer: string | null;
  /** AI 生成的题目（Phase 4 接入；当前为 null 用本地题目） */
  aiQuestion: string | null;
  aiType: "cloze" | "context" | "choice" | null;
  mastery: Mastery | null;
}

interface QuizResult {
  total: number;
  mastered: number;
  fuzzy: number;
  forgot: number;
  aiQuestions: number;
}

const QUIZ_TYPE_LABEL: Record<ItemType, string> = {
  "fill-cn2en": "填空 · 中译英",
  "choice-cn2en": "选择 · 中译英",
  "choice-en2cn": "选择 · 英译中",
};

const MASTERY_META: Record<Mastery, { label: string; desc: string }> = {
  forgot: { label: "忘记", desc: "没想起来或答错" },
  fuzzy: { label: "模糊", desc: "想起来了但不确定" },
  mastered: { label: "掌握", desc: "准确无误" },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(all: CardType[], exclude: CardType, count: number, field: "front" | "back"): string[] {
  const pool = shuffle(all.filter((c) => c.id !== exclude.id && c[field] !== exclude[field]));
  const picked: string[] = [];
  for (const c of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(c[field])) picked.push(c[field]);
  }
  return picked;
}

function buildItems(cards: CardType[], type: QuizType, count: number): QuizItem[] {
  const picked = shuffle(cards).slice(0, count);
  return picked.map((card) => {
    let itemType: ItemType;
    if (type === "mixed") {
      const r = Math.random();
      itemType = r < 0.5 ? "fill-cn2en" : r < 0.75 ? "choice-cn2en" : "choice-en2cn";
    } else {
      itemType = type;
    }
    const item: QuizItem = {
      card,
      type: itemType,
      correctAnswer: itemType === "choice-en2cn" ? card.back : card.front,
      userAnswer: null,
      aiQuestion: null,
      aiType: null,
      mastery: null,
    };
    if (itemType.startsWith("choice")) {
      const isEn2Cn = itemType === "choice-en2cn";
      const distractors = pickDistractors(cards, card, 3, isEn2Cn ? "back" : "front");
      const options = shuffle([item.correctAnswer, ...distractors]);
      item.options = options;
    }
    return item;
  });
}

export default function QuizSession({ deckId, deckName }: { deckId: number; deckName: string }) {
  const [configType, setConfigType] = useState<QuizType>("mixed");
  const [configCount, setConfigCount] = useState("10");
  const [useAI, setUseAI] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [cards, setCards] = useState<CardType[]>([]);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [items, setItems] = useState<QuizItem[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const aiClientRef = useRef<AIClient | null>(null);

  // 加载词库卡片 + AI 配置状态
  useEffect(() => {
    (async () => {
      const [cs, cfg] = await Promise.all([db.getCardsByDeck(deckId), getAIConfig()]);
      setCards(cs);
      const client = new AIClient(cfg);
      aiClientRef.current = client;
      setAiReady(client.isReady);
    })().catch(() => {});
  }, [deckId]);

  const item = items[index];

  const startQuiz = async () => {
    setPhase("running");
    const n = configCount === "all" ? cards.length : parseInt(configCount, 10);
    const built = buildItems(cards, configType, Math.max(1, Math.min(n, cards.length)));

    // 预留 AI 出题：AI 可用时尝试为每题生成语境/干扰题（Phase 4 生效）
    if (useAI && aiClientRef.current?.isReady) {
      for (const it of built) {
        const q = await aiClientRef.current.generateQuestion({
          front: it.card.front,
          back: it.card.back,
          type: it.type === "fill-cn2en" ? "cloze" : "choice",
        });
        if (q) {
          it.aiQuestion = q;
          it.aiType = it.type === "fill-cn2en" ? "cloze" : "choice";
        }
      }
    }

    setItems(built);
    setIndex(0);
    setRevealed(false);
    setTyped("");
  };

  /** 提交答案并揭示 */
  const submitAnswer = (answer: string) => {
    if (!item) return;
    const next = [...items];
    next[index] = { ...item, userAnswer: answer };
    setItems(next);
    setRevealed(true);
  };

  /** 设置掌握度并推进 */
  const confirmMastery = async (mastery: Mastery) => {
    if (!item || busy) return;
    setBusy(true);
    try {
      const grade = masteryToGrade(mastery);
      await applyReview(item.card.id, grade, { source: "quiz" });
      const next = [...items];
      next[index] = { ...next[index], mastery };
      setItems(next);

      if (index + 1 >= items.length) {
        const mastered = next.filter((i) => i.mastery === "mastered").length;
        const fuzzy = next.filter((i) => i.mastery === "fuzzy").length;
        const forgot = next.filter((i) => i.mastery === "forgot").length;
        setResult({
          total: next.length,
          mastered,
          fuzzy,
          forgot,
          aiQuestions: next.filter((i) => i.aiQuestion).length,
        });
        setPhase("done");
      } else {
        setIndex(index + 1);
        setRevealed(false);
        setTyped("");
      }
    } finally {
      setBusy(false);
    }
  };

  // ============ 设置页 ============
  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link to="/study">
              <ArrowLeft className="size-4" />
              返回
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">词库：{deckName}</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>测试模式</CardTitle>
            <CardDescription>
              通过填空与选择检验记忆，掌握度将回填 FSRS 记忆状态（忘记/模糊/掌握 → Again/Hard/Good）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>题型</Label>
              <Select value={configType} onValueChange={(v) => setConfigType(v as QuizType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">混合题型</SelectItem>
                  <SelectItem value="fill-cn2en">填空 · 中译英（输入拼写）</SelectItem>
                  <SelectItem value="choice-cn2en">选择 · 中译英（看释义选单词）</SelectItem>
                  <SelectItem value="choice-en2cn">选择 · 英译中（看单词选释义）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>题目数量</Label>
              <Select value={configCount} onValueChange={setConfigCount}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 题</SelectItem>
                  <SelectItem value="20">20 题</SelectItem>
                  <SelectItem value="all">全部（{cards.length} 张）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5" />
                  AI 出题
                </Label>
                <p className="text-xs text-muted-foreground">
                  {aiReady
                    ? "已检测到 AI 配置，启用后由 AI 生成语境题目（Phase 4 接入）"
                    : "预留接口：在设置页配置 AI（DeepSeek/Ollama）后启用（Phase 4）"}
                </p>
              </div>
              <Switch checked={useAI} onCheckedChange={setUseAI} disabled={!aiReady} />
            </div>

            <Button className="w-full" onClick={startQuiz} disabled={cards.length === 0}>
              开始测试（{cards.length} 张卡片可选）
            </Button>
            {cards.length === 0 && (
              <p className="text-xs text-amber-600">该词库暂无卡片，请先导入或添加</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ 结果页 ============
  if (phase === "done" && result) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="size-10 text-green-500" />
            <CardTitle>测试完成 🎉</CardTitle>
            <CardDescription className="max-w-md">
              共 {result.total} 题 · 掌握 {result.mastered} · 模糊 {result.fuzzy} · 忘记 {result.forgot}
              {result.aiQuestions > 0 && " · AI 出题 " + result.aiQuestions}
            </CardDescription>
            <p className="text-xs text-muted-foreground">
              掌握度已按 FSRS 评分回填记忆状态（忘记=Again / 模糊=Hard / 掌握=Good）
            </p>
            <div className="flex gap-3">
              <Button onClick={() => { setPhase("setup"); setResult(null); }}>
                再测一次
              </Button>
              <Button asChild variant="outline">
                <Link to="/study">返回学习</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ 答题页 ============
  if (!item) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const isFill = item.type === "fill-cn2en";
  const answered = revealed && item.userAnswer !== null;
  const isCorrect =
    answered &&
    item.userAnswer!.trim().toLowerCase() === item.correctAnswer.trim().toLowerCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/study">
            <ArrowLeft className="size-4" />
            退出
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">{QUIZ_TYPE_LABEL[item.type]}</Badge>
          {item.aiQuestion && (
            <Badge className="bg-purple-500/15 text-purple-500">
              <Sparkles className="size-3" /> AI
            </Badge>
          )}
          <span className="text-muted-foreground">第 {index + 1} / {items.length} 题</span>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: ((index / items.length) * 100).toFixed(1) + "%" }}
        />
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          {/* 题目 */}
          {item.aiQuestion ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
              {item.aiQuestion}
            </div>
          ) : isFill ? (
            <div className="space-y-1.5 text-center">
              <CircleHelp className="mx-auto size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">根据释义拼写单词</p>
              <p className="text-2xl font-semibold">{item.card.back}</p>
            </div>
          ) : (
            <div className="space-y-1.5 text-center">
              <CircleHelp className="mx-auto size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {item.type === "choice-cn2en" ? "选择对应的单词" : "选择对应的释义"}
              </p>
              <p className="text-2xl font-semibold">
                {item.type === "choice-cn2en" ? item.card.back : item.card.front}
              </p>
            </div>
          )}

          {/* 填空输入 */}
          {isFill && (
            <div className="space-y-2">
              <Input
                value={typed}
                disabled={revealed}
                placeholder="输入英文单词…"
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typed.trim() && !revealed) submitAnswer(typed.trim());
                }}
                autoFocus
              />
              {!revealed && (
                <Button
                  className="w-full"
                  disabled={!typed.trim()}
                  onClick={() => submitAnswer(typed.trim())}
                >
                  检查答案
                </Button>
              )}
            </div>
          )}

          {/* 选择选项 */}
          {!isFill && !revealed && (
            <div className="grid gap-2">
              {item.options?.map((opt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-3 text-left"
                  onClick={() => submitAnswer(opt)}
                >
                  {opt}
                </Button>
              ))}
            </div>
          )}

          {/* 揭示结果 */}
          {revealed && (
            <div
              className={cn(
                "space-y-3 rounded-lg border p-4",
                isCorrect ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"
              )}
            >
              <div className="flex items-center gap-2">
                {isCorrect ? (
                  <CheckCircle2 className="size-4 text-green-500" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
                <span className="text-sm font-medium">
                  {isCorrect ? "回答正确" : "回答错误"}
                </span>
                {!isCorrect && item.userAnswer && (
                  <span className="text-sm text-muted-foreground line-through">{item.userAnswer}</span>
                )}
              </div>
              <p className="text-sm">
                正确答案：<span className="font-semibold">{item.correctAnswer}</span>
              </p>

              {/* 掌握度评价 */}
              {isFill ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">请评价你的掌握度：</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(MASTERY_META) as Mastery[]).map((m) => (
                      <Button
                        key={m}
                        size="sm"
                        variant={item.mastery === m ? "default" : "outline"}
                        onClick={() => confirmMastery(m)}
                        disabled={busy}
                      >
                        {MASTERY_META[m].label}
                        <span className="ml-1 text-[10px] text-muted-foreground">{MASTERY_META[m].desc}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={item.mastery === "mastered" ? "default" : "outline"}
                    onClick={() => confirmMastery("mastered")}
                    disabled={busy}
                  >
                    掌握 · 继续
                  </Button>
                  <Button
                    size="sm"
                    variant={item.mastery === "forgot" ? "destructive" : "outline"}
                    onClick={() => confirmMastery("forgot")}
                    disabled={busy}
                  >
                    忘记 · 继续
                  </Button>
                </div>
              )}
              {busy && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  正在更新记忆状态…
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        {isFill ? "填空：系统自动对拼写，掌握度由你自评" : "选择题：系统自动判分，可调整掌握度"}
      </p>
    </div>
  );
}
