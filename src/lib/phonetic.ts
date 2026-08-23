/**
 * 音标解析（导入时使用）：
 * - 忽略括号及括号内容
 * - 含斜杠时提取斜杠之间的内容作为音标
 * - 斜杠前内容若含空格（词组）则不解析
 */
export function extractPhoneticFromText(raw: string): string {
  const noParen = raw
    .replace(/[（(][^（）()]*[）)]/g, "")
    .trim();
  if (!noParen) return "";
  const firstSlash = noParen.indexOf("/");
  if (firstSlash < 0) return "";
  const wordPart = noParen.slice(0, firstSlash).trim();
  if (!wordPart || wordPart.includes(" ")) return "";
  const secondSlash = noParen.indexOf("/", firstSlash + 1);
  if (secondSlash < 0) return "";
  const phonetic = noParen.slice(firstSlash + 1, secondSlash).trim();
  return phonetic ? `/${phonetic}/` : "";
}
