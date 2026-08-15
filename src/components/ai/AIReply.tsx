import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { parseAIJSON } from "@/lib/ai-parse";

/** 教学优先的 JSON 字段 → 展示区段 */
const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "explanation", label: "讲解", icon: "💡" },
  { key: "etymology", label: "词根词缀", icon: "📖" },
  { key: "mnemonic", label: "助记", icon: "🧠" },
  { key: "usage", label: "用法搭配", icon: "🔤" },
  { key: "examples", label: "例句", icon: "📝" },
  { key: "derived", label: "引申词 / 词族", icon: "🌱" },
  { key: "confusable", label: "易混词", icon: "⚡" },
  { key: "practice", label: "小练习", icon: "✏️" },
  { key: "follow_up", label: "追问", icon: "❓" },
  // 兼容旧 schema
  { key: "question", label: "题目", icon: "✏️" },
  { key: "prompt", label: "练习", icon: "✏️" },
  { key: "sample_answer", label: "参考答案", icon: "✔️" },
  { key: "quiz_chain", label: "递进练习", icon: "📚" },
];

function renderValue(v: unknown): React.ReactNode {
  if (Array.isArray(v)) {
    const items = v.filter((x) => typeof x === "string" && x.trim());
    if (items.length === 0) return null;
    return (
      <ul className="space-y-0.5 text-[13px] leading-relaxed">
        {items.map((t, i) => (
          <li key={i}>• {t}</li>
        ))}
      </ul>
    );
  }
  if (typeof v === "string" && v.trim()) {
    return <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{v}</p>;
  }
  if (v && typeof v === "object") {
    // 嵌套对象（如 { options: [...] }）拼成文本
    const obj = v as Record<string, unknown>;
    const parts = Object.values(obj)
      .filter((x): x is string => typeof x === "string" && !!x.trim())
      .map((x) => x.trim());
    if (parts.length === 0) return null;
    return <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{parts.join("；")}</p>;
  }
  return null;
}

/** 将 AI 的 JSON 结构化回复渲染为教学卡片 */
export function StructuredReply({ data }: { data: Record<string, unknown> }) {
  const known = SECTIONS.map((s) => {
    const v = data[s.key];
    const body = renderValue(v);
    if (body === null) return null;
    return (
      <div key={s.key}>
        <p className="mb-0.5 text-xs font-semibold text-muted-foreground">
          {s.icon} {s.label}
        </p>
        {body}
      </div>
    );
  }).filter(Boolean);

  // 未知字段兜底（保证任何 JSON 都能展示，而不是裸露代码块）
  const extra = Object.entries(data)
    .filter(([k]) => !SECTIONS.some((s) => s.key === k))
    .map(([k, v]) => {
      const body = renderValue(v);
      if (body === null) return null;
      return (
        <div key={k}>
          <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{k}</p>
          {body}
        </div>
      );
    })
    .filter(Boolean);

  if (known.length === 0 && extra.length === 0) return null;
  return (
    <div className="space-y-2.5 text-left">
      {known}
      {extra}
    </div>
  );
}

/**
 * AI 消息内容渲染：
 * 1. 尝试解析为 JSON 结构化教学卡片
 * 2. 非 JSON（或 JSON 无已知字段）→ markdown 渲染
 */
export function MessageContent({ content }: { content: string }) {
  const parsed = useMemo(() => {
    try {
      const j = parseAIJSON<Record<string, unknown>>(content);
      return j && typeof j === "object" ? j : null;
    } catch {
      return null;
    }
  }, [content]);

  if (parsed) {
    const structured = <StructuredReply data={parsed} />;
    if (structured !== null) return structured;
  }

  return (
    <div className="space-y-1.5 text-left text-[13px] leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
