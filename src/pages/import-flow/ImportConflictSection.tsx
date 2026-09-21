import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeckTarget } from "./types";

interface ImportConflictSectionProps {
  deckTargets: Record<string, DeckTarget>;
  onSelectDeckTarget: (deckName: string, value: string) => void;
}

export default function ImportConflictSection({
  deckTargets,
  onSelectDeckTarget,
}: ImportConflictSectionProps) {
  const hasConflict = Object.values(deckTargets).some(
    (t) => t.options.length > 1
  );
  if (!hasConflict) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>词库冲突处理</CardTitle>
        <CardDescription>
          检测到重名词库，请选择导入目标；选择「新建」会生成 *_1 词库
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(deckTargets)
          .filter(([, t]) => t.options.length > 1)
          .map(([deckName, t]) => (
            <div
              key={deckName}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm font-medium">{deckName}</span>
              <Select
                value={
                  t.deckId !== null ? `id:${t.deckId}` : `new:${t.name}`
                }
                onValueChange={(v) => onSelectDeckTarget(deckName, v)}
              >
                <SelectTrigger className="w-64 sm:w-72">
                  <SelectValue>
                    {t.options.find(
                      (opt) =>
                        (opt.deckId !== null
                          ? `id:${opt.deckId}`
                          : `new:${opt.name}`) ===
                        (t.deckId !== null
                          ? `id:${t.deckId}`
                          : `new:${t.name}`)
                    )?.label ?? "选择导入目标"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="w-64 sm:w-72 max-h-60">
                  {t.options.map((opt) => (
                    <SelectItem
                      key={
                        opt.deckId !== null
                          ? `id:${opt.deckId}`
                          : `new:${opt.name}`
                      }
                      value={
                        opt.deckId !== null
                          ? `id:${opt.deckId}`
                          : `new:${opt.name}`
                      }
                      className="py-2"
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
