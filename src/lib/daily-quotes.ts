/** 每日一句：英文名言 / 写作实用句子，本地数据库缓存 + 每周同步 ZenQuotes API */
import { db } from "@/lib/db";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";

export interface DailyQuote {
  text: string;
  translation: string;
  author: string;
  source?: "local" | "zenquotes" | "quotable";
}

const QUOTES: DailyQuote[] = [
  { text: "The secret of getting ahead is getting started.", translation: "领先的秘诀就是开始行动。", author: "Mark Twain", source: "local" },
  { text: "It does not matter how slowly you go as long as you do not stop.", translation: "只要不停下，走得慢也没关系。", author: "Confucius", source: "local" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", translation: "成功不是终点，失败也并非末日；最重要的是继续前行的勇气。", author: "Winston Churchill", source: "local" },
  { text: "Believe you can and you're halfway there.", translation: "相信自己能行，你就已经成功了一半。", author: "Theodore Roosevelt", source: "local" },
  { text: "The only way to do great work is to love what you do.", translation: "做出伟大工作的唯一方法就是热爱你所做的事。", author: "Steve Jobs", source: "local" },
  { text: "Quality is not an act, it is a habit.", translation: "优秀不是一种行为，而是一种习惯。", author: "Aristotle", source: "local" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", translation: "种树最好的时间是二十年前，其次是现在。", author: "Chinese Proverb", source: "local" },
  { text: "Don't watch the clock; do what it does. Keep going.", translation: "别盯着时钟，学它一直走下去。", author: "Sam Levenson", source: "local" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", translation: "未来属于那些相信自己梦想之美的人。", author: "Eleanor Roosevelt", source: "local" },
  { text: "In the middle of difficulty lies opportunity.", translation: "困难之中蕴藏机遇。", author: "Albert Einstein", source: "local" },
  { text: "Happiness is not something ready made. It comes from your own actions.", translation: "幸福不是现成的东西，它来自你自己的行动。", author: "Dalai Lama", source: "local" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", translation: "实现明天理想的唯一限制，是我们今天的疑虑。", author: "Franklin D. Roosevelt", source: "local" },
  { text: "What we achieve inwardly will change outer reality.", translation: "我们内心的成就终将改变外在的现实。", author: "Plutarch", source: "local" },
  { text: "A journey of a thousand miles begins with a single step.", translation: "千里之行，始于足下。", author: "Lao Tzu", source: "local" },
  { text: "Well done is better than well said.", translation: "做得好胜过说得好。", author: "Benjamin Franklin", source: "local" },
  { text: "The mind is everything. What you think you become.", translation: "心念即一切；你想成为什么，就会成为什么。", author: "Buddha", source: "local" },
  { text: "Strive not to be a success, but rather to be of value.", translation: "不要追求成功，而要努力成为有价值的人。", author: "Albert Einstein", source: "local" },
  { text: "Simplicity is the ultimate sophistication.", translation: "简单是终极的复杂。", author: "Leonardo da Vinci", source: "local" },
  { text: "Action is the foundational key to all success.", translation: "行动是一切成功的基础。", author: "Pablo Picasso", source: "local" },
  { text: "Whether you think you can or you think you can't, you're right.", translation: "无论你认为自己能行还是不行，你都是对的。", author: "Henry Ford", source: "local" },
];

/** 根据日期取本地兜底句子（按年内天数轮换，跨年自然切换） */
export function getDailyQuote(date: Date = new Date()): DailyQuote {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return QUOTES[day % QUOTES.length];
}

/** 当前自然周的周一（本地时区）作为缓存周期标识 */
function weekKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // 周一=0 ... 周日=6
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayOfMonth}`;
}

interface CachedQuote extends DailyQuote {
  week: string;
}

async function readCache(date: Date): Promise<CachedQuote | null> {
  try {
    const raw = await db.getSetting("daily_quote_cache");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedQuote;
    if (parsed.week === weekKey(date) && parsed.text) return parsed;
  } catch {
    // DB 未就绪或缓存损坏，忽略
  }
  return null;
}

async function writeCache(date: Date, quote: DailyQuote): Promise<void> {
  try {
    const payload: CachedQuote = { ...quote, week: weekKey(date) };
    await db.setSetting("daily_quote_cache", JSON.stringify(payload));
  } catch {
    // 缓存失败不影响展示
  }
}

/** 环境自适应 fetch：Tauri 走 plugin-http（绕过 CORS）；Web 走 window.fetch */
const httpFetch = isTauri() ? tauriFetch : (...args: Parameters<typeof fetch>) => fetch(...args);

async function fetchZenQuote(): Promise<DailyQuote | null> {
  const endpoints = [
    "https://zenquotes.io/api/random",
    "https://zenquotes.io/api/today",
  ];
  for (const url of endpoints) {
    try {
      const res = await httpFetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data = await res.json();
      const item = (Array.isArray(data) ? data[0] : data) as {
        q?: string;
        content?: string;
        quote?: string;
        a?: string;
        author?: string;
      } | null;
      if (!item) continue;
      const text = (item.q || item.content || item.quote || "").trim();
      const author = (item.a || item.author || "").trim();
      if (text) {
        return { text, translation: "", author, source: "zenquotes" };
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

async function translateWithAI(quote: DailyQuote): Promise<string> {
  const { getAIConfig, AIClient } = await import("@/lib/ai-client");
  const cfg = await getAIConfig();
  if (!cfg.enabled || !cfg.baseURL.trim() || !cfg.model.trim()) return "";
  const client = new AIClient(cfg);
  const translation = await client.chat([
    {
      role: "system",
      content: "你是专业的英语名言翻译。将用户提供的英文名言翻译成自然、简洁、有文采的中文，只输出译文，不要输出引号、注释或额外解释。",
    },
    {
      role: "user",
      content: `English: ${quote.text}\nAuthor: ${quote.author || "Unknown"}`,
    },
  ]);
  return (translation || "").trim();
}

/**
 * 获取每日一句：
 * 1. 优先读取本地数据库缓存（同一自然周内不重复请求 API）；
 * 2. 每周首次访问时尝试 ZenQuotes API 获取随机英文名言，并用 AI 生成中文翻译；
 * 3. 任意环节失败时回退到本地名言库，并把结果写入数据库缓存。
 */
export async function fetchDailyQuote(date: Date = new Date()): Promise<DailyQuote> {
  const cached = await readCache(date);
  if (cached) {
    return { text: cached.text, translation: cached.translation, author: cached.author, source: cached.source };
  }

  let quote = await fetchZenQuote();
  if (quote) {
    try {
      quote.translation = await translateWithAI(quote);
    } catch {
      quote.translation = "";
    }
    await writeCache(date, quote);
    return quote;
  }

  const local = getDailyQuote(date);
  await writeCache(date, local);
  return local;
}

/** 清空每日一句数据库缓存（用于手动刷新/测试 ZenQuotes） */
export async function clearDailyQuoteCache(): Promise<void> {
  try {
    await db.setSetting("daily_quote_cache", "");
  } catch {
    // 忽略缓存清理失败
  }
}

/**
 * 手动换一句：
 * 清空本周缓存后重新请求 ZenQuotes API；
 * 若 API 不可用，则从本地名句库随机换一句并写入缓存，保证界面立即变化。
 */
export async function refreshDailyQuote(date: Date = new Date()): Promise<DailyQuote> {
  await clearDailyQuoteCache();

  const quote = await fetchZenQuote();
  if (quote) {
    try {
      quote.translation = await translateWithAI(quote);
    } catch {
      quote.translation = "";
    }
    await writeCache(date, quote);
    return quote;
  }

  const local = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  await writeCache(date, local);
  return local;
}
