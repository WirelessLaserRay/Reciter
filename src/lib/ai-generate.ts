import { AIClient, getAIConfig } from "@/lib/ai-client";
import { getVocabStandard } from "@/lib/vocab";

/** 从文本生成闪卡 JSON（数组 [{front, back, tags?}]），失败抛错 */
export async function generateCardsFromText(text: string): Promise<string> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) throw new Error("AI 未配置，请先完成 AI 设置");
  const standard = await getVocabStandard();
  const prompt = [
    `请分析下面的英语文本，为${standard}水平的学习者筛选最值得学习的单词与短语，并生成结构化学习卡片。`,
    "",
    "【筛选原则】",
    `1. 优先选择对${standard}学习者有实际学习价值的词汇和短语：高频实用词汇、阅读常见词、熟词生义/重要引申义、固定搭配和习惯表达。`,
    "2. 不要机械提取所有生词——普通基础词汇可忽略，只输出最值得学习的内容。",
    "3. 短语保持完整自然形式（如 \"be associated with\"），不要拆成零散单词。",
    "4. 不要提取专有名词/人名/地名，不要重复提取同一词汇。",
    "",
    "【每张卡片字段】",
    "1. front — 英文单词或短语（标准形式）",
    "2. pos — 词性（n./v./adj./adv./prep./phr. 等）",
    "3. back — 简洁准确的中文释义，优先给出文本语境中的含义",
    "4. example — 一个自然、地道的英文例句（不要照抄原文），必须准确体现 front 的含义",
    "5. example_cn — example 的准确中文翻译",
    "6. tags — 标签数组（1-3 个），可选标签：\"高频\"、\"考研\"、\"阅读\"、\"熟词生义\"、\"固定搭配\"、\"学术\"、\"写作\"、\"短语\"",
    "",
    "【输出要求】",
    "- 只输出 JSON 数组，不要使用 markdown 代码块包裹，不要输出任何解释、前言或结尾文字。",
    "- 所有字符串必须是合法 JSON 字符串，正确转义内部双引号。",
    "- 格式：[{\"front\":\"...\",\"pos\":\"n.\",\"back\":\"...\",\"example\":\"...\",\"example_cn\":\"...\",\"tags\":[\"...\"]}]",
    "",
    "【文本】",
    text.slice(0, 6000),
  ].join("\n");
  const raw = await client.chat([
    { role: "system", content: "你是 Reciter 英语学习应用的闪卡生成器。从用户提供的文本中提取有学习价值的词汇，严格以 JSON 数组格式输出，不得包含任何其他内容。" },
    { role: "user", content: prompt },
  ]);
  return raw.replace(/```json|```/g, "").trim();
}
