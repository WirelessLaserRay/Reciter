import { BookOpen } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCompactList } from "@/lib/exam-planner";
import type { Deck } from "@/types";

interface ExamDeckSelectorProps {
  decks: Deck[];
  cardCounts: Record<number, number> | undefined;
  selectedDeckIds: number[];
  setSelectedDeckIds: React.Dispatch<React.SetStateAction<number[]>>;
  toggleDeck: (id: number) => void;
}

export default function ExamDeckSelector({
  decks,
  cardCounts,
  selectedDeckIds,
  setSelectedDeckIds,
  toggleDeck,
}: ExamDeckSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <BookOpen className="size-4 text-primary" />
          学习目标词库
        </Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDeckIds(decks.map((d) => d.id))}
            className="text-xs text-primary hover:underline"
          >
            全选
          </button>
          <span className="text-muted-foreground/40 text-xs">|</span>
          <button
            type="button"
            onClick={() => setSelectedDeckIds([])}
            className="text-xs text-muted-foreground hover:underline"
          >
            全部 (不限制)
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        支持勾选多个词库进行联合学习调度。若未勾选任何词库，则默认覆盖全部词库。
      </p>
      {selectedDeckIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
          <span className="text-muted-foreground">已选词库：</span>
          {(() => {
            const names = decks
              .filter((d) => selectedDeckIds.includes(d.id))
              .map((d) => (d.folder ? `${d.folder}/${d.name}` : d.name));
            const summary = formatCompactList(names, 3);
            return (
              <>
                {summary.displayed.map((n) => (
                  <Badge
                    key={n}
                    variant="secondary"
                    className="px-2 py-0.5 text-xs font-normal max-w-[150px] truncate bg-primary/10 text-primary border border-primary/20"
                  >
                    {n}
                  </Badge>
                ))}
                {summary.remainingCount > 0 && (
                  <Badge
                    variant="outline"
                    className="px-2 py-0.5 text-xs font-normal text-muted-foreground cursor-help hover:bg-muted"
                    title={`全部已选词库 (${summary.totalCount}个):\n${summary.fullText}`}
                  >
                    ……等共 {summary.totalCount} 个词库
                  </Badge>
                )}
              </>
            );
          })()}
        </div>
      )}
      <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1 bg-background/50">
        {decks.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            暂无词库，请先创建或导入词库
          </div>
        ) : (
          decks.map((d) => {
            const isSelected = selectedDeckIds.includes(d.id);
            return (
              <label
                key={d.id}
                className={`flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-sm transition-colors ${
                  isSelected ? "bg-primary/10 font-medium" : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-gray-300 text-primary"
                    checked={isSelected}
                    onChange={() => toggleDeck(d.id)}
                  />
                  <span className="truncate">
                    {d.folder ? `${d.folder}/${d.name}` : d.name}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {cardCounts?.[d.id] ?? 0} 词
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
