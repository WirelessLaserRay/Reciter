import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  RefreshCw,
  Star,
  Upload,
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
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { db } from "@/lib/db";
import { isTauri } from "@/lib/env";
import { useDeckStore } from "@/stores/useDeckStore";
import { parseImportFile } from "@/lib/importer";
import { cn } from "@/lib/utils";

interface PreviewRow {
  key: string;
  deckName: string;
  front: string;
  back: string;
  tags: string[];
  isKey: boolean;
  status: "new" | "exists" | "duplicate";
  checked: boolean;
}

type Stage = "idle" | "preview" | "importing" | "done";

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  decks: number;
}

const ACCEPT = ".md,.markdown,.csv,.json,.txt";

export default function Import() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const refreshDecks = useDeckStore((s) => s.refresh);

  /** 解析文本 → 冲突检测（DB 匹配）→ 预览 */
  const handleText = async (name: string, text: string) => {
    setStage("preview");
    setFileName(name);
    setWarnings([]);
    const parsed = parseImportFile(name, text);

    // 按词库分组做冲突检测（每词库一次查询）
    const deckGroups = new Map<string, typeof parsed.cards>();
    for (const c of parsed.cards) {
      const arr = deckGroups.get(c.deckName) ?? [];
      arr.push(c);
      deckGroups.set(c.deckName, arr);
    }
    const duplicateSet = new Set(parsed.duplicates);
    const rowsOut: PreviewRow[] = [];
    for (const [deckName, cards] of deckGroups) {
      const deckId = await db.getDeckIdByName(deckName);
      const existing = deckId ? await db.getExistingFronts(deckId) : new Set<string>();
      for (const c of cards) {
        const dup = duplicateSet.has(deckName + "\u0000" + c.front);
        rowsOut.push({
          key: deckName + "\u0000" + c.front,
          deckName,
          front: c.front,
          back: c.back,
          tags: c.tags,
          isKey: c.isKey,
          status: dup ? "duplicate" : existing.has(c.front) ? "exists" : "new",
          checked: !dup,
        });
      }
    }
    setRows(rowsOut);
    setWarnings(parsed.warnings);
  };

  /** Web/选择器：读取 File → 解析预览 */
  const handleFile = async (file: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      await handleText(file.name, text);
    } catch (e) {
      setStage("idle");
      setWarnings([String(e)]);
    }
  };

  // Tauri：监听原生拖放事件（WebView2 不向网页暴露 dataTransfer.files）
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "over") {
          setDragOver(true);
        } else if (payload.type === "leave") {
          setDragOver(false);
        } else if (payload.type === "drop") {
          setDragOver(false);
          const path = payload.paths?.[0];
          if (path) {
            const name = path.split(/[\\/]/).pop() ?? path;
            invoke<string>("read_text_file", { path })
              .then((text) => handleText(name, text))
              .catch((e) => {
                setStage("idle");
                setWarnings([String(e)]);
              });
          }
        }
      });
    })();
    return () => {
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRow = (key: string) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)));
  };

  const toggleAll = () => {
    const selectable = rows.filter((r) => r.status !== "duplicate");
    const allChecked = selectable.length > 0 && selectable.every((r) => r.checked);
    setRows((rs) => rs.map((r) => (r.status === "duplicate" ? r : { ...r, checked: !allChecked })));
  };

  const confirmImport = async () => {
    setStage("importing");
    const selected = rows.filter((r) => r.checked);
    let created = 0;
    let updated = 0;
    const knownExistingByDeck = new Map<string, Set<string>>();
    const decksTouched = new Set<string>();

    for (const r of selected) {
      let existing = knownExistingByDeck.get(r.deckName);
      if (!existing) {
        existing = new Set<string>();
        const deckId = await db.getDeckIdByName(r.deckName);
        if (deckId) {
          const fronts = await db.getExistingFronts(deckId);
          fronts.forEach((f) => existing!.add(f));
        }
        knownExistingByDeck.set(r.deckName, existing);
      }
      const deckId = await db.createDeck(r.deckName, "");
      decksTouched.add(r.deckName);
      const res = await db.upsertCard(
        {
          deckId,
          front: r.front,
          back: r.back,
          markdown: "",
          sourceType: "markdown",
          tags: r.tags,
          isKey: r.isKey ? 1 : 0,
        },
        existing
      );
      if (res.created) created++;
      else updated++;
    }
    const skipped = rows.length - selected.length;
    setResult({ created, updated, skipped, decks: decksTouched.size });
    setStage("done");
    refreshDecks();
  };

  const reset = () => {
    setStage("idle");
    setRows([]);
    setResult(null);
    setFileName("");
  };

  const selectableCount = rows.filter((r) => r.status !== "duplicate").length;
  const checkedCount = rows.filter((r) => r.checked).length;
  const newCount = rows.filter((r) => r.status === "new").length;
  const existsCount = rows.filter((r) => r.status === "exists").length;
  const dupCount = rows.filter((r) => r.status === "duplicate").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">导入词库</h2>
        <p className="text-sm text-muted-foreground">
          支持 Markdown / CSV / JSON 批量导入，解析后预览、冲突检测、一键入库
        </p>
      </div>

      {stage === "idle" && (
        <>
          <div
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-16 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <Upload className="size-10 text-muted-foreground" />
            <div className="font-medium">拖拽文件到这里，或点击选择文件</div>
            <p className="text-sm text-muted-foreground">.md / .csv / .json</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle>支持的格式</CardTitle>
              <CardDescription>解析规则（对齐 templates 样式与 PLAN 规范）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="mb-1 font-medium">Markdown（templates 样式）</div>
                <pre className="rounded-md bg-muted p-3 text-xs leading-relaxed">
{["# 考研英语复习", "", "## Unit 1", "", "### 1.1 熟词生义", "", "- **radiate vt./vi. (from) 发散；流露出**", "- plain_word n. 次要词条", "", "## Unit 2"].join("\n")}
                </pre>
                <p className="mt-1 text-muted-foreground">
                  <code>#</code> 书名 · <code>##</code> 词库 · <code>###</code> 分组(标签) ·{" "}
                  <code>- word: 释义</code> 或 <code>- word n. 释义</code> 成卡 ·{" "}
                  <code>&gt;</code> 引用块作例句 · <code>==高亮==</code> 挖空素材
                </p>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 font-medium">CSV</div>
                  <pre className="rounded-md bg-muted p-3 text-xs">
{["word,meaning,deck", "abandon,放弃,四级"].join("\n")}
                  </pre>
                  <p className="mt-1 text-muted-foreground">表头可识别 front/word/back/meaning/deck/tags</p>
                </div>
                <div>
                  <div className="mb-1 font-medium">JSON</div>
                  <pre className="rounded-md bg-muted p-3 text-xs">
{['[{"front":"abandon","back":"放弃"}]'].join("\n")}
                  </pre>
                  <p className="mt-1 text-muted-foreground">数组或 {"{ \"cards\": [...] }"} 对象</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {stage === "preview" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileUp className="size-4" />
                  {fileName}
                </CardTitle>
                <CardDescription>
                  {rows.length} 张卡片 · 新建 {newCount} · 已存在 {existsCount} · 重复 {dupCount}
                  {warnings.length > 0 && " · 警告 " + warnings.length}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={reset}>
                <RefreshCw className="size-3.5" />
                重新选择
              </Button>
            </CardHeader>
            <CardContent>
              {warnings.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <ul className="space-y-0.5">
                    {warnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {warnings.length > 8 && <li>… 共 {warnings.length} 条警告</li>}
                  </ul>
                </div>
              )}

              <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selectableCount > 0 && checkedCount === selectableCount}
                    onChange={toggleAll}
                  />
                  全选（排除重复）
                </label>
                <span>已选 {checkedCount} / {selectableCount}</span>
              </div>

              <ScrollArea className="h-[26rem] rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">词库</th>
                      <th className="px-2 py-2">单词</th>
                      <th className="px-2 py-2">释义</th>
                      <th className="px-2 py-2">标签</th>
                      <th className="px-2 py-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.key}
                        className={cn(
                          "border-t",
                          r.status === "duplicate" && "opacity-60",
                          r.checked && "bg-primary/5"
                        )}
                      >
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={r.checked}
                            disabled={r.status === "duplicate"}
                            onChange={() => toggleRow(r.key)}
                          />
                        </td>
                        <td className="max-w-28 truncate px-2 py-1.5 font-medium" title={r.deckName}>
                          {r.deckName}
                        </td>
                        <td className="max-w-36 truncate px-2 py-1.5" title={r.front}>
                          {r.isKey && <Star className="mr-1 inline size-3 text-amber-500" />}
                          {r.front}
                        </td>
                        <td className="max-w-56 truncate px-2 py-1.5 text-muted-foreground" title={r.back}>
                          {r.back}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.tags.length > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {r.tags[0]}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.status === "new" && <Badge className="text-[10px]">新建</Badge>}
                          {r.status === "exists" && (
                            <Badge variant="outline" className="text-[10px]">更新</Badge>
                          )}
                          {r.status === "duplicate" && (
                            <Badge variant="destructive" className="text-[10px]">重复</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={reset}>取消</Button>
            <Button onClick={confirmImport} disabled={checkedCount === 0}>
              确认导入（{checkedCount} 张）
            </Button>
          </div>
        </div>
      )}

      {stage === "importing" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在写入本地数据库…</p>
          </CardContent>
        </Card>
      )}

      {stage === "done" && result && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="size-10 text-green-500" />
            <CardTitle>导入完成</CardTitle>
            <CardDescription className="max-w-md">
              新建 <span className="font-semibold text-foreground">{result.created}</span> 张 ·
              更新 <span className="font-semibold text-foreground">{result.updated}</span> 张 ·
              跳过 <span className="font-semibold text-foreground">{result.skipped}</span> 张
              · 涉及 {result.decks} 个词库
            </CardDescription>
            <div className="flex gap-3">
              <Button onClick={reset}>继续导入</Button>
              <Button asChild variant="outline">
                <Link to="/decks">查看词库</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
