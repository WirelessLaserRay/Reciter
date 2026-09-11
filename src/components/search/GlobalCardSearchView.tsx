import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Volume2,
  Star,
  AlertTriangle,
  ArrowRight,
  Edit2,
  Check,
  Tag,
  Loader2,
  BookOpen,
  Calendar,
  Clock,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db, type GlobalSearchResult } from "@/lib/db";
import type { Deck } from "@/types";
import { speak } from "@/lib/tts";
import { getPureTags, getCardExamples } from "@/lib/card-examples";
import { cn } from "@/lib/utils";

export type SearchScope = "all" | "front" | "back" | "tag";

function formatDueDate(iso: string | null): string {
  if (!iso) return "未安排";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (diffDays < 0) return `已逾期 ${Math.abs(diffDays)} 天`;
    if (diffDays === 0) return "今日到期";
    if (diffDays === 1) return "明日到期";
    return `${diffDays} 天后`;
  } catch {
    return iso;
  }
}

export interface GlobalCardSearchViewProps {
  initialQuery?: string;
  query?: string;
  onQueryChange?: (q: string) => void;
  hideSearchBar?: boolean;
  embedded?: boolean;
  onCardJump?: (item: GlobalSearchResult) => void;
  onClose?: () => void;
}

export default function GlobalCardSearchView({
  initialQuery = "",
  query: controlledQuery,
  onQueryChange,
  hideSearchBar = false,
  embedded = false,
  onCardJump,
  onClose,
}: GlobalCardSearchViewProps) {
  const navigate = useNavigate();

  const [internalInput, setInternalInput] = useState(initialQuery);
  const searchVal = controlledQuery !== undefined ? controlledQuery : internalInput;

  const handleUpdateSearch = (v: string) => {
    if (controlledQuery === undefined) {
      setInternalInput(v);
    }
    onQueryChange?.(v);
  };

  const [scope, setScope] = useState<SearchScope>("all");
  const [selectedDeckId, setSelectedDeckId] = useState<number>(0);
  const [isKeyOnly, setIsKeyOnly] = useState(false);
  const [isWeakOnly, setIsWeakOnly] = useState(false);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeItem, setActiveItem] = useState<GlobalSearchResult | null>(null);

  // 编辑模态状态
  const [editingItem, setEditingItem] = useState<GlobalSearchResult | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editPhonetic, setEditPhonetic] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // 加载词库列表
  useEffect(() => {
    db.getDecks().then(setDecks).catch(() => {});
  }, []);

  // 执行搜索
  const doSearch = useCallback(async (q: string, sc: SearchScope, deckId: number, keyOnly: boolean, weakOnly: boolean) => {
    setLoading(true);
    try {
      const res = await db.searchCardsGlobal({
        query: q,
        scope: sc,
        deckId: deckId > 0 ? deckId : undefined,
        isKeyOnly: keyOnly,
        isWeakOnly: weakOnly,
        limit: 100,
      });
      setResults(res.items);
      setTotalCount(res.total);
      setSelectedIndex(0);
      setActiveItem(res.items[0] ?? null);
    } catch {
      setResults([]);
      setTotalCount(0);
      setActiveItem(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      void doSearch(searchVal, scope, selectedDeckId, isKeyOnly, isWeakOnly);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchVal, scope, selectedDeckId, isKeyOnly, isWeakOnly, doSearch]);

  // 键盘导航
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editingItem) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) {
        const next = (selectedIndex + 1) % results.length;
        setSelectedIndex(next);
        setActiveItem(results[next] ?? null);
        scrollItemIntoView(next);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) {
        const prev = (selectedIndex - 1 + results.length) % results.length;
        setSelectedIndex(prev);
        setActiveItem(results[prev] ?? null);
        scrollItemIntoView(prev);
      }
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      if (activeItem) {
        handleJumpToDeck(activeItem);
      }
    }
  };

  const scrollItemIntoView = (idx: number) => {
    if (!listContainerRef.current) return;
    const el = listContainerRef.current.children[idx] as HTMLElement | undefined;
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  const handleJumpToDeck = (item: GlobalSearchResult) => {
    if (onCardJump) {
      onCardJump(item);
      return;
    }
    onClose?.();
    navigate(`/decks/${item.deck_id}?search=${encodeURIComponent(item.front)}`);
  };

  const handleToggleKey = async (item: GlobalSearchResult, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextKey = item.is_key === 1 ? 0 : 1;
    await db.updateCard(item.id, { is_key: nextKey });
    setResults((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, is_key: nextKey } : c))
    );
    if (activeItem?.id === item.id) {
      setActiveItem((prev) => (prev ? { ...prev, is_key: nextKey } : null));
    }
  };

  const handleToggleWeak = async (item: GlobalSearchResult, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isWeak = (item.lapses ?? 0) >= 3 && item.weak_dismissed === 0;
    if (isWeak) {
      await db.dismissWeakWord(item.id);
      setResults((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, weak_dismissed: 1, lapses: 0 } : c))
      );
      if (activeItem?.id === item.id) {
        setActiveItem((prev) => (prev ? { ...prev, weak_dismissed: 1, lapses: 0 } : null));
      }
    } else {
      await db.markCardWeak(item.id, 3);
      setResults((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, weak_dismissed: 0, lapses: Math.max(c.lapses ?? 0, 3) } : c))
      );
      if (activeItem?.id === item.id) {
        setActiveItem((prev) => (prev ? { ...prev, weak_dismissed: 0, lapses: Math.max(prev.lapses ?? 0, 3) } : null));
      }
    }
  };

  const handleOpenEdit = (item: GlobalSearchResult, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingItem(item);
    setEditFront(item.front);
    setEditBack(item.back);
    setEditPhonetic(item.phonetic || "");
    setEditTags(getPureTags(item.tags).join("、"));
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editFront.trim() || !editBack.trim()) return;
    setSavingEdit(true);
    try {
      const parsedTags = editTags
        .split(/[、,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const existingTags = JSON.parse(editingItem.tags || "[]") as string[];
      const specialTags = existingTags.filter((t) => t.startsWith("ex:") || t.startsWith("例句:"));
      const finalTags = Array.from(new Set([...parsedTags, ...specialTags]));

      await db.updateCard(editingItem.id, {
        front: editFront.trim(),
        back: editBack.trim(),
        phonetic: editPhonetic.trim(),
        tags: JSON.stringify(finalTags),
      });

      const updatedObj = {
        ...editingItem,
        front: editFront.trim(),
        back: editBack.trim(),
        phonetic: editPhonetic.trim(),
        tags: JSON.stringify(finalTags),
      };

      setResults((prev) => prev.map((c) => (c.id === editingItem.id ? updatedObj : c)));
      if (activeItem?.id === editingItem.id) {
        setActiveItem(updatedObj);
      }
      setEditingItem(null);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className={cn(
        "flex flex-col overflow-hidden bg-background",
        embedded
          ? "rounded-xl border border-border/80 shadow-xs min-h-[580px] max-h-[calc(100vh-14rem)] md:max-h-[720px]"
          : "h-full max-h-[88vh]"
      )}
    >
      {/* 顶部搜索与过滤工具条 */}
      <div className="border-b bg-card/60 p-3 sm:p-4 space-y-3 shrink-0">
        {!hideSearchBar && (
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 size-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={searchVal}
              onChange={(e) => handleUpdateSearch(e.target.value)}
              placeholder="全词库查找：输入英文单词、音标、中文释义或标签…"
              className="h-10 pl-10 pr-10 text-sm font-normal shadow-none border-input/80 bg-background/80 focus-visible:ring-1 focus-visible:ring-primary"
            />
            {searchVal ? (
              <button
                type="button"
                onClick={() => {
                  handleUpdateSearch("");
                  inputRef.current?.focus();
                }}
                className="absolute right-3.5 text-muted-foreground hover:text-foreground p-0.5 rounded-full"
                title="清空输入"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        )}

        {/* 快捷过滤工具条 */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* 范围过滤 Tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50">
            {(
              [
                { id: "all", label: "全部" },
                { id: "front", label: "单词" },
                { id: "back", label: "释义" },
                { id: "tag", label: "标签" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-colors",
                  scope === tab.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 词库下拉 & 重点/弱词筛选 */}
          <div className="flex items-center gap-1.5 ml-auto">
            <select
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(Number(e.target.value))}
              className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus:border-primary max-w-40 truncate"
            >
              <option value={0}>全词库 ({decks.length} 个)</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsKeyOnly((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md border text-xs transition-colors",
                isKeyOnly
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              <Star className="size-3" />
              <span>重点</span>
            </button>

            <button
              type="button"
              onClick={() => setIsWeakOnly((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md border text-xs transition-colors",
                isWeakOnly
                  ? "border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-400 font-medium"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              <AlertTriangle className="size-3" />
              <span>弱词</span>
            </button>
          </div>
        </div>
      </div>

      {/* 结果区域（桌面端分栏，移动端上下堆叠） */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x overflow-hidden">
        {/* 左侧：搜索结果列表 */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-1.5 focus:outline-none"
          tabIndex={0}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-xs">全词库极速查找中…</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground px-4">
              <Search className="size-8 opacity-20 mb-2" />
              <p className="text-sm font-medium">
                {searchVal ? "未找到匹配的卡片" : "输入关键词开始全局查找"}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
                支持英汉双向检索、标签搜索、重点词及弱词筛选
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = selectedIndex === idx;
              const isWeak = (item.lapses ?? 0) >= 3 && item.weak_dismissed === 0;
              const pureTags = getPureTags(item.tags);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedIndex(idx);
                    setActiveItem(item);
                  }}
                  onDoubleClick={() => handleJumpToDeck(item)}
                  className={cn(
                    "group flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-all cursor-pointer select-none",
                    isSelected
                      ? "border-primary/50 bg-primary/5 shadow-xs"
                      : "border-transparent bg-card/40 hover:border-border hover:bg-card"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base font-semibold text-foreground truncate">
                        {item.front}
                      </span>
                      {item.phonetic && (
                        <span className="text-xs text-muted-foreground font-sans truncate">
                          {item.phonetic}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          speak(item.front);
                        }}
                        title="发音"
                      >
                        <Volume2 className="size-3" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.is_key === 1 && (
                        <Badge variant="secondary" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0 h-4">
                          重点
                        </Badge>
                      )}
                      {isWeak && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                          弱词 ({item.lapses})
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-border/60">
                        {item.deck_name}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-foreground/80 line-clamp-1 leading-relaxed">
                    {item.back}
                  </p>

                  {pureTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {pureTags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          #{t}
                        </span>
                      ))}
                      {pureTags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground/60">
                          +{pureTags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 右侧：卡片详情与快速操作 */}
        <div className="w-full md:w-80 lg:w-96 shrink-0 bg-muted/15 p-4 overflow-y-auto flex flex-col justify-between">
          {activeItem ? (
            <div className="space-y-4">
              {/* 词头与发音 */}
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                      {activeItem.front}
                    </h2>
                    {activeItem.phonetic && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {activeItem.phonetic}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => speak(activeItem.front)}
                      title="发音"
                    >
                      <Volume2 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={(e) => handleToggleKey(activeItem, e)}
                      title={activeItem.is_key === 1 ? "取消重点" : "设为重点"}
                    >
                      <Star className={cn("size-4", activeItem.is_key === 1 ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={(e) => handleOpenEdit(activeItem, e)}
                      title="编辑卡片"
                    >
                      <Edit2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Badge variant="outline" className="text-xs font-normal">
                    词库：{activeItem.deck_name}
                  </Badge>
                  {activeItem.state !== null && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {activeItem.state === 0 ? "新卡未学" : activeItem.state === 1 ? "学习中" : activeItem.state === 2 ? "复习中" : "已掌握"}
                    </Badge>
                  )}
                </div>
              </div>

              {/* 释义与例句 */}
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  标准释义
                </div>
                <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                  {activeItem.back}
                </div>
              </div>

              {/* 标签 */}
              {getPureTags(activeItem.tags).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Tag className="size-3" />
                    卡片标签
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {getPureTags(activeItem.tags).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 例句展示 */}
              {getCardExamples(activeItem.tags).length > 0 && (
                <div className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <BookOpen className="size-3" />
                    例句与语境
                  </div>
                  <div className="space-y-2">
                    {getCardExamples(activeItem.tags).map((ex, i) => (
                      <div key={i} className="text-xs space-y-0.5 border-l-2 border-primary/40 pl-2">
                        <p className="font-medium text-foreground">{ex.en}</p>
                        <p className="text-muted-foreground">{ex.cn}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 复习状态参数 */}
              <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs space-y-1.5 text-muted-foreground">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Calendar className="size-3" /> 到期安排</span>
                  <span className="font-medium text-foreground">{formatDueDate(activeItem.due)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Clock className="size-3" /> 复习次数</span>
                  <span className="font-medium text-foreground">{activeItem.reps ?? 0} 次（遗忘 {activeItem.lapses ?? 0} 次）</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Layers className="size-3" /> 记忆稳定性</span>
                  <span className="font-medium text-foreground">
                    {activeItem.stability ? `${activeItem.stability.toFixed(1)} 天` : "未定"}
                  </span>
                </div>
              </div>

              {/* 操作动作条 */}
              <div className="pt-2 flex flex-col gap-2">
                <Button
                  onClick={() => handleJumpToDeck(activeItem)}
                  className="w-full gap-2 text-xs h-9"
                >
                  <span>前往词库查看此卡</span>
                  <ArrowRight className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => handleToggleWeak(activeItem, e)}
                  className="w-full text-xs h-8 text-muted-foreground hover:text-foreground"
                >
                  {(activeItem.lapses ?? 0) >= 3 && activeItem.weak_dismissed === 0
                    ? "从弱词本移出"
                    : "标记收录进弱词本"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground py-12 text-center">
              在左侧选择卡片查看详情
            </div>
          )}
        </div>
      </div>

      {/* 底部快捷键提示 */}
      <div className="border-t bg-card/80 px-4 py-2 text-[11px] text-muted-foreground flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span>找到 {totalCount} 张卡片</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline font-mono">↑ / ↓ 选择卡片</span>
          <span className="hidden sm:inline font-mono">Ctrl+Enter 直达词库</span>
        </div>
        {onClose && (
          <div>
            <span className="font-mono">Esc 关闭</span>
          </div>
        )}
      </div>

      {/* 原地编辑卡片小弹窗 */}
      {editingItem && (
        <Dialog open={Boolean(editingItem)} onOpenChange={(v) => !v && setEditingItem(null)}>
          <DialogContent className="max-w-md space-y-4">
            <DialogHeader>
              <DialogTitle>编辑卡片</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">英文正面</label>
                <Input value={editFront} onChange={(e) => setEditFront(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">音标（可选）</label>
                <Input value={editPhonetic} onChange={(e) => setEditPhonetic(e.target.value)} placeholder="/.../" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">中文释义</label>
                <Input value={editBack} onChange={(e) => setEditBack(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">标签（用逗号或顿号隔开）</label>
                <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingItem(null)}>
                取消
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? <Loader2 className="size-4 animate-spin mr-1" /> : <Check className="size-4 mr-1" />}
                保存更新
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
