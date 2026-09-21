import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImportFormat } from "@/lib/importer";

interface ImportManualSectionProps {
  manualFormat: ImportFormat | "auto";
  setManualFormat: (val: ImportFormat | "auto") => void;
  delimiterType: string;
  setDelimiterType: (val: string) => void;
  customDelimiter: string;
  setCustomDelimiter: (val: string) => void;
  manualText: string;
  setManualText: (val: string) => void;
  onParse: () => void;
}

export default function ImportManualSection({
  manualFormat,
  setManualFormat,
  delimiterType,
  setDelimiterType,
  customDelimiter,
  setCustomDelimiter,
  manualText,
  setManualText,
  onParse,
}: ImportManualSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>手动输入</CardTitle>
        <CardDescription>
          粘贴 Markdown / CSV / JSON / TXT 内容，支持自定义分隔符与例句解析
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">格式</Label>
            <Select
              value={manualFormat}
              onValueChange={(v) => setManualFormat(v as ImportFormat | "auto")}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="选择解析格式">
                  {manualFormat === "auto"
                    ? "自动识别 (推荐)"
                    : manualFormat === "markdown"
                      ? "Markdown 格式"
                      : manualFormat === "csv"
                        ? "CSV 表格"
                        : manualFormat === "json"
                          ? "JSON 数据"
                          : "TXT 纯文本"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-44">
                <SelectItem value="auto" className="py-2">
                  <span className="font-medium text-sm">自动识别</span>
                  <span className="text-xs text-muted-foreground ml-1.5">(推荐)</span>
                </SelectItem>
                <SelectItem value="markdown" className="py-2">
                  <span className="font-medium text-sm">Markdown (.md)</span>
                </SelectItem>
                <SelectItem value="csv" className="py-2">
                  <span className="font-medium text-sm">CSV 表格 (.csv)</span>
                </SelectItem>
                <SelectItem value="json" className="py-2">
                  <span className="font-medium text-sm">JSON 数据 (.json)</span>
                </SelectItem>
                <SelectItem value="txt" className="py-2">
                  <span className="font-medium text-sm">TXT 纯文本 (.txt)</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">分隔符</Label>
            <Select value={delimiterType} onValueChange={setDelimiterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="分隔符">
                  {delimiterType === "auto"
                    ? "自动检测"
                    : delimiterType === "tab"
                      ? "Tab 制表符 (\\t)"
                      : delimiterType === "comma"
                        ? "逗号 (,)"
                        : delimiterType === "pipe"
                          ? "竖线 (|)"
                          : delimiterType === "dash"
                            ? "破折号 ( - )"
                            : delimiterType === "colon"
                              ? "冒号 (:)"
                              : delimiterType === "semicolon"
                                ? "分号 (;)"
                                : delimiterType === "space"
                                  ? "空格"
                                  : "自定义..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-48">
                <SelectItem value="auto" className="py-2">
                  <span className="font-medium text-sm">自动检测</span>
                  <span className="text-xs text-muted-foreground ml-1.5">(默认)</span>
                </SelectItem>
                <SelectItem value="tab" className="py-2">
                  <span className="font-medium text-sm">Tab 制表符 (\t)</span>
                </SelectItem>
                <SelectItem value="comma" className="py-2">
                  <span className="font-medium text-sm">逗号 (, / ，)</span>
                </SelectItem>
                <SelectItem value="pipe" className="py-2">
                  <span className="font-medium text-sm">竖线 (|)</span>
                </SelectItem>
                <SelectItem value="dash" className="py-2">
                  <span className="font-medium text-sm">破折号 ( - )</span>
                </SelectItem>
                <SelectItem value="colon" className="py-2">
                  <span className="font-medium text-sm">冒号 (: / ：)</span>
                </SelectItem>
                <SelectItem value="semicolon" className="py-2">
                  <span className="font-medium text-sm">分号 (;)</span>
                </SelectItem>
                <SelectItem value="space" className="py-2">
                  <span className="font-medium text-sm">空格</span>
                </SelectItem>
                <SelectItem value="custom" className="py-2">
                  <span className="font-medium text-sm">自定义分隔符...</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {delimiterType === "custom" && (
            <input
              type="text"
              placeholder="如 ::: 或 ---"
              className="h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={customDelimiter}
              onChange={(e) => setCustomDelimiter(e.target.value)}
            />
          )}

          <Button onClick={onParse} disabled={!manualText.trim()}>
            解析预览
          </Button>
        </div>

        <Textarea
          rows={6}
          placeholder={
            delimiterType === "custom" && customDelimiter
              ? `每行一个词条（支持第3列写入例句），例如：\nabandon ${customDelimiter} vt. 放弃 ${customDelimiter} He abandoned the plan.\nsubtle ${customDelimiter} adj. 微妙的`
              : delimiterType === "comma"
                ? "每行一个词条，例如：\nabandon, vt. 放弃, He abandoned the plan.\n# 核心词库\nsubtle, adj. 微妙的"
                : delimiterType === "pipe"
                  ? "每行一个词条，例如：\nabandon | vt. 放弃 | He abandoned the plan.\nsubtle | adj. 微妙的"
                  : "每行一个词条（支持第3列写例句），例如：\nabandon\tvt. 放弃\tHe abandoned the plan.\n# 四级词汇\nabandon, 放弃"
          }
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
        />
      </CardContent>
    </Card>
  );
}
