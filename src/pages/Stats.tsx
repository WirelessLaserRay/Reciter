import { BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

export default function Stats() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">学习统计</h2>
        <p className="text-sm text-muted-foreground">
          复习趋势 · 记忆保留率 · 热力图（Phase 5 实现）
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <BarChart3 className="size-10 text-muted-foreground" />
          <CardTitle>暂无统计数据</CardTitle>
          <CardDescription>
            Phase 5 将展示复习量柱状图、记忆保留率折线图与 365 天学习热力图
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
