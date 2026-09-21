import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { QUICK_EXAM_PRESETS } from "./types";

interface ExamBasicFieldsProps {
  title: string;
  setTitle: (val: string) => void;
  date: string;
  setDate: (val: string) => void;
  daysUntil: number;
}

export default function ExamBasicFields({
  title,
  setTitle,
  date,
  setDate,
  daysUntil,
}: ExamBasicFieldsProps) {
  return (
    <>
      {/* 1. 考试名称与快速填入 */}
      <div className="space-y-2">
        <Label htmlFor="exam-title" className="text-sm font-medium">
          考试 / 目标名称
        </Label>
        <Input
          id="exam-title"
          placeholder="例如：大学英语六级、考研英语、托福单词冲刺"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {QUICK_EXAM_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTitle(preset)}
              className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 考试日期与倒计时 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="exam-date" className="text-sm font-medium">
            考试目标日期 <span className="text-red-500">*</span>
          </Label>
          <Input
            id="exam-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex items-end pb-1">
          {date ? (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3.5 py-2 text-sm text-blue-700 dark:text-blue-300 w-full flex items-center justify-between">
              <span className="font-medium">距离目标考试：</span>
              <span className="font-bold text-lg">{daysUntil} 天</span>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground w-full">
              请先选择考试日期以计算每日配额
            </div>
          )}
        </div>
      </div>
    </>
  );
}
