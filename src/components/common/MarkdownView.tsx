import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export default function MarkdownView({ content, className = "" }: MarkdownViewProps) {
  if (!content || !content.trim()) return null;

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none text-left leading-relaxed
        [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2.5 [&_h1]:mb-1 [&_h1]:text-foreground
        [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-foreground
        [&_h3]:text-xs [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-foreground
        [&_p]:my-1.5 [&_p]:leading-relaxed
        [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5
        [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5
        [&_li]:my-0.5
        [&_strong]:font-semibold [&_strong]:text-foreground
        [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-2.5 [&_blockquote]:my-1.5 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
        [&_code]:rounded [&_code]:bg-muted/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px]
        [&_pre]:rounded-md [&_pre]:bg-muted/60 [&_pre]:p-2.5 [&_pre]:my-2 [&_pre]:overflow-x-auto
        [&_hr]:my-2 [&_hr]:border-border/60
        ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
