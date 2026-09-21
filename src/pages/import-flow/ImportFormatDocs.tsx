import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function ImportFormatDocs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>支持的格式</CardTitle>
        <CardDescription>解析规则（对齐 templates 样式与 PLAN 规范）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="mb-1 font-medium">Markdown（templates 样式）</div>
          <pre className="rounded-md bg-muted p-3 text-xs leading-relaxed">
            {[
              "# 考研英语复习",
              "",
              "## Unit 1",
              "",
              "### 1.1 熟词生义",
              "",
              "- **radiate vt./vi. (from) 发散；流露出**",
              "- plain_word n. 次要词条",
              "",
              "## Unit 2",
            ].join("\n")}
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
              {'[{"front":"abandon","back":"放弃"}]'}
            </pre>
            <p className="mt-1 text-muted-foreground">数组或 {'{ "cards": [...] }'} 对象</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
