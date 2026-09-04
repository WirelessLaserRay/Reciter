import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BookOpen, ClipboardList, Loader2, Pencil, Plus, RotateCcw, Search, Sparkles, Star, Trash2, Volume2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { db, type DeckWeakWord, type MasteryDistribution } from "@/lib/db";
import { getLeechThreshold } from "@/lib/settings";
import { speak } from "@/lib/tts";
import MasteryOverview from "@/components/deck/MasteryOverview";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTaskStore } from "@/stores/useTaskStore";
import {
  getPureTags,
  getCardExamples,
  setCardExamplesToTags,
  matchExamplesForCard,
  type CardExampleItem,
} from "@/lib/card-examples";
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
  const [showIgnored, setShowIgnored] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);
  const startPhoneticEnrichment = useTaskStore((s) => s.startPhoneticEnrichment);
  const startMeaningSplit = useTaskStore((s) => s.startMeaningSplit);
  const startExampleMatching = useTaskStore((s) => s.startExampleMatching);
  const cancelTask = useTaskStore((s) => s.cancelTask);

  const phoneticTask = tasks[`phonetic_${deckId}`];
  const meaningTask = tasks[`meaning_split_${deckId}`];
  const exampleTask = tasks[`match_examples_${deckId}`];

  const phoneticBusy = phoneticTask?.status === "running";
  const aiScanning = meaningTask?.status === "running";
  const exampleBusy = exampleTask?.status === "running";

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<CardType | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editMeaningPrimary, setEditMeaningPrimary] = useState("");
  const [editMeaningSecondary, setEditMeaningSecondary] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editExamples, setEditExamples] = useState<CardExampleItem[]>([]);
  const [matchingSingleExample, setMatchingSingleExample] = useState(false);
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

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ deckId: number }>;
      if (custom.detail?.deckId === deckId) {
        load(true);
      }
    };
    window.addEventListener("reciter:deck-data-updated", handler);
    return () => window.removeEventListener("reciter:deck-data-updated", handler);
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
    setEditMeaningPrimary(c.meaning_primary ?? "");
    setEditMeaningSecondary(c.meaning_secondary ?? "");
    setEditTags(getPureTags(c.tags).join("、"));
    setEditExamples(getCardExamples(c.tags));
    setEditKey(c.is_key === 1);
  };

  const handleMatchSingleExample = async () => {
    if (!editFront.trim()) return;
    setMatchingSingleExample(true);
    try {
      const ex = await matchExamplesForCard({
        front: editFront.trim(),
        back: editBack.trim(),
        meaning_primary: editMeaningPrimary.trim(),
        meaning_secondary: editMeaningSecondary.trim(),
      });
      if (ex.length > 0) {
        setEditExamples(ex);
      } else {
        setNotice({ title: "未匹配到例句", description: "未获取到该词的不同释义例句，可能是网络异常或词典/AI 接口无结果" });
      }
    } catch (err) {
      setNotice({ title: "匹配失败", description: String(err), destructive: true });
    } finally {
      setMatchingSingleExample(false);
    }
  };

  const saveEdit = async () => {
    if (!editTarget || !editFront.trim() || !editBack.trim()) return;
    setEditBusy(true);
    try {
      const tagArr = editTags
        .split(/[、,，;；]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const combinedTags = setCardExamplesToTags(tagArr, editExamples);
      await db.updateCard(editTarget.id, {
        front: editFront.trim(),
        back: editBack.trim(),
        meaning_primary: editMeaningPrimary.trim(),
        meaning_secondary: editMeaningSecondary.trim(),
        tags: JSON.stringify(combinedTags),
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

  const restoreCard = async (card: CardType) => {
    await db.updateCard(card.id, { ignored: 0 });
    load(true);
  };

  const runAiScan = () => {
    if (!deck) return;
    startMeaningSplit(deckId, deck.name);
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

  const fillMissingPhonetics = () => {
    if (!deck) return;
    startPhoneticEnrichment(deckId, deck.name);
  };

  const matchExamples = () => {
    if (!deck) return;
    startExampleMatching(deckId, deck.name);
  };

  const missingPhoneticCount = cards.filter((c) => !c.phonetic).length;
  const deferredSearch = useDeferredValue(search);
  const filtered = cards.filter(
    (c) =>
      (showIgnored ? c.ignored === 1 : c.ignored === 0) &&
      (!deferredSearch || c.front.toLowerCase().includes(deferredSearch.toLowerCase()) || c.back.includes(deferredSearch)) &&
      (!keyFilter || c.is_key === 1)
  );

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
          <Button
            size="sm"
            variant="outline"
            onClick={runAiScan}
            disabled={aiScanning}
            title="按当前词汇标准拆分主要/次要释义"
          >
            {aiScanning ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {aiScanning ? `扫描释义 (${meaningTask?.done ?? 0}/${meaningTask?.total ?? 0})` : "AI 扫描释义"}
          </Button>
          {aiScanning && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => cancelTask(meaningTask!.id)}
              title="取消释义扫描"
            >
              取消
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={matchExamples}
            disabled={exampleBusy}
            title="为词库卡片自动匹配最多 3 句不同释义的英文例句并写入标签"
          >
            {exampleBusy ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
            {exampleBusy ? `匹配例句 (${exampleTask?.done ?? 0}/${exampleTask?.total ?? 0})` : "匹配例句"}
          </Button>
          {exampleBusy && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => cancelTask(exampleTask!.id)}
              title="取消例句匹配"
            >
              取消
            </Button>
          )}

          <Button
            size="sm"
            variant={showIgnored ? "secondary" : "outline"}
            onClick={() => setShowIgnored((v) => !v)}
          >
            {showIgnored ? "查看正常" : "已忽略"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/study?quiz=${deckId}`)}>
            <ClipboardList className="size-3.5" />
            高级测试
          </Button>
        </div>
      </div>
      {(meaningTask?.message || exampleTask?.message || phoneticTask?.message) && (
        <p className="text-xs text-muted-foreground">
          {meaningTask?.message || exampleTask?.message || phoneticTask?.message}
        </p>
      )}

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

      {/* 缺少音标提示 */}
      {(missingPhoneticCount > 0 || phoneticBusy) && (
        <Card className="border-amber-500/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-sm">
              {phoneticBusy ? (
                <>
                  正在为该词库补齐音标（已处理{" "}
                  <span className="font-semibold text-amber-500">{phoneticTask?.done ?? 0}</span> /{" "}
                  {phoneticTask?.total ?? 0}）
                </>
              ) : (
                <>
                  有 <span className="font-semibold text-amber-500">{missingPhoneticCount}</span> 个单词缺少音标
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={fillMissingPhonetics} disabled={phoneticBusy}>
                {phoneticBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {phoneticBusy ? "后台补齐中" : "自动补齐音标"}
              </Button>
              {phoneticBusy && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => cancelTask(phoneticTask!.id)}
                >
                  取消
                </Button>
              )}
            </div>
            {phoneticBusy && phoneticTask && (
              <p className="w-full text-xs text-muted-foreground">
                后台补齐音标中：{phoneticTask.done} / {phoneticTask.total}
                {phoneticTask.currentWord ? `（当前单词：${phoneticTask.currentWord}）` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
                    <th className="px-3 py-2">单词/词组</th>
                    <th className="px-3 py-2">释义</th>
                    <th className="px-3 py-2">标签</th>
                    <th className="w-14 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const pureTags = getPureTags(c.tags);
                    const cardExamples = getCardExamples(c.tags);
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="max-w-44 px-3 py-2 font-medium" title={c.front}>
                          <div className="flex items-start gap-1">
                            {c.is_key === 1 && <Star className="mt-0.5 inline size-3 shrink-0 text-amber-500" />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="truncate">{c.front}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 shrink-0"
                                  onClick={() => speak(c.front)}
                                  title="发音"
                                >
                                  <Volume2 className="size-3.5" />
                                </Button>
                              </div>
                              {c.phonetic && (
                                <div className="text-[10px] text-muted-foreground">{c.phonetic}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="max-w-md px-3 py-2" title={c.back}>
                          <div className="truncate font-medium">{c.meaning_primary || c.back}</div>
                          {c.meaning_secondary && (
                            <div className="truncate text-muted-foreground">{c.meaning_secondary}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {pureTags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                            {cardExamples.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className="cursor-pointer border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] hover:bg-blue-500/20"
                                  >
                                    <BookOpen className="mr-0.5 inline size-2.5" />
                                    {cardExamples.length}例句
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs space-y-1.5 p-2.5 text-xs">
                                  <p className="font-semibold text-primary">已匹配不同释义例句：</p>
                                  {cardExamples.map((ex, idx) => (
                                    <div key={idx} className="border-b border-border/50 pb-1 last:border-0 last:pb-0">
                                      {ex.sense && <span className="font-medium text-amber-600 dark:text-amber-400 mr-1">[{ex.sense}]</span>}
                                      <span className="text-foreground">“{ex.en}”</span>
                                      {ex.cn && <div className="text-[11px] text-muted-foreground">{ex.cn}</div>}
                                    </div>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
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
                          {c.ignored === 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-green-600"
                              onClick={() => restoreCard(c)}
                              title="恢复卡片"
                            >
                              <RotateCcw className="size-3.5" />
                            </Button>
                          )}
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3 pr-10 shrink-0 border-b">
            <DialogTitle>编辑卡片</DialogTitle>
            <DialogDescription>修改单词、释义与标签</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto p-5 flex-1 min-h-0">
            <div className="space-y-1.5">
              <Label htmlFor="edit-front">单词 / 短语</Label>
              <Input id="edit-front" value={editFront} onChange={(e) => setEditFront(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-back">释义</Label>
              <Input id="edit-back" value={editBack} onChange={(e) => setEditBack(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-primary">主要释义（加粗展示）</Label>
                <Input id="edit-primary" value={editMeaningPrimary} onChange={(e) => setEditMeaningPrimary(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-secondary">次要释义（第二栏）</Label>
                <Input id="edit-secondary" value={editMeaningSecondary} onChange={(e) => setEditMeaningSecondary(e.target.value)} />
              </div>
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

            {/* 多释义例句标签 */}
            <div className="space-y-2 rounded-md border p-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <BookOpen className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">匹配例句标签（最多 3 句不同释义）</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={handleMatchSingleExample}
                  disabled={matchingSingleExample || !editFront.trim()}
                >
                  {matchingSingleExample ? <Loader2 className="size-3 animate-spin mr-1" /> : <Sparkles className="size-3 mr-1" />}
                  {matchingSingleExample ? "匹配中..." : "AI 匹配例句"}
                </Button>
              </div>
              {editExamples.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无匹配例句标签。可点击右上角「AI 匹配例句」自动生成并写入标签。</p>
              ) : (
                <div className="space-y-2">
                  {editExamples.map((ex, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 rounded border bg-background/50 p-2 text-xs">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ex.sense && (
                            <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                              {ex.sense}
                            </span>
                          )}
                          <span className="font-medium truncate min-w-0 flex-1" title={ex.en}>“{ex.en}”</span>
                        </div>
                        {ex.cn && <p className="text-muted-foreground truncate" title={ex.cn}>{ex.cn}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setEditExamples((prev) => prev.filter((_, i) => i !== idx))}
                        title="移除此句"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
          <DialogFooter className="p-4 m-0 shrink-0 border-t bg-muted/50">
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

      {/* 音标补齐改为后台进行，进度显示在缺失音标提示卡片内 */}

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
