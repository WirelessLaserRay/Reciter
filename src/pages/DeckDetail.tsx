import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { db } from "@/lib/db";
import type { Card as CardType, Deck } from "@/types";

export default function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const deckId = Number(id);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<CardType[]>([]);
  const [progress, setProgress] = useState({ learned: 0, due: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, cs, pg] = await Promise.all([
        db.getDeck(deckId),
        db.getCardsByDeck(deckId),
        db.getDeckProgress(deckId),
      ]);
      setDeck(d);
      setCards(cs);
      setProgress(pg);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    if (Number.isFinite(deckId)) load();
  }, [deckId, load]);

  const addCard = async () => {
    if (!front.trim() || !back.trim()) return;
    setAdding(true);
    try {
      const res = await db.upsertCard({
        deckId,
        front: front.trim(),
        back: back.trim(),
        sourceType: "manual",
      });
      if (!res.created) window.alert("该单词已存在于词库中，已更新其释义。");
      setFront("");
      setBack("");
      load();
    } finally {
      setAdding(false);
    }
  };

  const deleteCard = async (cardId: number) => {
    if (!window.confirm("删除这张卡片？")) return;
    await db.deleteCard(cardId);
    load();
  };

  const filtered = cards.filter(
    (c) => !search || c.front.toLowerCase().includes(search.toLowerCase()) || c.back.includes(search)
  );

  const tagsOf = (c: CardType): string[] => {
    try {
      const t = JSON.parse(c.tags);
      return Array.isArray(t) ? t : [];
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/decks">
            <ArrowLeft className="size-4" />
            返回词库列表
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">词库不存在</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/decks">
            <ArrowLeft className="size-4" />
            返回词库列表
          </Link>
        </Button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Badge variant="secondary">{cards.length} 张卡片</Badge>
          <span>已学习 {progress.learned}</span>
          <span>待复习 {progress.due}</span>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold">{deck.name}</h2>
        <p className="text-sm text-muted-foreground">{deck.description || "暂无描述"}</p>
      </div>

      {/* 手动添加卡片 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>添加卡片</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="card-front">单词 / 短语</Label>
              <Input
                id="card-front"
                placeholder="abandon"
                value={front}
                onChange={(e) => setFront(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCard()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-back">释义</Label>
              <Input
                id="card-back"
                placeholder="放弃；抛弃"
                value={back}
                onChange={(e) => setBack(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCard()}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addCard} disabled={!front.trim() || !back.trim() || adding}>
                {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-4" />}
                添加
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 卡片列表 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>卡片列表</CardTitle>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="搜索单词或释义"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <CardDescription>按 (deck_id, front) 去重，重复导入自动更新</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search ? "没有匹配的卡片" : "词库还是空的，请添加或导入卡片"}
            </p>
          ) : (
            <ScrollArea className="h-96 rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">单词</th>
                    <th className="px-3 py-2">释义</th>
                    <th className="px-3 py-2">标签</th>
                    <th className="w-14 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const tags = tagsOf(c);
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="max-w-44 truncate px-3 py-2 font-medium" title={c.front}>
                          {c.front}
                        </td>
                        <td className="max-w-md truncate px-3 py-2 text-muted-foreground" title={c.back}>
                          {c.back}
                        </td>
                        <td className="px-3 py-2">
                          {tags.map((t) => (
                            <Badge key={t} variant="secondary" className="mr-1 text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteCard(c.id)}
                            title="删除卡片"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
