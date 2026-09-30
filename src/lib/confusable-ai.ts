import { createStore, get, set } from "idb-keyval";
import { AIClient, getAIConfig } from "@/lib/ai-client";
import { orthographicScore, levenshtein } from "@/lib/similar-words";

export interface ConfusableItem {
  word: string;
  meaning: string;
  distinction?: string;
}

export interface ConfusableResult {
  targetWord: string;
  items: ConfusableItem[];
  source: "ai" | "curated" | "none";
}

/**
 * 形近词外形相似度门禁校验：
 * 1. 单词不能与目标词相同
 * 2. 长度差异不超过 2 个字母
 * 3. 严格编辑距离门禁：
 *    - 短词 (<=5)：差异最多 1 个字母（如 adapt ↔ adopt, loose ↔ lose）
 *    - 中长词 (>=6)：差异最多 2 个字母（如 access ↔ assess, stationary ↔ stationery）
 *    - 极长词 (>=10)：最多 3 个字母（且编辑距离与长度比 <= 0.3）
 * 4. 综合形近度打分需 >= 0.70
 * 坚决杜绝大模型强行拉扯仅有相同前缀的无关词（如 computer ↔ competitor）、押韵词或无关词
 */
export function isTrueConfusableCandidate(target: string, candidate: string): boolean {
  const t = target.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!t || !c || t === c) return false;

  const lenDiff = Math.abs(t.length - c.length);
  if (lenDiff > 2) return false;

  const maxLen = Math.max(t.length, c.length);
  const dist = levenshtein(t, c);

  const maxAllowedDist =
    maxLen <= 5 ? 1 : maxLen < 10 ? 2 : dist <= 3 && dist / maxLen <= 0.3 ? 3 : 2;
  if (dist > maxAllowedDist) return false;

  const score = orthographicScore(t, c);
  return score >= 0.7;
}

const confusableStore =
  typeof window !== "undefined" && window.indexedDB
    ? createStore("reciter_cache_db", "ai_confusables_store")
    : undefined;

const memoryCache = new Map<string, Promise<ConfusableResult>>();

export function clearConfusableMemoryCache() {
  memoryCache.clear();
}

/**
 * 经典高频形近易混词离线精选库（覆盖四六级、考研、雅思、托福、专八核心高频易混词）
 * 在离线或未配置 AI 时提供即时高质量匹配
 */
