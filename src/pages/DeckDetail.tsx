import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DeckDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/decks">
          <ArrowLeft className="size-4" />
          返回词库列表
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>词库 #{id}</CardTitle>
          <CardDescription>
            Phase 2 接入数据库后，此处展示卡片列表、进度与复习统计
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>卡片总数：0</p>
          <p>已学习：0 · 待复习：0</p>
        </CardContent>
      </Card>
    </div>
  );
}
