import type { NewsTopic } from "@/lib/news";

export interface BuiltInSource {
  value: string;
  label: string;
  topics: NewsTopic[];
}

export const BUILT_IN_SOURCES: BuiltInSource[] = [
  {
    value: "cgtn",
    label: "CGTN",
    topics: [
      { id: "world", label: "World", url: "https://www.cgtn.com/subscribe/rss/section/world.xml" },
      { id: "opinion", label: "Opinion", url: "https://www.cgtn.com/subscribe/rss/section/opinion.xml" },
      { id: "tech-sci", label: "Tech/Sci", url: "https://www.cgtn.com/subscribe/rss/section/tech-sci.xml" },
      { id: "culture", label: "Culture", url: "https://www.cgtn.com/subscribe/rss/section/culture.xml" },
    ],
  },
  {
    value: "cnn",
    label: "CNN",
    topics: [{ id: "edition", label: "Edition", url: "http://rss.cnn.com/rss/edition.rss" }],
  },
  {
    value: "guardian",
    label: "The Guardian",
    topics: [
      { id: "world", label: "World", url: "https://www.theguardian.com/world/rss" },
      { id: "technology", label: "Technology", url: "https://www.theguardian.com/technology/rss" },
      { id: "environment", label: "Environment", url: "https://www.theguardian.com/environment/rss" },
    ],
  },
  {
    value: "npr",
    label: "NPR",
    topics: [
      { id: "top-stories", label: "Top Stories", url: "https://feeds.npr.org/1001/rss.xml" },
      { id: "science", label: "Science", url: "https://feeds.npr.org/1007/rss.xml" },
    ],
  },
  {
    value: "bbc",
    label: "BBC",
    topics: [
      { id: "world", label: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
      { id: "science", label: "Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
      { id: "technology", label: "Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    ],
  },
];

export interface FavoriteArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description?: string;
  savedAt: string;
}

export const FAVORITES_KEY = "reciter-favorite-articles";

/** 去掉 AI 返回选项里可能自带的前缀字母（A. / B) / C、等），避免重复显示 ABCD */
export function cleanOption(opt: string): string {
  return opt.replace(/^[A-Da-d]\s*[.)、:：]\s*/, "").trim();
}

export function loadFavorites(): FavoriteArticle[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as FavoriteArticle[];
  } catch {
    return [];
  }
}

export function saveFavorites(list: FavoriteArticle[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

export type TranslationMode = "off" | "all" | "hover";

// 文章全文翻译会话级缓存（内存级 Map，以文章链接/标识为 key，在应用会话期间常驻）
export const translationSessionCache = new Map<string, string>();
