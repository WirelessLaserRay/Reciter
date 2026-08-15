import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { getRetrievability } from "@/lib/fsrs";
import { applyReview } from "@/lib/review";
import type { Card as CardType, CardState, Deck } from "@/types";
import AIChatPanel from "@/components/ai/AIChatPanel";

type WeakCard = CardType & CardState;

function WeakRow({
  weak,
  onAttack,
}: {
  weak: WeakCard;
  onAttack: (w: WeakCard) => void;
}) {
  const [retrievability, setRetrievability] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRetrievability(weak)
      .then((r) => {
        if (!cancelled) setRetrievability(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [weak]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{weak.front}</span>
          <Badge variant="destructive">遗忘 {weak.lapses} 次</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{weak.back}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          上次复习：{weak.last_review ? new Date(weak.last_review).toLocaleString("zh-CN") : "从未"}
          {retrievability !== null && ` · 可检索度 ${(retrievability * 100).toFixed(0)}%`}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onAttack(weak)}>
        <Sparkles className="size-3.5" />
        AI 攻克
      </Button>
    </div>
  );
}

export default function WeakWords() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [weakCards, setWeakCards] = useState<WeakCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attackTarget, setAttackTarget] = useState<WeakCard | null>(null);

  const load = useCallback(async (deckId: string) => {
    setLoading(true);
    setError(null);
    try {
      const allDecks = await db.getDecks();
      setDecks(allDecks);
      const targetDeckId = deckId === "all" ? null : parseInt(deckId, 10);
      let cards: WeakCard[] = [];
      if (targetDeckId) {
        cards = await db.getWeakCards(targetDeckId, 2, 100);
      } else {
        const perDeck = await Promise.all(
          allDecks.map((d) => db.getWeakCards(d.id, 2, 100))
        );
        cards = perDeck.flat().sort((a, b) => b.lapses - a.lapses || a.stability - b.stability);
      }
      setWeakCards(cards);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(deckFilter);
  }, [deckFilter, load]);

  const handleAttack = (w: WeakCard) => setAttackTarget(w);

  const handleGradeDecided = async (
    grade: 1 | 2 | 3 | 4,
    question?: string,
    answer?: string
  ) => {
    if (!attackTarget) return;
    try {
      await applyReview(attackTarget.card_id, grade, {
        source: "ai_test",
        aiQuestion: question ?? null,
        aiAnswer: answer ?? null,
      });
    } catch (e) {
      console.error(e);
    }
    setAttackTarget(null);
    void load(deckFilter);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">弱词本</h2>
          <p className="text-sm text-muted-foreground">
            反复遗忘的词，优先 AI 攻克
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="size-3.5" />
            返回首页
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            弱词列表
          </CardTitle>
          <CardDescription>lapses ≥ 2 自动收录，按严重程度排序</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Select value={deckFilter} onValueChange={setDeckFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="全部词库" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部词库</SelectItem>
                {decks.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {weakCards.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => handleAttack(weakCards[0])}>
                <Sparkles className="size-3.5" />
                一键 AI 攻克
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : weakCards.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无弱词，继续保持 🎉
            </p>
          ) : (
            <div className="space-y-2">
              {weakCards.map((w) => (
                <WeakRow key={w.card_id} weak={w} onAttack={handleAttack} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={attackTarget !== null} onOpenChange={(open) => !open && setAttackTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-purple-500" />
              AI 攻克 · {attackTarget?.front}
            </DialogTitle>
            <DialogDescription>{attackTarget?.back}</DialogDescription>
          </DialogHeader>
          {attackTarget && (
            <AIChatPanel
              front={attackTarget.front}
              back={attackTarget.back}
              cardState={attackTarget}
              defaultExpanded
              onGradeDecided={handleGradeDecided}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
