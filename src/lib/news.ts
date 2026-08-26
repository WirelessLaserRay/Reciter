import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";

export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

export interface NewsTopic {
  id: string;
  label: string;
  url: string;
}

export interface NewsListResult {
  source: string;
  topics?: NewsTopic[];
  items: NewsItem[];
}

export interface CustomRssSource {
  id: string;
  name: string;
  topics: NewsTopic[];
}

const CUSTOM_RSS_KEY = "reciter-custom-rss-sources";

export function getCustomRssSources(): CustomRssSource[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_RSS_KEY) ?? "[]") as CustomRssSource[];
  } catch {
    return [];
  }
}

export function saveCustomRssSources(sources: CustomRssSource[]): void {
  localStorage.setItem(CUSTOM_RSS_KEY, JSON.stringify(sources));
}

export interface ArticleResult {
  title?: string;
  paragraphs: string[];
  wordCount?: number;
  isFullArticle?: boolean;
}

const httpFetch = isTauri()
  ? tauriFetch
  : (...args: Parameters<typeof fetch>) => fetch(...args);

function trimSlash(s: string): string {
  return s.trim().replace(/\/+$/, "");
}

/** 获取 Worker 基础地址：优先同步地址，其次 DeepL CORS 代理地址 */
export async function getWorkerBaseUrl(): Promise<string> {
  const [syncEndpoint, deeplProxy] = await Promise.all([
    db.getSetting("sync_endpoint"),
    db.getSetting("deepl_cors_proxy"),
  ]);
  return trimSlash(syncEndpoint ?? "") || trimSlash(deeplProxy ?? "");
}

/** 拉取内置 RSS 新闻列表；topic 为空时拉取该媒体全部主题 */
export async function fetchNewsList(source: string, topic?: string, limit = 8): Promise<NewsListResult> {
  const base = await getWorkerBaseUrl();
  if (!base) throw new Error("请先在设置中配置 Worker 地址（同步地址或 DeepL CORS 代理）");
  const params = new URLSearchParams({ source, limit: String(limit) });
  if (topic) params.set("topic", topic);
  const res = await httpFetch(`${base}/api/news?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`新闻列表请求失败（HTTP ${res.status}）`);
  return (await res.json()) as NewsListResult;
}

/** 拉取自导入 RSS 源（多个主题链接） */
export async function fetchCustomNews(
  name: string,
  urls: string[],
  limit = 8
): Promise<NewsListResult> {
  const base = await getWorkerBaseUrl();
  if (!base) throw new Error("请先在设置中配置 Worker 地址（同步地址或 DeepL CORS 代理）");
  const res = await httpFetch(`${base}/api/news/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name, urls, limit }),
  });
  if (!res.ok) throw new Error(`自定义 RSS 请求失败（HTTP ${res.status}）`);
  return (await res.json()) as NewsListResult;
}

/** 抓取文章正文 */
export async function fetchArticleContent(articleUrl: string): Promise<ArticleResult> {
  const base = await getWorkerBaseUrl();
  if (!base) throw new Error("请先在设置中配置 Worker 地址（同步地址或 DeepL CORS 代理）");
  const res = await httpFetch(
    `${base}/api/news/article?url=${encodeURIComponent(articleUrl)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as {
        detail?: string;
        debug?: {
          fetchStatus?: number;
          readabilityOk?: boolean;
          timesExtractorUsed?: boolean;
          paywallDetected?: boolean;
          usedJinaFallback?: boolean;
          reason?: string;
        };
      };
      if (data?.debug) {
        detail += ` | fetchStatus=${data.debug.fetchStatus ?? "?"}`;
        detail += ` readability=${data.debug.readabilityOk ?? "?"}`;
        detail += ` timesExtractor=${data.debug.timesExtractorUsed ?? "?"}`;
        detail += ` paywall=${data.debug.paywallDetected ?? "?"}`;
        detail += ` jina=${data.debug.usedJinaFallback ?? "?"}`;
        if (data.debug.reason) detail += ` | ${data.debug.reason}`;
      } else if (data?.detail) {
        detail += ` | ${data.detail}`;
      }
    } catch {
      // ignore parse error
    }
    throw new Error(`文章获取失败（${detail}）`);
  }
  return (await res.json()) as ArticleResult;
}
