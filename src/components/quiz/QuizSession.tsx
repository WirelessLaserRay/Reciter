import { useEffect, useMemo, useRef, useState } from "react";
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
import { adaptAIQuestion } from "@/lib/ai-adapter";
import { pickSimilarWords } from "@/lib/similar-words";
import { cn } from "@/lib/utils";
import { optionIndexFromNumberKey } from "@/lib/shortcuts";
import type { Card as CardType } from "@/types";

export type QuizType = "fill-cn2en" | "choice-cn2en" | "choice-en2cn" | "mixed";

type ItemType = "fill-cn2en" | "choice-cn2en" | "choice-en2cn";

interface QuizItem {
  card: CardType;
  type: ItemType;
  options?: string[]; // 选择题选项（含正确答案；AI 出题时可为 AI 选项）
  correctAnswer: string;
  userAnswer: string | null;
  /** AI 生成的题目（适配层处理后的展示文本，无答案泄漏） */
  aiQuestion: string | null;
  /** AI 提供的选项（≥2 个有效时替换本地干扰项） */
  aiOptions: string[] | null;
  /** AI 解析（作答后展示） */
  explanation: string | null;
  /** 原始 AI 回复（存档） */
  aiRaw: string | null;
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

/** 解析卡片标签（tags 为 JSON 字符串） */
function tagsOf(raw: string): string[] {
  try {
    const t = JSON.parse(raw);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(all: CardType[], exclude: CardType, count: number, field: "front" | "back"): string[] {
  const candidates = all.filter((c) => c.id !== exclude.id && c[field] !== exclude[field]);
  const values = candidates.map((c) => c[field]);

  // 英文单词选项优先取形近词（编辑距离 + 前后缀加权），其余随机补足
  const picked: string[] =
    field === "front" ? pickSimilarWords(exclude.front, values, count) : [];

  for (const c of shuffle(candidates)) {
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
      aiOptions: null,
      explanation: null,
      aiRaw: null,
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

export default function QuizSession({
  deckId,
  deckName,
  presetTag,
  defaultUseAI,
  smart,
  onTestComplete,
  onExit,
}: {
  deckId: number;
  deckName: string;
  /** 预设考察标签（标签学习完成后的针对性测试入口） */
  presetTag?: string;
  /** 默认开启 AI 出题（主页 AI 智能测试入口） */
  defaultUseAI?: boolean;
  /** 智能测试：优先选取到期/薄弱/重点卡片 */
  smart?: boolean;
  /** 测试完成回调（用于记录上次测试时间） */
  onTestComplete?: () => void;
  onExit: () => void;
}) {
  const [configType, setConfigType] = useState<QuizType>("mixed");
  const [configCount, setConfigCount] = useState("10");
  const [tagFilter, setTagFilter] = useState(presetTag ?? (smart ? "__learned__" : "all"));
  const [useAI, setUseAI] = useState(defaultUseAI ?? false);
  const [aiReady, setAiReady] = useState(false);
  const [cards, setCards] = useState<CardType[]>([]);
  const [learnedCardIds, setLearnedCardIds] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [items, setItems] = useState<QuizItem[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const aiClientRef = useRef<AIClient | null>(null);

  /** 词库内全部标签（分组），用于"考察范围"筛选 */
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) for (const t of tagsOf(c.tags)) set.add(t);
    return [...set].sort();
  }, [cards]);

  /** 按标签/重点过滤后的卡片池 */
  const pool = useMemo(() => {
    if (tagFilter === "__key__") return cards.filter((c) => c.is_key === 1);
    if (tagFilter === "__learned__") return cards.filter((c) => learnedCardIds.has(c.id));
    return tagFilter === "all" ? cards : cards.filter((c) => tagsOf(c.tags).includes(tagFilter));
  }, [cards, tagFilter, learnedCardIds]);

  const keyCount = useMemo(() => cards.filter((c) => c.is_key === 1).length, [cards]);
  const learnedCount = useMemo(() => cards.filter((c) => learnedCardIds.has(c.id)).length, [cards, learnedCardIds]);

  // 加载词库卡片 + AI 配置状态
  useEffect(() => {
    (async () => {
      const cfg = await getAIConfig();
      const all = await db.getAllCardsWithState();
      const deckStates = all.filter((c) => c.deck_id === deckId);
      setLearnedCardIds(
        new Set(
          deckStates
            .filter((c) => (c.reps ?? 0) > 0 || (c.state ?? 0) !== 0)
            .map((c) => c.card_id)
        )
      );
      let cs: CardType[];
      if (smart) {
        // 智能测试：优先选取遗忘多、到期早、重点词，新卡靠后
        cs = deckStates
          .sort((a, b) => {
            if ((b.lapses ?? 0) !== (a.lapses ?? 0)) return (b.lapses ?? 0) - (a.lapses ?? 0);
            if (a.due !== b.due) return a.due < b.due ? -1 : 1;
            return (b.is_key ?? 0) - (a.is_key ?? 0);
          })
          .map((c) => ({
            id: c.card_id,
            deck_id: c.deck_id,
            front: c.front,
            back: c.back,
            markdown_content: c.markdown_content,
            phonetic: c.phonetic,
            source_type: c.source_type,
            tags: c.tags,
            is_key: c.is_key,
            weak_source: c.weak_source,
            weak_dismissed: c.weak_dismissed,
            created_at: c.created_at,
            updated_at: c.updated_at,
          }));
      } else {
        cs = await db.getCardsByDeck(deckId);
      }
      setCards(cs);
      const client = new AIClient(cfg);
      aiClientRef.current = client;
      setAiReady(client.isReady);
    })().catch(() => {});
  }, [deckId, smart]);

  const item = items[index];
  const isFill = item ? item.type === "fill-cn2en" : false;

  const startQuiz = async () => {
    setPhase("running");
    const n = configCount === "all" ? pool.length : parseInt(configCount, 10);
    const built = buildItems(pool, configType, Math.max(1, Math.min(n, pool.length)));

    // AI 出题（按题型方向单独适配；失败时保留本地题目，不阻断测验）
    if (useAI && aiClientRef.current?.isReady) {
      for (const it of built) {
        try {
          let genType: "cloze" | "context" | "choice" | "example";
          let direction: string | undefined;
          if (it.type === "fill-cn2en") {
            genType = "cloze"; // 填空：生成语境完形（挖空）
          } else if (it.type === "choice-cn2en") {
            genType = "choice"; // 中译英：选项为英文单词
            direction = "看释义选单词";
          } else {
            genType = "choice"; // 英译中：选项为中文释义
            direction = "看单词选释义";
          }
          const q = await aiClientRef.current.generateQuestion({
            front: it.card.front,
            back: it.card.back,
            type: genType,
            direction,
          });
          if (q?.question) {
            const adapted = adaptAIQuestion(q.question, it.type, it.card.front, it.card.back);
            it.aiQuestion = adapted.prompt;
            it.aiOptions = adapted.options ? shuffle(adapted.options) : null;
            it.explanation = adapted.explanation;
            it.aiRaw = adapted.aiRaw;
            it.aiType = genType;
          }
        } catch {
          // AI 出题失败：保留本地题目
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
      await applyReview(item.card.id, grade, {
        source: "quiz",
        aiQuestion: item.aiQuestion ?? null,
        aiAnswer: item.userAnswer ?? null,
      });
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
        onTestComplete?.();
      } else {
        setIndex(index + 1);
        setRevealed(false);
        setTyped("");
      }
    } finally {
      setBusy(false);
    }
  };

  // 键盘快捷键：测试中 1-4 选 ABCD；揭示后 Enter/Y = 确定（掌握），N = 不确定（忘记）；填空 Enter 已由输入框处理
  useEffect(() => {
    if (phase !== "running" || !item) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const interactive = !!target && (target.tagName === "BUTTON" || target.tagName === "SELECT" || target.tagName === "A");
      const options = item.aiOptions ?? item.options;
      if (!revealed && !isFill && options && options.length > 0 && !typing) {
        const idx = optionIndexFromNumberKey(e.key, options.length);
        if (idx !== null) {
          e.preventDefault();
          submitAnswer(options[idx]);
          return;
        }
      }
      if (revealed && !busy && !typing) {
        if (e.key === "Enter") {
          if (interactive) return;
          e.preventDefault();
          void confirmMastery("mastered");
        } else if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          void confirmMastery("mastered");
        } else if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          void confirmMastery("forgot");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, item, revealed, busy, isFill, submitAnswer, confirmMastery]);

  // ============ 设置页 ============
  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeft className="size-4" />
            返回
          </Button>
          <span className="text-sm text-muted-foreground">词库：{deckName}</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>测试模式{smart ? " · 智能优先" : ""}</CardTitle>
            <CardDescription>
              填空与选择题，掌握度回填 FSRS
              {smart ? " · 默认已学词，优先到期/薄弱/重点词" : ""}
              {presetTag && ` · 当前范围：${presetTag}`}
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
              <Label>考察范围</Label>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部卡片（{cards.length} 张）</SelectItem>
                  {learnedCount > 0 && <SelectItem value="__learned__">已学词（{learnedCount} 张）</SelectItem>}
                  {keyCount > 0 && <SelectItem value="__key__">重点词 / 词组（{keyCount} 张）</SelectItem>}
                  {allTags.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}（{cards.filter((c) => tagsOf(c.tags).includes(t)).length} 张）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                按标签分组考察
              </p>
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
                  <SelectItem value="all">全部（{pool.length} 张）</SelectItem>
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
                    ? "已配置 AI，启用后由 AI 生成语境题"
                    : "预留接口：在设置页配置 AI（DeepSeek/Ollama）后启用（Phase 4）"}
                </p>
              </div>
              <Switch checked={useAI} onCheckedChange={setUseAI} disabled={!aiReady} />
            </div>

            <Button className="w-full" onClick={startQuiz} disabled={pool.length === 0}>
              开始测试（{pool.length} 张卡片可选）
            </Button>
            {pool.length === 0 && (
              <p className="text-xs text-amber-600">该范围暂无卡片，请先导入或添加</p>
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
              掌握度已回填 FSRS
            </p>
            <div className="flex gap-3">
              <Button onClick={() => { setPhase("setup"); setResult(null); }}>
                再测一次
              </Button>
              <Button variant="outline" onClick={onExit}>返回学习</Button>
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

  const answered = revealed && item.userAnswer !== null;
  const isCorrect =
    answered &&
    item.userAnswer!.trim().toLowerCase() === item.correctAnswer.trim().toLowerCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft className="size-4" />
          退出
        </Button>
        <div className="flex items-center gap-2 text-sm">
          {item.card.is_key === 1 && (
            <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-500">★ 重点</Badge>
          )}
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
          {/* 题目：AI 出题时显示语境题（无答案泄漏）；否则按题型显示本地提示 */}
          {item.aiQuestion ? (
            <div className="space-y-2">
              <div className="rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
                {item.aiQuestion}
              </div>
              {isFill && (
                <p className="text-center text-xs text-muted-foreground">
                  提示：{item.card.back}（在语境中填出该词）
                </p>
              )}
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

          {/* 选择选项（AI 出题时优先用 AI 选项） */}
          {!isFill && !revealed && (
            <div className="grid gap-2">
              {(item.aiOptions ?? item.options)?.map((opt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="h-auto min-h-12 w-full items-start justify-start gap-2.5 whitespace-normal px-3 py-2.5 text-left"
                  onClick={() => submitAnswer(opt)}
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-normal break-words leading-relaxed">
                    {opt}
                  </span>
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
              {item.explanation && (
                <p className="text-xs text-muted-foreground">💡 {item.explanation}</p>
              )}

              {/* 掌握度评价（红=忘记 / 黄=模糊 / 绿=掌握，掌握恒在最右） */}
              {isFill ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">请评价你的掌握度：</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["forgot", "fuzzy", "mastered"] as Mastery[]).map((m) => (
                      <Button
                        key={m}
                        size="sm"
                        variant="outline"
                        className={cn(
                          m === "forgot" && "border-red-500/50 bg-red-500/10 text-red-600 hover:bg-red-500/20",
                          m === "fuzzy" && "border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
                          m === "mastered" && "border-green-600/60 bg-green-600 text-white hover:bg-green-700",
                          item.mastery === m && "ring-2 ring-ring/50"
                        )}
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
                    variant="outline"
                    className={cn(
                      "border-red-500/50 bg-red-500/10 text-red-600 hover:bg-red-500/20",
                      item.mastery === "forgot" && "ring-2 ring-ring/50"
                    )}
                    onClick={() => confirmMastery("forgot")}
                    disabled={busy}
                  >
                    忘记 · 继续
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "border-green-600/60 bg-green-600 text-white hover:bg-green-700",
                      item.mastery === "mastered" && "ring-2 ring-ring/50"
                    )}
                    onClick={() => confirmMastery("mastered")}
                    disabled={busy}
                  >
                    掌握 · 继续
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
        {isFill ? "填空自评掌握度" : "选择自动判分，可调整掌握度"}
      </p>
    </div>
  );
}
