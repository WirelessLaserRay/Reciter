import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Check, Download, Loader2, Pencil, Plus, Square, Trash2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { exportDecksToJSON } from "@/lib/backup";
import { cn } from "@/lib/utils";
import { useDeckStore } from "@/stores/useDeckStore";
import { useDbStore } from "@/stores/useDbStore";

export default function DeckList() {
  const { decks, cardCounts, loading, error, refresh } = useDeckStore();
  const dbReady = useDbStore((s) => s.ready);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createFolder, setCreateFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string; description: string; folder: string } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDesc, setRenameDesc] = useState("");
  const [renameFolder, setRenameFolder] = useState("");
  const [renameQuota, setRenameQuota] = useState(20);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; cards: number } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<number>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (dbReady) refresh();
  }, [dbReady, refresh]);

  const createDeck = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await db.createDeck(name.trim(), description.trim(), undefined, createFolder.trim());
      setName("");
      setDescription("");
      setCreateFolder("");
      setShowCreate(false);
      refresh();
    } finally {
      setCreating(false);
    }
  };

  const openRename = (id: number, name: string, description: string, newPerDay?: number, folder = "") => {
    setRenameTarget({ id, name, description, folder });
    setRenameName(name);
    setRenameDesc(description);
    setRenameFolder(folder);
    setRenameQuota(newPerDay ?? 20);
    setRenameError(null);
  };

  const saveRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      await db.updateDeck(renameTarget.id, {
        name: renameName.trim(),
        description: renameDesc.trim(),
        folder: renameFolder.trim(),
        new_cards_per_day: renameQuota > 0 ? renameQuota : 20,
      });
      setRenameTarget(null);
      refresh();
    } catch (e) {
      setRenameError(String(e));
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await db.deleteDeck(deleteTarget.id);
      refresh();
    } finally {
      setDeleteBusy(false);
      setDeleteTarget(null);
    }
  };

  const toggleSelectDeck = (id: number) => {
    setSelectedDeckIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportDecks = async () => {
    if (selectedDeckIds.size === 0) return;
    setExportBusy(true);
    setExportMsg(null);
    const r = await exportDecksToJSON([...selectedDeckIds]);
    setExportBusy(false);
    setExportMsg(r.message);
    if (r.ok) setSelectedDeckIds(new Set());
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">词库</h2>
          <p className="text-sm text-muted-foreground">
            共 {decks.length} 个词库 · {Object.values(cardCounts).reduce((a, b) => a + b, 0)} 张卡片
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedDeckIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportDecks} disabled={exportBusy}>
              {exportBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              导出所选（{selectedDeckIds.size}）
            </Button>
          )}
          <Button onClick={() => setShowCreate((v) => !v)}>
            <Plus className="size-4" />
            新建词库
          </Button>
        </div>
      </div>

      {exportMsg && (
        <p className="text-xs text-muted-foreground">{exportMsg}</p>
      )}

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="deck-name">词库名称</Label>
                <Input
                  id="deck-name"
                  placeholder="如：考研核心词汇"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createDeck()}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deck-desc">描述（可选）</Label>
                <Input
                  id="deck-desc"
                  placeholder="词库说明"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createDeck()}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deck-folder">文件夹（可选，支持多级如 考试/四级）</Label>
              <Input
                id="deck-folder"
                placeholder="留空为根目录"
                value={createFolder}
                onChange={(e) => setCreateFolder(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createDeck()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                取消
              </Button>
              <Button size="sm" onClick={createDeck} disabled={!name.trim() || creating}>
                {creating ? <Loader2 className="size-3.5 animate-spin" /> : null}
                创建
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !decks.length && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && decks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <CardTitle>还没有词库</CardTitle>
            <CardDescription className="max-w-sm">
              通过「导入」页面可批量导入 Markdown / CSV 词库（支持 templates 样式），
              或在上方创建空白词库手动添加卡片。
            </CardDescription>
            <Button asChild variant="outline">
              <Link to="/import">前往导入</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {decks.length > 0 && (
        <div className="space-y-6">
          {[...new Set(decks.map((d) => d.folder || ""))]
            .sort()
            .map((folder) => (
              <div key={folder}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {folder ? folder : "根目录"}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {decks
                    .filter((d) => (d.folder || "") === folder)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((d) => (
                      <Card key={d.id} className="group relative">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="truncate">{d.name}</CardTitle>
                            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "size-7",
                                  selectedDeckIds.has(d.id)
                                    ? "text-primary"
                                    : "text-muted-foreground"
                                )}
                                onClick={() => toggleSelectDeck(d.id)}
                                title="选择导出"
                              >
                                {selectedDeckIds.has(d.id) ? (
                                  <Check className="size-3.5" />
                                ) : (
                                  <Square className="size-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground"
                                onClick={() => openRename(d.id, d.name, d.description, d.new_cards_per_day, d.folder)}
                                title="重命名词库"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget({ id: d.id, name: d.name, cards: cardCounts[d.id] ?? 0 })}
                                title="删除词库"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                          <CardDescription className="line-clamp-2 min-h-8">
                            {d.description || "暂无描述"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{cardCounts[d.id] ?? 0} 张卡片</Badge>
                              <span className="text-xs text-muted-foreground">
                                每日新卡 {d.new_cards_per_day}
                              </span>
                            </div>
                            <Button asChild size="sm" variant="outline">
                              <Link to={"/decks/" + d.id}>查看</Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* 删除词库警告对话框 */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleteBusy && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              删除词库
            </DialogTitle>
            <DialogDescription>此操作不可撤销</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              确定要删除词库「<span className="font-semibold">{deleteTarget?.name}</span>」吗？
            </p>
            <p className="text-muted-foreground">
              将永久删除其中的{" "}
              <span className="font-semibold text-destructive">{deleteTarget?.cards}</span>{" "}
              张卡片、全部 FSRS 记忆状态与复习记录。建议先到「设置 → 数据」导出备份。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名词库对话框 */}
      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名词库</DialogTitle>
            <DialogDescription>修改名称、描述与所属文件夹（名称在同一文件夹内唯一）</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rename-name">词库名称</Label>
              <Input
                id="rename-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rename-desc">描述（可选）</Label>
              <Input
                id="rename-desc"
                value={renameDesc}
                onChange={(e) => setRenameDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rename-folder">文件夹（可选）</Label>
              <Input
                id="rename-folder"
                placeholder="留空为根目录"
                value={renameFolder}
                onChange={(e) => setRenameFolder(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rename-quota">每日新卡上限</Label>
              <Input
                id="rename-quota"
                type="number"
                min={1}
                max={500}
                value={renameQuota}
                onChange={(e) => setRenameQuota(parseInt(e.target.value, 10) || 0)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
              />
              <p className="text-xs text-muted-foreground">该词库每天可学习的新卡数量</p>
            </div>
            {renameError && <p className="text-xs text-red-600">{renameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button onClick={saveRename} disabled={!renameName.trim() || renameBusy}>
              {renameBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
