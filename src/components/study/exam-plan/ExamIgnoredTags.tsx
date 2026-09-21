import { Tag, Check, Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { matchTagPattern } from "@/lib/tag-filter";

interface ExamIgnoredTagsProps {
  ignoredTags: string[];
  setIgnoredTags: React.Dispatch<React.SetStateAction<string[]>>;
  availableTags: string[];
  toggleIgnoredTag: (tag: string) => void;
  customTagInput: string;
  setCustomTagInput: (val: string) => void;
  addCustomTag: () => void;
  showAllIgnored: boolean;
  setShowAllIgnored: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ExamIgnoredTags({
  ignoredTags,
  setIgnoredTags,
  availableTags,
  toggleIgnoredTag,
  customTagInput,
  setCustomTagInput,
  addCustomTag,
  showAllIgnored,
  setShowAllIgnored,
}: ExamIgnoredTagsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Tag className="size-4 text-amber-500" />
          要忽略/跳过的标签
        </Label>
        {ignoredTags.length > 0 && (
          <button
            type="button"
            onClick={() => setIgnoredTags([])}
            className="text-xs text-muted-foreground hover:underline"
          >
            清空已选
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        带有这些标签的单词将不会被安排到今日新学与到期复习中（如“已掌握”、“简单”等已熟悉的单词集合）。
      </p>

      {/* 现有标签芯片选择 */}
      {availableTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-md border bg-muted/20">
          {availableTags.map((tag) => {
            const isDirectlyIgnored = ignoredTags.includes(tag);
            const isPatternIgnored =
              !isDirectlyIgnored &&
              ignoredTags.some((p) => matchTagPattern(tag, p));
            const isIgnored = isDirectlyIgnored || isPatternIgnored;
            return (
              <Badge
                key={tag}
                variant={isIgnored ? "destructive" : "outline"}
                className="cursor-pointer select-none px-2.5 py-1 text-xs transition-all hover:scale-105"
                onClick={() => toggleIgnoredTag(tag)}
                title={
                  isPatternIgnored ? "匹配已设定的模糊/正则规则" : undefined
                }
              >
                {isIgnored && <Check className="mr-1 inline size-3" />}
                {tag}
                {isPatternIgnored && (
                  <span className="ml-1 text-[10px] opacity-75">
                    (规则匹配)
                  </span>
                )}
              </Badge>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          当前词库中暂无可用标签，可在下方手动输入需要排除的标签名。
        </p>
      )}

      {/* 自定义添加忽略标签（支持模糊与正则） */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入标签名、通配符（如*四级*）或正则（如^CET[46]、简单|已学）"
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTag();
              }
            }}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addCustomTag}
            disabled={!customTagInput.trim()}
            className="h-8 shrink-0 text-xs"
          >
            <Plus className="size-3.5 mr-1" />
            添加规则
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          支持关键词模糊匹配（如“简单”）、通配符（如“*四级*”）及正则表达式（如“^CET[46]”、“简单|已掌握”）。
        </p>
      </div>

      {/* 已选忽略标签清单展示 */}
      {ignoredTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground">已排除规则：</span>
          {(() => {
            const isFolded = !showAllIgnored && ignoredTags.length > 6;
            const displayed = isFolded ? ignoredTags.slice(0, 5) : ignoredTags;
            return (
              <>
                {displayed.map((t) => {
                  const matchCount = availableTags.filter((tag) =>
                    matchTagPattern(tag, t)
                  ).length;
                  return (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="gap-1 border-destructive/30 bg-destructive/10 text-destructive text-xs"
                      title={
                        matchCount > 0
                          ? `匹配当前 ${matchCount} 个词库标签`
                          : undefined
                      }
                    >
                      {t}
                      {matchCount > 1 && (
                        <span className="ml-0.5 rounded-full bg-destructive/20 px-1 text-[10px] font-mono">
                          {matchCount}
                        </span>
                      )}
                      <X
                        className="size-3 cursor-pointer hover:opacity-75"
                        onClick={() => toggleIgnoredTag(t)}
                      />
                    </Badge>
                  );
                })}
                {ignoredTags.length > 6 && (
                  <Badge
                    variant="outline"
                    className="cursor-pointer gap-1 text-xs border-dashed text-muted-foreground hover:bg-muted"
                    onClick={() => setShowAllIgnored(!showAllIgnored)}
                  >
                    {showAllIgnored
                      ? "收起"
                      : `……等共 ${ignoredTags.length} 条 (点击展开)`}
                  </Badge>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
