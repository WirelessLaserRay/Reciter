import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarkdownContextProps {
  /** cards.markdown_content 原始片段（列表项 + 可选引用例句） */
  markdownContent: string;
  /** 目标词（高亮所有出现位置，不区分大小写） */
  word: string;
  /** 折叠模式下最多显示行数 */
  maxCollapsedLines?: number;
}

/** 去掉行内 Markdown 标记，保留纯文本 */
function stripInlineMarkdown(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // 链接
    .replace(/\*\*(.+?)\*\*/g, "$1")          // 粗体
    .replace(/\*([^*]+)\*/g, "$1")            // 斜体
    .replace(/`([^`]*)`/g, "$1")              // 行内代码
    .replace(/==([^=]+)==/g, "$1")            // 高亮素材
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 在一行文本中高亮目标词的所有出现位置 */
function highlightWord(line: string, word: string): ReactNode[] {
  const w = word.trim();
  if (!w) return [line];
  const parts = line.split(new RegExp("(" + escapeRegExp(w) + ")", "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-amber-500/25 px-0.5 font-medium">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/**
 * 语境沉浸展示（Phase 6C.2）：
 * 学习时展示 Markdown 原始数据的上下文，高亮目标词；默认折叠，可展开完整内容。
 */
export default function MarkdownContext({
  markdownContent,
  word,
  maxCollapsedLines = 3,
}: MarkdownContextProps) {
  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => {
    const raw = stripInlineMarkdown(markdownContent ?? "");
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*+]\s+)?/, "").trimEnd())
      .filter((l) => l.length > 0);
  }, [markdownContent]);

  if (lines.length === 0) return null;

  const collapsible = lines.length > maxCollapsedLines;
  const visible = expanded || !collapsible ? lines : lines.slice(0, maxCollapsedLines);

  return (
    <div className="rounded-lg border-l-2 border-primary/60 bg-muted/40 p-3 text-left">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <BookOpen className="size-3.5" />
          原文语境
        </p>
        {collapsible && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "收起" : "展开全部"}
          </Button>
        )}
      </div>
      <div className="space-y-1 text-sm leading-relaxed">
        {visible.map((line, i) => (
          <p key={i} className="whitespace-pre-wrap break-words">
            {highlightWord(line, word)}
          </p>
        ))}
        {collapsible && !expanded && (
          <p className="text-xs text-muted-foreground">… 共 {lines.length} 行，点击展开</p>
        )}
      </div>
    </div>
  );
}
