import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  RefreshCw,
  Sparkles,
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { db } from "@/lib/db";
import { isTauri } from "@/lib/env";
import { useDeckStore } from "@/stores/useDeckStore";
import { parseImportFile, parseTextInput, type ImportFileResult, type ImportFormat } from "@/lib/importer";
import { generateCardsFromText } from "@/lib/ai-generate";
import { cn } from "@/lib/utils";

interface PreviewRow {
  key: string;
  deckName: string;
  folder: string;
  front: string;
  back: string;
  markdown: string;
  sourceType: "markdown" | "csv" | "json" | "manual";
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
  const [manualFormat, setManualFormat] = useState<ImportFormat | "auto">("auto");
  const [manualText, setManualText] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deckTargets, setDeckTargets] = useState<
    Record<
      string,
      {
        deckId: number | null;
        label: string;
        folder: string;
        name: string;
        options: { deckId: number | null; label: string; folder: string; name: string }[];
      }
    >
  >({});
  const refreshDecks = useDeckStore((s) => s.refresh);

  /** 解析结果 → 冲突检测（DB 匹配）→ 预览 */
  const handleParsed = async (name: string, parsed: ImportFileResult) => {
    setStage("preview");
    setFileName(name);
    setWarnings([]);

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
      const matches = await db.getDecksByName(deckName);
      const deckId = matches[0]?.id ?? null;
      const existing = deckId ? await db.getExistingFronts(deckId) : new Set<string>();
      for (const c of cards) {
        const dup = duplicateSet.has(deckName + "\u0000" + c.front);
        const rowStatus = dup ? "duplicate" : existing.has(c.front) ? "exists" : "new";
        rowsOut.push({
          key: deckName + "\u0000" + c.front,
          deckName,
          folder: c.folder,
          front: c.front,
          back: c.back,
          markdown: c.markdown,
          sourceType: parsed.format === "txt" ? "manual" : parsed.format,
          tags: c.tags,
          isKey: c.isKey,
          status: rowStatus,
          checked: dup ? false : parsed.format === "json" ? rowStatus === "new" : true,
        });
      }
    }
    const targets: Record<
      string,
      {
        deckId: number | null;
        label: string;
        folder: string;
        name: string;
        options: { deckId: number | null; label: string; folder: string; name: string }[];
      }
    > = {};
    for (const deckName of deckGroups.keys()) {
      const matches = await db.getDecksByName(deckName);
      const options: { deckId: number | null; label: string; folder: string; name: string }[] = matches.map((m) => ({
        deckId: m.id,
        label: `${m.folder || "根目录"}/${m.name}`,
        folder: m.folder,
        name: m.name,
      }));
      const newFolder = deckGroups.get(deckName)?.[0]?.folder ?? "";
      if (matches.length > 0) {
        const unique = await db.getUniqueDeckName(deckName, newFolder);
        options.push({ deckId: null, label: `新建 ${unique}`, folder: newFolder, name: unique });
      } else {
        options.push({ deckId: null, label: deckName, folder: newFolder, name: deckName });
      }
      const first = options[0];
      if (first) targets[deckName] = { ...first, options };
    }
    setDeckTargets(targets);
    setRows(rowsOut);
    setWarnings(parsed.warnings);
  };

  /** 解析文件文本 → 预览 */
  const handleText = async (name: string, text: string) => {
    await handleParsed(name, parseImportFile(name, text));
  };

  /** 手动输入文本 → 预览 */
  const handleManualText = async () => {
    if (!manualText.trim()) return;
    await handleParsed("手动输入", parseTextInput(manualText, manualFormat));
  };

  /** AI 从文章/笔记生成闪卡 → 预览 */
  const handleAIGenerate = async () => {
    if (!aiText.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const json = await generateCardsFromText(aiText);
      await handleParsed("AI 生成", parseTextInput(json, "json"));
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiBusy(false);
    }
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

  const selectDeckTarget = (deckName: string, value: string) => {
    setDeckTargets((prev) => {
      const t = prev[deckName];
      if (!t) return prev;
      const opt = t.options.find((o) =>
        (o.deckId !== null ? `id:${o.deckId}` : `new:${o.name}`) === value
      ) ?? t.options[0];
      if (!opt) return prev;
      return { ...prev, [deckName]: { ...t, deckId: opt.deckId, label: opt.label, folder: opt.folder, name: opt.name } };
    });
  };

  const confirmImport = async () => {
    setStage("importing");
    const selected = rows.filter((r) => r.checked);
    let created = 0;
    let updated = 0;
    const knownExistingByDeck = new Map<string, Set<string>>();
    const decksTouched = new Set<string>();

    for (const r of selected) {
      const target = deckTargets[r.deckName] ?? {
        deckId: null,
        label: r.deckName,
        folder: "",
        name: r.deckName,
      };
      const targetKey = target.deckId !== null ? String(target.deckId) : `new:${target.folder}\u0000${target.name}`;
      let existing = knownExistingByDeck.get(targetKey);
      if (!existing) {
        existing = new Set<string>();
        if (target.deckId !== null) {
          const fronts = await db.getExistingFronts(target.deckId);
          fronts.forEach((f) => existing!.add(f));
        }
        knownExistingByDeck.set(targetKey, existing);
      }
      let deckId: number;
      if (target.deckId !== null) {
        deckId = target.deckId;
      } else {
        const uniqueName = await db.getUniqueDeckName(target.name, target.folder);
        deckId = await db.createDeck(uniqueName, "", undefined, target.folder);
      }
      decksTouched.add(target.label);
      const res = await db.upsertCard(
        {
          deckId,
          front: r.front,
          back: r.back,
          markdown: r.markdown,
          sourceType: r.sourceType,
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
    setDeckTargets({});
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
              <CardTitle>手动输入</CardTitle>
              <CardDescription>粘贴 Markdown / CSV / JSON / TXT 内容，自动识别后预览导入</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Label className="shrink-0">格式</Label>
                <Select
                  value={manualFormat}
                  onValueChange={(v) => setManualFormat(v as ImportFormat | "auto")}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动识别</SelectItem>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="txt">TXT</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleManualText} disabled={!manualText.trim()}>
                  解析预览
                </Button>
              </div>
              <Textarea
                rows={6}
                placeholder={"每行一个词条，例如：\nabandon\t放弃\n# 四级词汇\nabandon, 放弃"}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI 智能生成</CardTitle>
              <CardDescription>粘贴文章/笔记，AI 自动提取单词并生成闪卡</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={6}
                placeholder="粘贴英文文章或笔记内容…"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
              />
              {aiError && <p className="text-xs text-red-600">{aiError}</p>}
              <Button onClick={handleAIGenerate} disabled={aiBusy || !aiText.trim()}>
                {aiBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                生成闪卡并预览
              </Button>
            </CardContent>
          </Card>

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
          {Object.values(deckTargets).some((t) => t.options.length > 1) && (
            <Card>
              <CardHeader>
                <CardTitle>词库冲突处理</CardTitle>
                <CardDescription>检测到重名词库，请选择导入目标；选择「新建」会生成 *_1 词库</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(deckTargets)
                  .filter(([, t]) => t.options.length > 1)
                  .map(([deckName, t]) => (
                    <div key={deckName} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{deckName}</span>
                      <Select
                        value={t.deckId !== null ? `id:${t.deckId}` : `new:${t.name}`}
                        onValueChange={(v) => selectDeckTarget(deckName, v)}
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {t.options.map((opt) => (
                            <SelectItem
                              key={opt.deckId !== null ? `id:${opt.deckId}` : `new:${opt.name}`}
                              value={opt.deckId !== null ? `id:${opt.deckId}` : `new:${opt.name}`}
                            >
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

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
