import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ClipboardList, Loader2, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db, type DeckWeakWord, type MasteryDistribution } from "@/lib/db";
import { getLeechThreshold } from "@/lib/settings";
import MasteryOverview from "@/components/deck/MasteryOverview";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Card as CardType, Deck } from "@/types";

export default function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const deckId = Number(id);
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<CardType[]>([]);
  const [progress, setProgress] = useState({ learned: 0, due: 0 });
  const [mastery, setMastery] = useState<MasteryDistribution | null>(null);
  const [topWeak, setTopWeak] = useState<DeckWeakWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<CardType | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editKey, setEditKey] = useState(false);
  const [notice, setNotice] = useState<{ title: string; description?: string; destructive?: boolean } | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<CardType | null>(null);
  const [confirmWeakTarget, setConfirmWeakTarget] = useState<CardType | null>(null);
  const [keyFilter, setKeyFilter] = useState(false);

  /**
   * 加载词库数据。
   * silent=true（编辑/删除/添加后刷新）：不切换 loading 占位，避免 ScrollArea 重挂导致滚动位置丢失。
   */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const threshold = await getLeechThreshold();
      const [d, cs, pg, dist, weak] = await Promise.all([
        db.getDeck(deckId),
        db.getCardsByDeck(deckId),
        db.getDeckProgress(deckId),
        db.getDeckMasteryDistribution(deckId, threshold),
        db.getDeckTopWeakWords(deckId, threshold, 5),
      ]);
      setDeck(d);
      setCards(cs);
      setProgress(pg);
      setMastery(dist);
      setTopWeak(weak);
    } finally {
      if (!silent) setLoading(false);
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
      if (!res.created) setNotice({ title: "提示", description: "该单词已存在于词库中，已更新其释义。" });
      setFront("");
      setBack("");
      load(true);
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (c: CardType) => {
    setEditTarget(c);
    setEditFront(c.front);
    setEditBack(c.back);
    setEditTags(tagsOf(c).join("、"));
    setEditKey(c.is_key === 1);
  };

  const saveEdit = async () => {
    if (!editTarget || !editFront.trim() || !editBack.trim()) return;
    setEditBusy(true);
    try {
      const tagArr = editTags
        .split(/[、,，;；]/)
        .map((t) => t.trim())
        .filter(Boolean);
      await db.updateCard(editTarget.id, {
        front: editFront.trim(),
        back: editBack.trim(),
        tags: JSON.stringify(tagArr),
        is_key: editKey ? 1 : 0,
      });
      setEditTarget(null);
      load(true);
    } finally {
      setEditBusy(false);
    }
  };

  const deleteCard = (card: CardType) => {
    setConfirmDeleteTarget(card);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteTarget) return;
    await db.deleteCard(confirmDeleteTarget.id);
    setConfirmDeleteTarget(null);
    load(true);
  };

  const addToWeakBook = (card: CardType) => {
    setConfirmWeakTarget(card);
  };

  const confirmAddWeak = async () => {
    if (!confirmWeakTarget) return;
    try {
      const threshold = await getLeechThreshold();
      await db.markCardWeak(confirmWeakTarget.id, threshold);
      setConfirmWeakTarget(null);
      load(true);
      setNotice({ title: "已加入弱词本", description: `「${confirmWeakTarget.front}」已收录到弱词本。` });
    } catch (e) {
      setConfirmWeakTarget(null);
      setNotice({ title: "操作失败", description: String(e), destructive: true });
    }
  };

  const deferredSearch = useDeferredValue(search);
  const filtered = cards.filter(
    (c) =>
      (!deferredSearch || c.front.toLowerCase().includes(deferredSearch.toLowerCase()) || c.back.includes(deferredSearch)) &&
      (!keyFilter || c.is_key === 1)
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
          <Button variant="outline" size="sm" onClick={() => navigate(`/study?quiz=${deckId}`)}>
            <ClipboardList className="size-3.5" />
            高级测试
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold">{deck.name}</h2>
        <p className="text-sm text-muted-foreground">{deck.description || "暂无描述"}</p>
      </div>

      {/* Phase 6C：词库掌握度全景 */}
      {mastery && (
        <MasteryOverview distribution={mastery} weakWords={topWeak} deckId={deckId} />
      )}

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
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={keyFilter ? "default" : "outline"}
                className="text-xs"
                onClick={() => setKeyFilter((v) => !v)}
              >
                <Star className={keyFilter ? "size-3.5" : "size-3.5 text-amber-500"} />
                重点
              </Button>
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
                          {c.is_key === 1 && <Star className="mr-1 inline size-3 text-amber-500" />}
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
                            className="size-7 text-muted-foreground hover:text-amber-500"
                            onClick={() => addToWeakBook(c)}
                            title="加入弱词本"
                          >
                            <AlertTriangle className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            onClick={() => openEdit(c)}
                            title="编辑卡片"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteCard(c)}
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
      {/* 编辑卡片对话框 */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑卡片</DialogTitle>
            <DialogDescription>修改单词、释义与标签</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-front">单词 / 短语</Label>
              <Input id="edit-front" value={editFront} onChange={(e) => setEditFront(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-back">释义</Label>
              <Input id="edit-back" value={editBack} onChange={(e) => setEditBack(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-tags">标签（用 、 或逗号分隔）</Label>
              <Input
                id="edit-tags"
                placeholder="如：单词、词组"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
              />
            </div>
            <label className="flex cursor-pointer items-center justify-between rounded-md border p-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Star className="size-3.5 text-amber-500" />
                  重点词 / 词组
                </div>
                <p className="text-xs text-muted-foreground">导入时由黑体释义自动识别，可手动调整</p>
              </div>
              <input
                type="checkbox"
                checked={editKey}
                onChange={(e) => setEditKey(e.target.checked)}
                className="size-4 accent-primary"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              取消
            </Button>
            <Button onClick={saveEdit} disabled={!editFront.trim() || !editBack.trim() || editBusy}>
              {editBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
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

      {/* 删除卡片确认 */}
      <ConfirmDialog
        open={confirmDeleteTarget !== null}
        onOpenChange={(open) => !open && setConfirmDeleteTarget(null)}
        title="删除卡片"
        description={confirmDeleteTarget ? `确定要删除「${confirmDeleteTarget.front}」吗？此操作不可撤销。` : ""}
        destructive
        confirmLabel="确认删除"
        cancelLabel="取消"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteTarget(null)}
      />

      {/* 加入弱词本确认 */}
      <ConfirmDialog
        open={confirmWeakTarget !== null}
        onOpenChange={(open) => !open && setConfirmWeakTarget(null)}
        title="加入弱词本"
        description={confirmWeakTarget ? `确定将「${confirmWeakTarget.front}」加入弱词本吗？将标记为重点词并提升遗忘次数。` : ""}
        confirmLabel="加入"
        cancelLabel="取消"
        onConfirm={confirmAddWeak}
        onCancel={() => setConfirmWeakTarget(null)}
      />
    </div>
  );
}
