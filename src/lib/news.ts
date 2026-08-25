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

export interface NewsListResult {
  source: string;
  items: NewsItem[];
}

export interface ArticleResult {
  content: string;
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

/** 拉取 RSS 新闻列表 */
export async function fetchNewsList(source: string, limit = 5): Promise<NewsListResult> {
  const base = await getWorkerBaseUrl();
  if (!base) throw new Error("请先在设置中配置 Worker 地址（同步地址或 DeepL CORS 代理）");
  const res = await httpFetch(
    `${base}/api/news?source=${encodeURIComponent(source)}&limit=${limit}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`新闻列表请求失败（HTTP ${res.status}）`);
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
  if (!res.ok) throw new Error(`文章获取失败（HTTP ${res.status}）`);
  return (await res.json()) as ArticleResult;
}