export const CURATED_CONFUSABLES: Record<string, ConfusableItem[]> = {
  adapt: [
    { word: "adopt", meaning: "v. 采纳；收养", distinction: "字母 o 联想 open 怀抱表示收养" },
    { word: "adept", meaning: "adj. 熟练的，内行的", distinction: "字母 e 联想 expert 专家表示熟练" },
  ],
  adopt: [
    { word: "adapt", meaning: "v. 适应；改编", distinction: "字母 a 联想 adjust 调整适应" },
    { word: "adept", meaning: "adj. 熟练的，内行的", distinction: "字母 e 联想 expert 专家表示熟练" },
  ],
  adept: [
    { word: "adapt", meaning: "v. 适应；改编", distinction: "字母 a 联想 adjust 调整适应" },
    { word: "adopt", meaning: "v. 采纳；收养", distinction: "字母 o 联想 open 怀抱表示收养" },
  ],
  affect: [
    { word: "effect", meaning: "n. 效果；影响 v. 产生，引起", distinction: "affect 常用作动词，effect 常用作名词" },
  ],
  effect: [
    { word: "affect", meaning: "v. 影响；假装", distinction: "affect 常用作动词，effect 常用作名词" },
  ],
  access: [
    { word: "assess", meaning: "v. 评估；评定", distinction: "access 双 c 表示通道通路，assess 双 s 表示评估" },
    { word: "excess", meaning: "n. 过度；过量", distinction: "ex- 向外，超出限度" },
  ],
  assess: [
    { word: "access", meaning: "n./v. 进入；使用权", distinction: "access 双 c 表示通道通路，assess 双 s 表示评估" },
    { word: "asset", meaning: "n. 资产；有价值的人或物", distinction: "单 s 偏重资产财富，双 s 偏重评估测定" },
  ],
  accept: [
    { word: "except", meaning: "prep. 除...之外", distinction: "ac- 接受纳入，ex- 排除除外" },
  ],
  except: [
    { word: "accept", meaning: "v. 接受；认可", distinction: "ac- 接受纳入，ex- 排除除外" },
  ],
  compliment: [
    { word: "complement", meaning: "n./v. 补充；互补物", distinction: "字母 i 联想 I 称赞我，字母 e 联想 complete 补全" },
  ],
  complement: [
    { word: "compliment", meaning: "n./v. 称赞；赞美", distinction: "字母 i 联想 I 称赞我，字母 e 联想 complete 补全" },
  ],
  principal: [
    { word: "principle", meaning: "n. 原则；原理", distinction: "pal 联想校长的朋友，ple 联想 rule 规则" },
  ],
  principle: [
    { word: "principal", meaning: "adj. 主要的 n. 校长", distinction: "pal 联想校长的朋友，ple 联想 rule 规则" },
  ],
  stationary: [
    { word: "stationery", meaning: "n. 文具；信纸", distinction: "ary 意为固定的，ery 中 e 联想 pen/eraser 文具" },
  ],
  stationery: [
    { word: "stationary", meaning: "adj. 静止的；固定的", distinction: "ary 意为固定的，ery 中 e 联想 pen/eraser 文具" },
  ],
  discrete: [
    { word: "discreet", meaning: "adj. 谨慎的；慎重的", distinction: "discrete 两 e 被 t 分开表离散，discreet 两 e 相邻表低调" },
  ],
  discreet: [
    { word: "discrete", meaning: "adj. 离散的；不连续的", distinction: "discrete 两 e 被 t 分开表离散，discreet 两 e 相邻表低调" },
  ],
  council: [
    { word: "counsel", meaning: "n./v. 建议；法律顾问", distinction: "cil 委员会，sel 劝告咨询" },
  ],
  counsel: [
    { word: "council", meaning: "n. 委员会；理事会", distinction: "cil 委员会，sel 劝告咨询" },
  ],
  continual: [
    { word: "continuous", meaning: "adj. 连续不断的；无间断的", distinction: "continual 频密有间隔，continuous 持续无停顿" },
  ],
  continuous: [
    { word: "continual", meaning: "adj. 频繁的；断断续续的", distinction: "continual 频密有间隔，continuous 持续无停顿" },
  ],
  emigrate: [
    { word: "immigrate", meaning: "v. 移居入境；迁入", distinction: "e- 向外出境，im- 向内入境" },
  ],
  immigrate: [
    { word: "emigrate", meaning: "v. 移居国外；迁出", distinction: "e- 向外出境，im- 向内入境" },
  ],
  altitude: [
    { word: "attitude", meaning: "n. 态度；看法", distinction: "alt 高度，att 态度，apt 天赋" },
    { word: "aptitude", meaning: "n. 天赋；天资", distinction: "apt 资质才能，att 态度看法" },
  ],
  attitude: [
    { word: "altitude", meaning: "n. 海拔；高度", distinction: "alt 高度，att 态度，apt 天赋" },
    { word: "aptitude", meaning: "n. 天赋；天资", distinction: "apt 资质才能，att 态度看法" },
  ],
  aptitude: [
    { word: "altitude", meaning: "n. 海拔；高度", distinction: "alt 高度，att 态度，apt 天赋" },
    { word: "attitude", meaning: "n. 态度；看法", distinction: "apt 资质才能，att 态度看法" },
  ],
  loose: [
    { word: "lose", meaning: "v. 失去；输掉", distinction: "loose 两个 o 宽松松动，lose 单个 o 丢失" },
  ],
  lose: [
    { word: "loose", meaning: "adj. 宽松的；松散的", distinction: "loose 两个 o 宽松松动，lose 单个 o 丢失" },
  ],
  wander: [
    { word: "wonder", meaning: "v. 想知道 n. 奇迹", distinction: "a 迈步漫游，o 睁大眼睛惊奇" },
  ],
  wonder: [
    { word: "wander", meaning: "v. 漫步；徘徊", distinction: "a 迈步漫游，o 睁大眼睛惊奇" },
  ],
  desert: [
    { word: "dessert", meaning: "n. 甜点；甜食", distinction: "单 s 沙漠荒凉，双 s 甜品美味加倍" },
  ],
  dessert: [
    { word: "desert", meaning: "n. 沙漠 v. 遗弃", distinction: "单 s 沙漠荒凉，双 s 甜品美味加倍" },
  ],
  ensure: [
    { word: "insure", meaning: "v. 给...投保；承保", distinction: "en- 确保发生，in- 购买保险" },
    { word: "assure", meaning: "v. 向...保证；使确信", distinction: "as- 消除疑虑向人保证" },
  ],
  insure: [
    { word: "ensure", meaning: "v. 确保；保证", distinction: "en- 确保发生，in- 购买保险" },
    { word: "assure", meaning: "v. 向...保证；使确信", distinction: "as- 消除疑虑向人保证" },
  ],
  assure: [
    { word: "ensure", meaning: "v. 确保；保证", distinction: "en- 确保发生，in- 购买保险" },
    { word: "insure", meaning: "v. 给...投保；承保", distinction: "as- 消除疑虑向人保证" },
  ],
  eminent: [
    { word: "imminent", meaning: "adj. 迫近的；即将来临的", distinction: "e- 杰出显赫，im- 迫在眉睫" },
  ],
  imminent: [
    { word: "eminent", meaning: "adj. 杰出的；著名的", distinction: "e- 杰出显赫，im- 迫在眉睫" },
  ],
  allusion: [
    { word: "illusion", meaning: "n. 错觉；幻觉", distinction: "al- 典故暗指，il- 虚幻幻影" },
    { word: "delusion", meaning: "n. 妄想；错觉", distinction: "de- 偏执妄想" },
  ],
  illusion: [
    { word: "allusion", meaning: "n. 暗指；典故", distinction: "al- 典故暗指，il- 虚幻幻影" },
    { word: "delusion", meaning: "n. 妄想；错觉", distinction: "de- 偏执妄想" },
  ],
  precede: [
    { word: "proceed", meaning: "v. 继续进行；前进", distinction: "pre- 在前发生，pro- 向前行进" },
  ],
  proceed: [
    { word: "precede", meaning: "v. 先于；在...之前", distinction: "pre- 在前发生，pro- 向前行进" },
  ],
  capital: [
    { word: "capitol", meaning: "n. 国会大厦", distinction: "al 首都资本，ol 圆顶大厦" },
  ],
  capitol: [
    { word: "capital", meaning: "n. 首都；资金 adj. 首要的", distinction: "al 首都资本，ol 圆顶大厦" },
  ],
  conscious: [
    { word: "conscientious", meaning: "adj. 认真的；尽责的", distinction: "conscious 有知觉清醒，conscientious 尽职尽责" },
    { word: "conscience", meaning: "n. 良心；道德心", distinction: "conscience 道德良知" },
  ],
  persecute: [
    { word: "prosecute", meaning: "v. 起诉；检举", distinction: "per- 迫害折磨，pro- 起诉追责" },
  ],
  prosecute: [
    { word: "persecute", meaning: "v. 迫害；残害", distinction: "per- 迫害折磨，pro- 起诉追责" },
  ],
  eligible: [
    { word: "illegible", meaning: "adj. 难辨认的；字迹模糊的", distinction: "e-lig 有资格当选，il-leg 无法辨读" },
  ],
  illegible: [
    { word: "eligible", meaning: "adj. 合格的；符合条件的", distinction: "e-lig 有资格当选，il-leg 无法辨读" },
  ],
  ingenious: [
    { word: "ingenuous", meaning: "adj. 天真的；坦率的", distinction: "i 联想 intelligence 聪明精巧，u 纯真坦率" },
  ],
  ingenuous: [
    { word: "ingenious", meaning: "adj. 灵巧的；精妙的", distinction: "i 联想 intelligence 聪明精巧，u 纯真坦率" },
  ],
  perceive: [
    { word: "conceive", meaning: "v. 构想；怀孕", distinction: "per- 察觉感知，con- 构想孕育" },
    { word: "deceive", meaning: "v. 欺骗；蒙蔽", distinction: "de- 欺诈欺骗" },
  ],
  deceive: [
    { word: "perceive", meaning: "v. 感知；察觉", distinction: "per- 察觉感知，de- 欺诈欺骗" },
    { word: "conceive", meaning: "v. 构想；怀孕", distinction: "con- 构想孕育，de- 欺诈欺骗" },
  ],
  conceive: [
    { word: "perceive", meaning: "v. 感知；察觉", distinction: "per- 察觉感知，con- 构想孕育" },
    { word: "deceive", meaning: "v. 欺骗；蒙蔽", distinction: "con- 构想孕育，de- 欺诈欺骗" },
  ],
  historic: [
    { word: "historical", meaning: "adj. 历史上的；史学的", distinction: "historic 历史重大意义，historical 历史题材相关的" },
  ],
  historical: [
    { word: "historic", meaning: "adj. 具有历史意义的", distinction: "historic 历史重大意义，historical 历史题材相关的" },
  ],
  economic: [
    { word: "economical", meaning: "adj. 节约的；经济实惠的", distinction: "economic 宏观经济的，economical 省钱实惠的" },
  ],
  economical: [
    { word: "economic", meaning: "adj. 经济的；经济学的", distinction: "economic 宏观经济的，economical 省钱实惠的" },
  ],
  sensible: [
    { word: "sensitive", meaning: "adj. 敏感的；易受伤害的", distinction: "sensible 明智理性的，sensitive 敏感细腻的" },
  ],
  sensitive: [
    { word: "sensible", meaning: "adj. 明智的；合理的", distinction: "sensible 明智理性的，sensitive 敏感细腻的" },
  ],
  credible: [
    { word: "credulous", meaning: "adj. 轻信的；易受骗的", distinction: "credible 可信可靠的，credulous 盲目轻信的" },
  ],
  expand: [
    { word: "expend", meaning: "v. 花费；消耗", distinction: "a 扩张扩大，e 花费耗费" },
  ],
  expend: [
    { word: "expand", meaning: "v. 扩大；膨胀", distinction: "a 扩张扩大，e 花费耗费" },
  ],
  vocation: [
    { word: "vacation", meaning: "n. 假期；休假", distinction: "o 天职使命，a 假期空闲" },
  ],
  vacation: [
    { word: "vocation", meaning: "n. 职业；天职", distinction: "o 天职使命，a 假期空闲" },
  ],
};

