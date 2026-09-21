import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ImportProgressModalProps {
  importProgress: {
    phase: "" | "phonetic" | "db";
    done: number;
    total: number;
  };
}

export default function ImportProgressModal({
  importProgress,
}: ImportProgressModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-sm font-medium">正在导入，可能需要较长时间</p>
          <p className="text-xs text-muted-foreground">请勿切换页面或关闭窗口</p>
          <p className="text-sm text-muted-foreground">
            {importProgress.phase === "phonetic"
              ? `正在获取音标… ${importProgress.done} / ${importProgress.total}`
              : importProgress.phase === "db"
                ? `正在写入数据库… ${importProgress.done} / ${importProgress.total}`
                : "准备中…"}
          </p>
          {importProgress.total > 0 && (
            <div className="w-64">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{
                    width: `${Math.round((importProgress.done / importProgress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {Math.round((importProgress.done / importProgress.total) * 100)}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
