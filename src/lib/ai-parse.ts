/** AI 响应解析工具（纯函数，可单测） */

export interface AIGradeResult {
  grade: 1 | 2 | 3 | 4;
  comment: string;
}

/** 解析判分结果：优先 **评分**: N，其次行首数字，兜底首个 1-4 */
export function parseGradeResult(content: string): AIGradeResult {
  let grade: number | null = null;
  let comment = content.trim();
  const g1 = /\*\*评分\*\*[:：]\s*(\d)/.exec(content);
  if (g1) grade = parseInt(g1[1], 10);
  if (grade === null) {
    const g2 = /^(?:评分|grade)[:：]\s*(\d)/i.exec(content);
    if (g2) grade = parseInt(g2[1], 10);
  }
  if (grade === null) {
    const g3 = /\b([1-4])\b/.exec(content);
    if (g3) grade = parseInt(g3[1], 10);
  }
  const c1 = /\*\*评语\*\*[:：]\s*(.+)/.exec(content);
  if (c1) comment = c1[1].trim();
  const safeGrade = Math.min(4, Math.max(1, grade ?? 3)) as 1 | 2 | 3 | 4;
  return { grade: safeGrade, comment: comment.slice(0, 500) };
}

export interface SSELineResult {
  token?: string;
  done?: boolean;
  error?: string;
}

/** 解析一条 SSE 数据行（data: {...} / data: [DONE]） */
export function parseSSELine(line: string): SSELineResult {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return {};
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return { done: true };
  try {
    const json = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[];
      error?: { message?: string };
    };
    if (json.error?.message) return { error: json.error.message };
    const token = json.choices?.[0]?.delta?.content ?? "";
    return token ? { token } : {};
  } catch {
    return {}; // 忽略不完整/非 JSON 行
  }
}
