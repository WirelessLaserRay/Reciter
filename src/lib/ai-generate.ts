import { AIClient, getAIConfig } from "@/lib/ai-client";

/** 从文本生成闪卡 JSON（数组 [{front, back, tags?}]），失败抛错 */
export async function generateCardsFromText(text: string): Promise<string> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) throw new Error("AI 未配置，请先完成 AI 设置");
  const prompt = [
    "你是英语学习卡片生成器。请从以下文本中提取英语单词/短语，并为每个生成：",
    "1. front：单词/短语",
    "2. pos：词性（如 n./v./adj./phr.）",
    "3. back：中文释义",
    "4. example：一个包含该词的英文例句",
    "5. example_cn：上面例句的中文翻译",
    "6. tags：标签数组（如 [\"高频\", \"阅读\"]）",
    "只输出 JSON 数组，不要额外解释。格式：[{\"front\":\"...\",\"pos\":\"n.\",\"back\":\"...\",\"example\":\"...\",\"example_cn\":\"...\",\"tags\":[\"...\"]}]",
    "",
    "文本：",
    text.slice(0, 6000),
  ].join("\n");
  const raw = await client.chat([{ role: "user", content: prompt }]);
  return raw.replace(/```json|```/g, "").trim();
}
