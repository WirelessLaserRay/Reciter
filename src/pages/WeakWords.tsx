import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Plus, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { db } from "@/lib/db";
import { getLeechThreshold } from "@/lib/settings";
import { getRetrievability } from "@/lib/fsrs";
import { applyReview } from "@/lib/review";
import type { Card as CardType, CardState, Deck } from "@/types";
import AIChatPanel from "@/components/ai/AIChatPanel";

type WeakCard = CardType & CardState;

function parseWeakImportLine(line: string): { front: string; back: string } | null {
  const t = line.trim();
  if (!t) return null;
  const sepIndex = [t.indexOf("\t"), t.indexOf("|"), t.search(/[,，;；]/)]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (sepIndex !== undefined && sepIndex >= 0) {
    const front = t.slice(0, sepIndex).trim();
    return { front, back: t.slice(sepIndex + 1).trim() || front };
  }
  return { front: t, back: t };
}

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
          {weak.weak_source === "manual" ? (
            <Badge variant="secondary">手动添加</Badge>
          ) : (
            <Badge variant="destructive">遗忘 {weak.lapses} 次</Badge>
          )}
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
  const [searchParams] = useSearchParams();
  const [decks, setDecks] = useState<Deck[]>([]);
  // 支持 /weak-words?deck=<id>（词库掌握度全景一键跳转）
  const [deckFilter, setDeckFilter] = useState<string>(() => searchParams.get("deck") ?? "all");
  const [weakCards, setWeakCards] = useState<WeakCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attackTarget, setAttackTarget] = useState<WeakCard | null>(null);
  const [threshold, setThreshold] = useState(3);
  const [importOpen, setImportOpen] = useState(false);
  const [importDeckId, setImportDeckId] = useState("");
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; description?: string; destructive?: boolean } | null>(null);

  const load = useCallback(async (deckId: string) => {
    setLoading(true);
    setError(null);
    try {
      const t = await getLeechThreshold();
      setThreshold(t);
      const allDecks = await db.getDecks();
      setDecks(allDecks);
      // 参数中的词库不存在时回退到「全部词库」
      if (deckId !== "all" && !allDecks.some((d) => String(d.id) === deckId)) {
        setDeckFilter("all");
      }
      const targetDeckId = deckId === "all" ? null : parseInt(deckId, 10);
      let cards: WeakCard[] = [];
      if (targetDeckId) {
        cards = await db.getWeakCards(targetDeckId, t, 100);
      } else {
        const perDeck = await Promise.all(
          allDecks.map((d) => db.getWeakCards(d.id, t, 100))
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

  const handleImport = async () => {
    const deckId = parseInt(importDeckId, 10);
    if (!Number.isFinite(deckId)) {
      setImportError("请先选择要加入的词库");
      return;
    }
    const entries = importText
      .split(/\r?\n/)
      .map(parseWeakImportLine)
      .filter((x): x is { front: string; back: string } => x !== null);
    if (entries.length === 0) {
      setImportError("请输入至少一个单词");
      return;
    }
    setImportBusy(true);
    setImportError(null);
    try {
      await db.importWeakWords(deckId, entries, threshold);
      setImportText("");
      setImportOpen(false);
      setNotice({ title: "导入成功", description: `已添加 ${entries.length} 个单词到弱词本。` });
      void load(deckFilter);
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImportBusy(false);
    }
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
          <CardDescription>lapses ≥ {threshold} 自动收录，或手动添加；手动添加与自动收录会分别标注</CardDescription>
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImportDeckId(deckFilter === "all" ? "" : deckFilter);
                setImportError(null);
                setImportOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              手动添加
            </Button>
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

      <Dialog open={importOpen} onOpenChange={(open) => !open && !importBusy && setImportOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>手动添加弱词</DialogTitle>
            <DialogDescription>
              将单词加入指定词库并直接收录到弱词本（lapses ≥ {threshold}）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>目标词库</Label>
              <Select value={importDeckId} onValueChange={setImportDeckId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择词库" />
                </SelectTrigger>
                <SelectContent>
                  {decks.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weak-import-text">单词列表</Label>
              <Textarea
                id="weak-import-text"
                rows={6}
                placeholder={"每行一个单词\n支持：word\t释义 或 word, 释义"}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                多行批量导入；正面与释义可用 Tab、竖线或逗号分隔
              </p>
            </div>
            {importError && <p className="text-xs text-red-600">{importError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importBusy}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={importBusy || !importText.trim()}>
              {importBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              导入并收录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* 统一提示框 */}
      <ConfirmDialog
        open={notice !== null}
        onOpenChange={(open) => !open && setNotice(null)}
        title={notice?.title ?? ""}
        description={notice?.description}
        confirmLabel="知道了"
        destructive={notice?.destructive}
        onConfirm={() => setNotice(null)}
      />
    </div>
  );
}
