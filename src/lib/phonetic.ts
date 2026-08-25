/**
 * 音标解析（导入时使用）：
 * - 忽略括号及括号内容
 * - 只要内容含空格就不解析音标
 * - 含斜杠时提取斜杠之间的内容作为音标
 */
export function extractPhoneticFromText(raw: string): string {
  const noParen = raw
    .replace(/[（(][^（）()]*[）)]/g, "")
    .trim();
  if (!noParen || noParen.includes(" ")) return "";
  const firstSlash = noParen.indexOf("/");
  if (firstSlash < 0) return "";
  const secondSlash = noParen.indexOf("/", firstSlash + 1);
  if (secondSlash < 0) return "";
  const phonetic = noParen.slice(firstSlash + 1, secondSlash).trim();
  return phonetic ? `/${phonetic}/` : "";
}

/**
 * 学习界面同步取音标：
 * 卡片自带音标优先；否则用已异步获取并缓存的音标；都没有返回空。
 * 避免切换卡片时等异步状态更新造成音标“迟滞”。
 */
export function getDisplayPhonetic(
  stored: string,
  fetchedByCard: Record<number, string> | undefined,
  cardId: number,
): string {
  return stored || fetchedByCard?.[cardId] || "";
}
