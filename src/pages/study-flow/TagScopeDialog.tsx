import { useEffect, useState } from "react";
import { Layers, Loader2, RefreshCw, Shuffle, Star, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { getDeckShuffle, saveDeckShuffle } from "@/lib/study-prefs";
import { cn } from "@/lib/utils";
import type { TagScopeDialogProps } from "./types";

/** 学习范围设置弹窗（以 Dialog 替代原先突兀的页面级全屏跳转） */
export function TagScopeDialog({ deck, open, onOpenChange, onStart }: TagScopeDialogProps) {
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | undefined>(undefined);
  const [selectedKeyOnly, setSelectedKeyOnly] = useState(false);

  useEffect(() => {
    if (!open || !deck) return;
    setLoading(true);
    setSelectedTag(undefined);
    setSelectedKeyOnly(false);
    Promise.all([
      db.getDeckTagsWithCount(deck.id),
      db.getDeckKeyCount(deck.id),
      getDeckShuffle(deck.id),
    ])
      .then(([t, k, s]) => {
        setTags(t);
        setTotal(t.reduce((acc, x) => acc + x.count, 0));
        setKeyCount(k);
        setShuffle(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, deck]);

  const toggleShuffle = async (v: boolean) => {
    if (!deck) return;
    setShuffle(v);
    await saveDeckShuffle(deck.id, v).catch(() => {});
  };

  const handleStart = () => {
    onOpenChange(false);
    onStart(selectedTag, selectedKeyOnly);
  };

  if (!deck) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[calc(100%-2rem)] p-4 sm:p-6 gap-3">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Layers className="size-4 text-primary" />
            选择学习范围
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            词库：{deck.name} · 共 {total} 张卡片
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            <Loader2 className="size-4 animate-spin mr-2" />
            读取标签范围...
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {/* 全部卡片 */}
              <button
                type="button"
                onClick={() => {
                  setSelectedTag(undefined);
                  setSelectedKeyOnly(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all text-sm cursor-pointer",
                  !selectedTag && !selectedKeyOnly
                    ? "border-primary bg-primary/10 text-primary font-medium shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                )}
              >
                <span className="flex items-center gap-2">
                  <Layers className="size-4" />
                  全部卡片
                </span>
                <Badge variant={!selectedTag && !selectedKeyOnly ? "default" : "secondary"} className="text-xs">
                  {total} 张
                </Badge>
              </button>

              {/* 重点词 */}
              {keyCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTag(undefined);
                    setSelectedKeyOnly(true);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all text-sm cursor-pointer",
                    selectedKeyOnly
                      ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium shadow-xs"
                      : "border-amber-500/30 hover:bg-amber-500/5 text-foreground"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Star className="size-4 text-amber-500" />
                    重点词 / 词组
                  </span>
                  <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                    {keyCount} 张
                  </Badge>
                </button>
              )}

              {/* 具体标签分类 */}
              {tags.map((t) => {
                const isSelected = selectedTag === t.tag;
                return (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => {
                      setSelectedTag(t.tag);
                      setSelectedKeyOnly(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-all text-sm cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-medium shadow-xs"
                        : "border-border hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Tag className="size-4 shrink-0" />
                      <span className="truncate">{t.tag}</span>
                    </span>
                    <Badge variant={isSelected ? "default" : "secondary"} className="text-xs shrink-0">
                      {t.count} 张
                    </Badge>
                  </button>
                );
              })}

              {tags.length === 0 && keyCount === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  该词库未设置细分标签，将学习全部卡片
                </p>
              )}
            </div>

            {/* 乱序学习设置 */}
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-muted/20">
              <div className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-xs sm:text-sm font-medium">
                  <Shuffle className="size-3.5 text-muted-foreground" />
                  乱序学习
                </p>
                <p className="text-[11px] text-muted-foreground">打乱卡片顺序（按词库记忆）</p>
              </div>
              <Switch checked={shuffle} onCheckedChange={(v) => void toggleShuffle(v)} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            取消
          </Button>
          <Button size="sm" onClick={handleStart} className="flex-1 sm:flex-none">
            <RefreshCw className="size-3.5 mr-1.5" />
            开始学习
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
