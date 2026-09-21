import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Deck } from "@/types";

interface DashboardAiTestCardProps {
  aiTestDue: boolean;
  nextAiTestLabel: string;
  aiTestDeck: Deck | null;
  onStartAiTest: () => void;
}

export default function DashboardAiTestCard({
  aiTestDue,
  nextAiTestLabel,
  aiTestDeck,
  onStartAiTest,
}: DashboardAiTestCardProps) {
  return (
    <Card className={aiTestDue ? "border-purple-500/40 bg-purple-500/5" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-purple-500" />
          AI 智能测试
        </CardTitle>
        <CardDescription>
          {aiTestDue
            ? "该测试了：AI 根据学习内容和掌握情况出题"
            : `下次测试约 ${nextAiTestLabel}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          覆盖到期与薄弱词，AI 生成语境题和选择题
        </p>
        <Button onClick={onStartAiTest} disabled={!aiTestDeck}>
          <Sparkles className="size-4" />
          开始 AI 测试
        </Button>
      </CardContent>
    </Card>
  );
}
