import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { db } from "@/lib/db";
import { isTauri } from "@/lib/env";
import { useDeckStore } from "@/stores/useDeckStore";
import {
  parseImportFile,
  parseTextInput,
  parseApkgFile,
  type ImportFileResult,
  type ImportFormat,
} from "@/lib/importer";
import { generateCardsFromText, type AIMode } from "@/lib/ai-generate";
import { useTaskStore } from "@/stores/useTaskStore";
import {
  type PreviewRow,
  type Stage,
  type ImportResult,
  type DeckTarget,
  type DeckTargetOption,
  ImportUploadDropzone,
  ImportManualSection,
  ImportAiSection,
  ImportFormatDocs,
  ImportConflictSection,
  ImportPreviewTable,
  ImportProgressModal,
  ImportDoneCard,
} from "./import-flow";

export default function Import() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [manualFormat, setManualFormat] = useState<ImportFormat | "auto">("auto");
  const [delimiterType, setDelimiterType] = useState<string>("auto");
  const [customDelimiter, setCustomDelimiter] = useState<string>("");
  const [manualText, setManualText] = useState("");
  const [aiMode, setAiMode] = useState<AIMode>("study_material");
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deckTargets, setDeckTargets] = useState<Record<string, DeckTarget>>({});
  const refreshDecks = useDeckStore((s) => s.refresh);
  const [importProgress, setImportProgress] = useState({
    phase: "" as "" | "phonetic" | "db",
    done: 0,
    total: 0,
  });
  const [autoPhonetic, setAutoPhonetic] = useState(false);
  const [backgroundPhonetic, setBackgroundPhonetic] = useState(false);

  /** 获取有效的分隔符 */
  const getEffectiveDelimiter = (): string | undefined => {
    if (delimiterType === "auto") return undefined;
    if (delimiterType === "tab") return "\t";
    if (delimiterType === "comma") return ",";
    if (delimiterType === "pipe") return "|";
    if (delimiterType === "dash") return " - ";
    if (delimiterType === "colon") return ":";
    if (delimiterType === "semicolon") return ";";
    if (delimiterType === "space") return " ";
    if (delimiterType === "custom") return customDelimiter || undefined;
    return undefined;
  };

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
          phonetic: c.phonetic,
          markdown: c.markdown,
          sourceType: parsed.format === "txt" ? "manual" : parsed.format,
          tags: c.tags,
          isKey: c.isKey,
          meaningPrimary: c.meaningPrimary ?? "",
          meaningSecondary: c.meaningSecondary ?? "",
          status: rowStatus,
          checked: dup ? false : parsed.format === "json" ? rowStatus === "new" : true,
        });
      }
    }
    const targets: Record<string, DeckTarget> = {};
    for (const deckName of deckGroups.keys()) {
      const matches = await db.getDecksByName(deckName);
      const options: DeckTargetOption[] = matches.map((m) => ({
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
    const effDelim = getEffectiveDelimiter();
    await handleParsed(name, parseImportFile(name, text, effDelim));
  };

  /** 手动输入文本 → 预览 */
  const handleManualText = async () => {
    if (!manualText.trim()) return;
    const effDelim = getEffectiveDelimiter();
    await handleParsed("手动输入", parseTextInput(manualText, manualFormat, effDelim));
  };

  /** AI 识别与生成（支持学习资料解析与语料生成闪卡）→ 预览 */
  const handleAIGenerate = async () => {
    if (!aiText.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const json = await generateCardsFromText(aiText, { mode: aiMode });
      const modeLabel = aiMode === "study_material" ? "AI 资料解析" : "AI 语料闪卡";
      await handleParsed(modeLabel, parseTextInput(json, "json"));
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
      if (file.name.toLowerCase().endsWith(".apkg")) {
        const buffer = await file.arrayBuffer();
        const res = await parseApkgFile(file.name, buffer);
        await handleParsed(file.name, res);
      } else {
        const text = await file.text();
        await handleText(file.name, text);
      }
    } catch (e) {
      setStage("idle");
      setWarnings([String(e)]);
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    let unlistenFn: (() => void) | undefined;
    let isMounted = true;
    getCurrentWebview()
      .onDragDropEvent((event) => {
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
            if (name.toLowerCase().endsWith(".apkg")) {
              invoke<number[]>("read_binary_file", { path })
                .then((bytes) => parseApkgFile(name, new Uint8Array(bytes)))
                .then((res) => handleParsed(name, res))
                .catch((e) => {
                  setStage("idle");
                  setWarnings([String(e)]);
                });
            } else {
              invoke<string>("read_text_file", { path })
                .then((text) => handleText(name, text))
                .catch((e) => {
                  setStage("idle");
                  setWarnings([String(e)]);
                });
            }
          }
        }
      })
      .then((unlisten) => {
        if (!isMounted) unlisten();
        else unlistenFn = unlisten;
      });
    return () => {
      isMounted = false;
      unlistenFn?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRow = (key: string) => {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r))
    );
  };

  const toggleAll = () => {
    const selectable = rows.filter((r) => r.status !== "duplicate");
    const allChecked =
      selectable.length > 0 && selectable.every((r) => r.checked);
    setRows((rs) =>
      rs.map((r) =>
        r.status === "duplicate" ? r : { ...r, checked: !allChecked }
      )
    );
  };

  const selectDeckTarget = (deckName: string, value: string) => {
    setDeckTargets((prev) => {
      const t = prev[deckName];
      if (!t) return prev;
      const opt =
        t.options.find(
          (o) =>
            (o.deckId !== null ? `id:${o.deckId}` : `new:${o.name}`) === value
        ) ?? t.options[0];
      if (!opt) return prev;
      return {
        ...prev,
        [deckName]: {
          ...t,
          deckId: opt.deckId,
          label: opt.label,
          folder: opt.folder,
          name: opt.name,
        },
      };
    });
  };

  const confirmImport = async () => {
    setStage("importing");
    const selected = rows.filter((r) => r.checked);
    const imported: { row: PreviewRow; deckId: number }[] = [];

    // Phase: 写入数据库（带进度）
    setImportProgress({ phase: "db", done: 0, total: selected.length });
    let created = 0;
    let updated = 0;
    const knownExistingByDeck = new Map<string, Set<string>>();
    const createdDeckIds = new Map<string, number>();
    const decksTouched = new Set<string>();

    for (let idx = 0; idx < selected.length; idx++) {
      const r = selected[idx];
      const target = deckTargets[r.deckName] ?? {
        deckId: null,
        label: r.deckName,
        folder: "",
        name: r.deckName,
        options: [],
      };
      const targetKey =
        target.deckId !== null
          ? String(target.deckId)
          : `new:${target.folder}\u0000${target.name}`;
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
        const cachedDeckId = createdDeckIds.get(targetKey);
        if (cachedDeckId) {
          deckId = cachedDeckId;
        } else {
          const uniqueName = await db.getUniqueDeckName(
            target.name,
            target.folder
          );
          deckId = await db.createDeck(uniqueName, "", undefined, target.folder);
          createdDeckIds.set(targetKey, deckId);
        }
      }
      decksTouched.add(target.label);
      const phonetic = r.phonetic || "";
      const res = await db.upsertCard(
        {
          deckId,
          front: r.front,
          back: r.back,
          phonetic,
          markdown: r.markdown,
          sourceType: r.sourceType === "apkg" ? "manual" : r.sourceType,
          tags: r.tags,
          isKey: r.isKey ? 1 : 0,
          meaningPrimary: r.meaningPrimary ?? "",
          meaningSecondary: r.meaningSecondary ?? "",
        },
        existing
      );
      imported.push({ row: r, deckId });
      if (res.created) created++;
      else updated++;
      if ((idx + 1) % 10 === 0 || idx === selected.length - 1) {
        setImportProgress({
          phase: "db",
          done: idx + 1,
          total: selected.length,
        });
      }
    }
    // 后台补齐音标：使用全局任务中心，切换页面绝不中断
    const needPhonetic = imported
      .filter((x) => !x.row.phonetic)
      .map((x) => x.row.front);
    if (autoPhonetic && needPhonetic.length > 0) {
      setBackgroundPhonetic(true);
      const deckMap = new Map<number, string>();
      for (const { row, deckId } of imported) {
        deckMap.set(deckId, row.deckName || "词库");
      }
      for (const [deckId, deckName] of deckMap.entries()) {
        void useTaskStore.getState().startPhoneticEnrichment(deckId, deckName);
      }
    }
    const skipped = rows.length - selected.length;
    setResult({ created, updated, skipped, decks: decksTouched.size });
    setImportProgress({ phase: "", done: 0, total: 0 });
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">导入词库</h2>
          <p className="text-sm text-muted-foreground">
            支持 Markdown / CSV / JSON / TXT 以及 Anki (.apkg) 导入，解析后预览、冲突检测、一键入库
          </p>
        </div>
        <Link to="/deck-hub">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
          >
            <Compass className="size-4" />
            前往词库广场 (现成词库一键下载)
          </Button>
        </Link>
      </div>

      {stage === "idle" && (
        <>
          <ImportUploadDropzone
            dragOver={dragOver}
            setDragOver={setDragOver}
            fileInputRef={fileInputRef}
            onFile={handleFile}
          />

          <ImportManualSection
            manualFormat={manualFormat}
            setManualFormat={setManualFormat}
            delimiterType={delimiterType}
            setDelimiterType={setDelimiterType}
            customDelimiter={customDelimiter}
            setCustomDelimiter={setCustomDelimiter}
            manualText={manualText}
            setManualText={setManualText}
            onParse={handleManualText}
          />

          <ImportAiSection
            aiMode={aiMode}
            setAiMode={setAiMode}
            aiText={aiText}
            setAiText={setAiText}
            aiBusy={aiBusy}
            aiError={aiError}
            onAiGenerate={handleAIGenerate}
          />

          <ImportFormatDocs />
        </>
      )}

      {stage === "preview" && (
        <>
          <ImportConflictSection
            deckTargets={deckTargets}
            onSelectDeckTarget={selectDeckTarget}
          />

          <ImportPreviewTable
            fileName={fileName}
            rows={rows}
            warnings={warnings}
            autoPhonetic={autoPhonetic}
            setAutoPhonetic={setAutoPhonetic}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            onReset={reset}
            onConfirmImport={confirmImport}
          />
        </>
      )}

      {stage === "importing" && (
        <ImportProgressModal importProgress={importProgress} />
      )}

      {stage === "done" && result && (
        <ImportDoneCard
          result={result}
          backgroundPhonetic={backgroundPhonetic}
          onReset={reset}
        />
      )}
    </div>
  );
}
