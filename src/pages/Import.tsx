import { FileUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const MD_EXAMPLE = [
  "## 四级核心词汇",
  "- abandon: 放弃；抛弃",
  "- ability — 能力；才能",
  "> 例句: He has the ability to solve it.",
].join("\n");

const CSV_EXAMPLE = ["word,meaning", "abandon,放弃"].join("\n");

export default function Import() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">导入词库</h2>
        <p className="text-sm text-muted-foreground">
          支持 Markdown / CSV / JSON 格式批量导入（Phase 2 实现）
        </p>
      </div>

      {/* 拖拽/选择区域 */}
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-16 text-center transition-colors hover:border-primary/50">
        <FileUp className="size-10 text-muted-foreground" />
        <div className="font-medium">拖拽文件到这里，或点击选择</div>
        <p className="text-sm text-muted-foreground">
          .md / .csv / .json 文件，每个文件不超过 5MB
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>支持的格式</CardTitle>
          <CardDescription>导入规则预览</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="mb-1 font-medium">Markdown</div>
            <pre className="rounded-md bg-muted p-3 text-xs leading-relaxed">{MD_EXAMPLE}</pre>
            <p className="mt-1 text-muted-foreground">
              <code>## 标题</code> 分词库 · <code>- word: meaning</code> 成卡 ·{" "}
              <code>&gt;</code> 引用块作例句
            </p>
          </div>
          <Separator />
          <div>
            <div className="mb-1 font-medium">CSV</div>
            <pre className="rounded-md bg-muted p-3 text-xs">{CSV_EXAMPLE}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
