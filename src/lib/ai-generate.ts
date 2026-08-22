import { AIClient, getAIConfig } from "@/lib/ai-client";

/** 从文本生成闪卡 JSON（数组 [{front, back, tags?}]），失败抛错 */
export async function generateCardsFromText(text: string): Promise<string> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) throw new Error("AI 未配置，请先完成 AI 设置");
  const prompt = [
    "你是英语学习卡片生成器。请从以下文本中提取英语单词/短语，并为每个生成：",
    "1. front：单词/短语",
    "2. back：中文释义（如需要可附简短例句）",
    "3. tags：标签数组（如 [\"高频\", \"阅读\"]）",
    "只输出 JSON 数组，不要额外解释。格式：[{\"front\":\"...\",\"back\":\"...\",\"tags\":[\"...\"]}]",
    "",
    "文本：",
    text.slice(0, 6000),
  ].join("\n");
  const raw = await client.chat([{ role: "user", content: prompt }]);
  return raw.replace(/```json|```/g, "").trim();
}
