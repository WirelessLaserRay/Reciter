import {
  AlertTriangle,
  FileUp,
  RefreshCw,
  Star,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PreviewRow } from "./types";

interface ImportPreviewTableProps {
  fileName: string;
  rows: PreviewRow[];
  warnings: string[];
  autoPhonetic: boolean;
  setAutoPhonetic: (val: boolean) => void;
  onToggleRow: (key: string) => void;
  onToggleAll: () => void;
  onReset: () => void;
  onConfirmImport: () => void;
}

export default function ImportPreviewTable({
  fileName,
  rows,
  warnings,
  autoPhonetic,
  setAutoPhonetic,
  onToggleRow,
  onToggleAll,
  onReset,
  onConfirmImport,
}: ImportPreviewTableProps) {
  const selectableCount = rows.filter((r) => r.status !== "duplicate").length;
  const checkedCount = rows.filter((r) => r.checked).length;
  const newCount = rows.filter((r) => r.status === "new").length;
  const existsCount = rows.filter((r) => r.status === "exists").length;
  const dupCount = rows.filter((r) => r.status === "duplicate").length;

  return (
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
          <Button variant="outline" size="sm" onClick={onReset}>
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
                onChange={onToggleAll}
              />
              全选（排除重复）
            </label>
            <span>
              已选 {checkedCount} / {selectableCount}
            </span>
          </div>

          <ScrollArea className="h-[26rem] rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2">词库</th>
                  <th className="px-2 py-2">单词/短语</th>
                  <th className="px-2 py-2">释义</th>
                  <th className="px-2 py-2">例句</th>
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
                        onChange={() => onToggleRow(r.key)}
                      />
                    </td>
                    <td
                      className="max-w-28 truncate px-2 py-1.5 font-medium"
                      title={r.deckName}
                    >
                      {r.deckName}
                    </td>
                    <td
                      className="max-w-36 truncate px-2 py-1.5"
                      title={r.front}
                    >
                      {r.isKey && (
                        <Star className="mr-1 inline size-3 text-amber-500" />
                      )}
                      {r.front}
                    </td>
                    <td
                      className="max-w-56 truncate px-2 py-1.5 text-muted-foreground"
                      title={r.back}
                    >
                      {r.back}
                    </td>
                    <td
                      className="max-w-52 truncate px-2 py-1.5 text-xs text-muted-foreground"
                      title={r.markdown || "无例句"}
                    >
                      {r.markdown ? (
                        r.markdown.split(/\r?\n/)[0]
                      ) : (
                        <span className="text-muted-foreground/40">-</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.tags.length > 0 ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.tags[0]}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.status === "new" && (
                        <Badge className="text-[10px]">新建</Badge>
                      )}
                      {r.status === "exists" && (
                        <Badge variant="outline" className="text-[10px]">
                          更新
                        </Badge>
                      )}
                      {r.status === "duplicate" && (
                        <Badge variant="destructive" className="text-[10px]">
                          重复
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={autoPhonetic}
            onChange={(e) => setAutoPhonetic(e.target.checked)}
            className="size-4 accent-primary"
          />
          导入时自动获取缺失音标（默认关闭）
        </label>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onReset}>
            取消
          </Button>
          <Button onClick={onConfirmImport} disabled={checkedCount === 0}>
            确认导入（{checkedCount} 张）
          </Button>
        </div>
      </div>
    </div>
  );
}
