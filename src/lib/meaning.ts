/** 词性正则（与 markdown-parser 保持一致） */
const POS_RE =
  /\b(?:n|v|vt|vi|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part)\.(?:\/(?:vt|vi|v|n|adj|adv|pron)\.)*/i;

function extractPos(text: string): string {
  const m = POS_RE.exec(text);
  return m ? m[0] : "";
}

/**
 * 从释义文本中拆分主要释义（加粗）与次要释义（非加粗）。
 * 如果非加粗部分没有词性，会承接最近一个加粗部分的词性。
 * 例如：**offspring n. 结果；产物**；子孙；后代
 *   → primary: n. 结果；产物
 *   → secondary: n. 子孙；后代
 */
export function splitMeaningText(text: string): { primary: string; secondary: string } {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  const bolds: string[] = [];
  const nonBolds: string[] = [];
  let lastPos = "";

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      const content = part.slice(2, -2).trim();
      const pos = extractPos(content);
      if (pos) lastPos = pos;
      if (content) bolds.push(content);
    } else {
      const clean = part
        .replace(/\*/g, "")
        .replace(/^[；;，,、\s]+/, "")
        .replace(/[；;，,、\s]+$/, "")
        .trim();
      if (clean) {
        const withPos = lastPos && !extractPos(clean) ? `${lastPos} ${clean}` : clean;
        nonBolds.push(withPos);
      }
    }
  }

  const primary = bolds.join(" ").trim();
  const secondary = nonBolds.join("；");
  if (primary) {
    return { primary, secondary };
  }
  return { primary: text.trim(), secondary: "" };
}
