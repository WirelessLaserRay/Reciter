/** 从释义文本中拆分主要释义（加粗）与次要释义（非加粗） */
export function splitMeaningText(text: string): { primary: string; secondary: string } {
  const bolds: string[] = [];
  const plain = text
    .replace(/\*\*([^*]+)\*\*/g, (_m, p: string) => {
      const t = p.trim();
      if (t) bolds.push(t);
      return "";
    })
    .replace(/\*/g, "")
    .trim();
  const primary = bolds.join(" ").trim();
  const secondary = plain;
  if (primary) {
    return { primary, secondary };
  }
  return { primary: text.trim(), secondary: "" };
}
