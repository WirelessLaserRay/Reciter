import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const RATINGS = [
  { grade: 1, label: "忘了", hint: "Again" },
  { grade: 2, label: "困难", hint: "Hard" },
  { grade: 3, label: "良好", hint: "Good" },
  { grade: 4, label: "简单", hint: "Easy" },
];

export default function Study() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
            返回
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">队列：0 / 0</span>
      </div>

      {/* 卡片翻转区（Phase 3 接入真实数据） */}
      <div className="[perspective:1000px]">
        <div
          className={cn(
            "relative min-h-72 w-full transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* 正面 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8 [backface-visibility:hidden]">
            <CardDescription>正面 · 单词</CardDescription>
            <div className="text-4xl font-bold">apple</div>
            <Button variant="outline" onClick={() => setFlipped(true)}>
              显示答案
            </Button>
          </div>
          {/* 背面 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <CardDescription>背面 · 释义</CardDescription>
            <div className="text-2xl font-semibold">🍎 苹果；苹果公司</div>
            <p className="text-sm text-muted-foreground">
              例句: An apple a day keeps the doctor away.
            </p>
          </div>
        </div>
      </div>

      {/* 评分按钮 */}
      <div className="grid grid-cols-4 gap-3">
        {RATINGS.map((r) => (
          <Button
            key={r.grade}
            variant="outline"
            className="flex-col gap-0.5 py-3"
            disabled={!flipped}
          >
            <span>{r.label}</span>
            <span className="text-xs text-muted-foreground">{r.hint}</span>
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>学习模式</CardTitle>
          <CardDescription>
            Phase 3 接入 ts-fsrs (FSRS-5) 后启用：评分将驱动记忆间隔调度
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>当前为 Phase 1 预览界面，数据与调度逻辑将在后续阶段接入。</p>
        </CardContent>
      </Card>
    </div>
  );
}