import { getCleanWordForDisplay } from "@/lib/recall-match";

/**
 * 规范化查询词：去除括号、空格、标点，转为纯小写，保留完整单词
 */
export function normalizeTargetWord(raw: string): string {
  const clean = getCleanWordForDisplay(raw).split("/")[0].trim().toLowerCase();
  return clean.replace(/[^a-z-]/g, "");
}

/**
 * 获取全英语词典形近词消歧数据：
 * 1. 优先读取持久化缓存与内存缓存
 * 2. 若配置了 AI 则由后台大模型基于全英语词库智能匹配最容易混淆的词及辨析口诀
 * 3. 若 AI 未开启或请求失败，无缝回退至内置经典易混词典
 */
export async function fetchConfusableWords(
  word: string,
  meaning: string = ""
): Promise<ConfusableResult> {
  const cleanWord = normalizeTargetWord(word);
  if (!cleanWord || cleanWord.length < 2) {
    return { targetWord: word, items: [], source: "none" };
  }

  const cachedPromise = memoryCache.get(cleanWord);
  if (cachedPromise) return cachedPromise;

  const promise = (async (): Promise<ConfusableResult> => {
    // 1. 读取 IndexedDB 持久化缓存
    if (confusableStore) {
      try {
        const stored = await get<{ items: ConfusableItem[]; source: "ai" | "curated" }>(
          cleanWord,
          confusableStore
        );
        if (stored && Array.isArray(stored.items) && stored.items.length > 0) {
          return { targetWord: word, items: stored.items, source: stored.source || "ai" };
        }
      } catch {
        // 缓存读取失败继续
      }
    }

    // 2. 尝试调用后台 AI 大模型从全英语词典中匹配
    try {
      const aiCfg = await getAIConfig();
      if (aiCfg.enabled && aiCfg.baseURL.trim() && aiCfg.model.trim()) {
        const client = new AIClient(aiCfg);
        const prompt = [
          `你是一位严谨的英语词汇学专家。请分析单词 "${cleanWord}"（当前释义参考："${meaning.trim() || "无"}"）。`,
          "",
          "【核心原则：宁缺毋滥，严禁强行匹配】",
          "1. 只有当英语中存在真正与目标词在拼写外形上高度相似、极易产生认读混淆的「经典形近易混词」（通常相差仅 1~2 个字母或辅音双写/元音替换，如 adapt ↔ adopt ↔ adept、access ↔ assess、principal ↔ principle、stationary ↔ stationery 等）时才提取。",
          "2. 严禁强行凑数！绝大多数常规英语单词（例如 apple, book, student, water, computer, library, vehicle 等）在英语中根本没有经典形近易混词，遇到此类词汇必须坚决返回空数组 []！",
          "3. 严禁匹配简单的首尾押韵词（如 cat / bat、table / cable）或派生词（如 act / action）。",
          "",
          "【严格输出格式要求】",
          "1. 必须输出且仅输出纯 JSON 数组，严禁使用任何 Markdown 格式代码块（不要用 ```json ），严禁包含任何前言说明，严禁输出任何 Emoji 表情符号。",
          "2. 数组中每个对象包含以下 3 个字段：",
          "   - word: 易混淆的英文单词（小写单词原形）",
          "   - meaning: 该词的准确精炼中文释义（如：v. 采纳；收养）",
          "   - distinction: 一句简明核心差异提示或助记口诀（不超过 25 字，严禁 emoji，如：字母 o 联想 open 怀抱表示收养）",
          "3. 若该词在英语中确实没有典型形近易混词，必须坚决直接返回空数组 []。",
          "",
          "示例输出格式：",
          '[{"word":"adopt","meaning":"v. 收养；采纳","distinction":"字母 o 联想 open 怀抱表示收养"},{"word":"adept","meaning":"adj. 熟练的，内行的","distinction":"字母 e 联想 expert 专家表示熟练"}]',
        ].join("\n");

        const raw = await client.chat(
          [
            {
              role: "system",
              content:
                "你是专业严谨的英语词汇学专家。遵循宁缺毋滥原则，没有经典形近易混词时必须严格返回 []，绝不强行匹配，绝不使用 Emoji 表情。",
            },
            { role: "user", content: prompt },
          ],
          0.1
        );

        let clean = raw.trim();
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        }

        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const items: ConfusableItem[] = parsed
            .filter(
              (x) =>
                x &&
                typeof x.word === "string" &&
                typeof x.meaning === "string" &&
                x.meaning.trim() &&
                isTrueConfusableCandidate(cleanWord, x.word)
            )
            .map((x) => ({
              word: x.word.trim().toLowerCase(),
              meaning: x.meaning.trim().replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ""),
              distinction: x.distinction
                ? String(x.distinction).trim().replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
                : undefined,
            }))
            .slice(0, 3);

          if (items.length > 0) {
            if (confusableStore) {
              set(cleanWord, { items, source: "ai" }, confusableStore).catch(() => {});
            }
            return { targetWord: word, items, source: "ai" };
          }
        }
      }
    } catch {
      // AI 匹配失败或未开启，平滑降级
    }

    // 3. 降级回退：内置经典易混词库查询
    const curated = CURATED_CONFUSABLES[cleanWord];
    if (curated && curated.length > 0) {
      if (confusableStore) {
        set(cleanWord, { items: curated, source: "curated" }, confusableStore).catch(() => {});
      }
      return { targetWord: word, items: curated, source: "curated" };
    }

    return { targetWord: word, items: [], source: "none" };
  })();

  memoryCache.set(cleanWord, promise);
  return promise;
}
