import { AIClient, getAIConfig } from "@/lib/ai-client";
import { getVocabStandard } from "@/lib/vocab";

export type AIMode = "study_material" | "corpus";

export interface AIGenerateOptions {
  mode?: AIMode;
  standard?: string;
}

/** 提取文本中合法最外层 JSON 数组 */
function extractJsonArray(raw: string): string {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return cleaned.slice(firstBracket, lastBracket + 1).trim();
  }
  return cleaned;
}

/** 从文本生成闪卡 JSON（数组 [{front, pos, back, phonetic, example, example_cn, tags}]），失败抛错 */
export async function generateCardsFromText(
  text: string,
  options?: AIMode | AIGenerateOptions
): Promise<string> {
  const cfg = await getAIConfig();
  const client = new AIClient(cfg);
  if (!client.isReady) throw new Error("AI 未配置，请先完成 AI 设置");

  const mode: AIMode =
    typeof options === "string" ? options : options?.mode ?? "study_material";
  const standard =
    typeof options === "object" && options.standard
      ? options.standard
      : await getVocabStandard();

  if (mode === "study_material") {
    // 模式一：学习资料解析（支持识别解析单词/短语、词性、词义、例句写入）
    const prompt = [
      "请深入识别并解析以下学习资料（笔记、生词表、教材讲义等），全面提取其中所有单词与短语，精准识别词性、词义，并将原文例句（若无例句则根据语境生成地道例句及译文）完整写入结构化学习卡片：",
      "",
      "【核心解析原则】",
      "1. 识别范围：全面识别资料中出现的单词、固定短语与词组，不要擅自遗漏用户想学的生词。",
      "2. 单词与短语规范：",
      "   - 单个单词：动词必须严格区分并标明及物 vt. 或不及物 vi.，严禁笼统标为 v.；名词标 n.，形容词标 adj.，副词标 adv.，介词标 prep. 等。",
      '   - 短语/词组（如 "take into account", "look forward to"）：严禁赋予词性，pos 必须留空 ""。',
      "3. 词义解析：",
      "   - 忠实提取学习资料中的中文释义（back），若资料释义不全则补充完整。单词动词释义标明及物或不及物；短语释义保持纯净中文，严禁带有任何词性前缀。",
      "4. 例句识别与写入：",
      "   - 若资料中包含原句或例句，必须优先提取原文例句及其中文翻译写入 example 和 example_cn；",
      "   - 若资料中未附带例句，请根据该词含义补齐一句自然地道的英文例句并附带中文翻译。",
      "5. 音标提取：输出标准国际音标 phonetic（如 /əˈbændən/）。",
      "",
      "【每张卡片字段】",
      "1. front — 英文单词或短语（原形，去掉数字序号、编号或点号）",
      '2. pos — 词性（单词动词必须严格标明 vt. 或 vi.；短语严禁填写词性，必须留空 ""）',
      "3. back — 准确中文释义（短语严禁带有词性前缀）",
      "4. phonetic — 音标（如 /əˈbændən/）",
      "5. example — 英文例句（优先提取资料原句，缺失则生成典型地道例句）",
      "6. example_cn — example 的准确中文译文",
      '7. tags — 标签数组（如 ["学习资料", "重点"] 等）',
      "",
      "【输出格式要求】",
      "- 必须严格输出 JSON 数组，严禁使用 markdown 代码块包裹，不要包含任何前言或解释。",
      '- 格式：[{"front":"...","pos":"vt.","back":"...","phonetic":"/.../","example":"...","example_cn":"...","tags":["学习资料"]}]',
      "",
      "【学习资料内容】",
      text.slice(0, 8000),
    ].join("\n");

    const raw = await client.chat([
      {
        role: "system",
        content:
          '你是 Reciter 英语学习应用的专业学习资料解析器。从用户提供的学习资料中准确提取单词与短语、词性、词义，并将原文例句（或地道生成例句）完整写入卡片。单词动词必须严格区分及物 vt. 或不及物 vi.，短语严禁赋予词性（pos 留空 ""），严格以 JSON 数组格式输出，不得包含任何其他内容。',
      },
      { role: "user", content: prompt },
    ]);
    return extractJsonArray(raw);
  }

  // 模式二：语料生成闪卡（基于用户输入的生语料、文章、外刊进行智能筛选提炼）
  const prompt = [
    `请分析下面的英语语料文本，为${standard}水平的学习者筛选最值得学习的单词与短语，并生成结构化学习卡片。`,
    "",
    "【筛选原则】",
    `1. 优先选择对${standard}学习者有实际学习价值的词汇和短语：高频实用词汇、阅读常见词、熟词生义/重要引申义、固定搭配和习惯表达。`,
    "2. 不要机械提取所有生词——普通基础词汇可忽略，只输出最值得学习的内容。",
    '3. 短语保持完整自然形式（如 "be associated with"），不要拆成零散单词。',
    "4. 不要提取专有名词/人名/地名，不要重复提取同一词汇。",
    "",
    "【每张卡片字段】",
    "1. front — 英文单词或短语（标准形式）",
    '2. pos — 词性（单词动词必须严格标明及物 vt. 或不及物 vi.，严禁笼统标为 v.；其余如 n./adj./adv./prep. 等；若为短语/词组，严禁赋予词性，pos 必须留空 ""）',
    "3. back — 简洁准确的中文释义，优先给出文本语境中的含义（单词动词请标明及物或不及物；短语请给出纯净中文释义，严禁带有任何词性前缀）",
    "4. phonetic — 音标（如 /əˈbændən/）",
    "5. example — 提取语料中的原句或生成一个自然地道的英文例句，准确体现 front 的含义",
    "6. example_cn — example 的准确中文翻译",
    '7. tags — 标签数组（1-3 个），可选标签："高频"、"考研"、"阅读"、"熟词生义"、"固定搭配"、"学术"、"写作"、"短语"',
    "",
    "【输出要求】",
    "- 只输出 JSON 数组，不要使用 markdown 代码块包裹，不要输出任何解释、前言或结尾文字。",
    "- 所有字符串必须是合法 JSON 字符串，正确转义内部双引号。",
    '- 格式：[{"front":"...","pos":"vt.","back":"...","phonetic":"/.../","example":"...","example_cn":"...","tags":["..."]}]',
    "",
    "【语料文本】",
    text.slice(0, 8000),
  ].join("\n");

  const raw = await client.chat([
    {
      role: "system",
      content:
        '你是 Reciter 英语学习应用的闪卡生成器。从用户提供的文本中提取有学习价值的词汇与短语。动词必须明确区分并标明及物 vt. 或不及物 vi.，短语严禁添加词性（pos 留空 ""），严格以 JSON 数组格式输出，不得包含任何其他内容。',
    },
    { role: "user", content: prompt },
  ]);
  return extractJsonArray(raw);
}
