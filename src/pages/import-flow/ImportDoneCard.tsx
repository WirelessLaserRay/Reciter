import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import type { ImportResult } from "./types";

interface ImportDoneCardProps {
  result: ImportResult;
  backgroundPhonetic: boolean;
  onReset: () => void;
}

export default function ImportDoneCard({
  result,
  backgroundPhonetic,
  onReset,
}: ImportDoneCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <CheckCircle2 className="size-10 text-green-500" />
        <CardTitle>导入完成</CardTitle>
        <CardDescription className="max-w-md">
          新建 <span className="font-semibold text-foreground">{result.created}</span> 张 ·
          更新 <span className="font-semibold text-foreground">{result.updated}</span> 张 ·
          跳过 <span className="font-semibold text-foreground">{result.skipped}</span> 张 ·
          涉及 {result.decks} 个词库
        </CardDescription>
        {backgroundPhonetic && (
          <p className="text-xs text-amber-600">
            音标补齐正在后台进行，可先离开此页面。
          </p>
        )}
        <div className="flex gap-3">
          <Button onClick={onReset}>继续导入</Button>
          <Button asChild variant="outline">
            <Link to="/decks">查看词库</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
