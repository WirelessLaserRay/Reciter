import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DeckList() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");

  const createDeck = () => {
    // Phase 2: 调用 db.createDeck()
    console.log("create deck:", name);
    setName("");
    setShowCreate(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">词库</h2>
          <p className="text-sm text-muted-foreground">
            Phase 2 接入 SQLite 后支持完整增删改查
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-4" />
          新建词库
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="flex items-end gap-3 pt-6">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="deck-name">词库名称</Label>
              <Input
                id="deck-name"
                placeholder="如：考研核心词汇"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createDeck()}
              />
            </div>
            <Button onClick={createDeck} disabled={!name.trim()}>
              创建
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="size-10 text-muted-foreground" />
          <CardTitle>还没有词库</CardTitle>
          <CardDescription className="max-w-sm">
            通过「导入」页面可批量导入 Markdown / CSV 词库，
            或在上方创建空白词库手动添加卡片。
          </CardDescription>
          <Button asChild variant="outline">
            <Link to="/import">前往导入</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
