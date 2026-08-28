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

/** 获取每日一文正文截断字符数（默认 30000） */
export async function getArticleMaxLength(): Promise<number> {
  const raw = await db.getSetting("article_max_length");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 1000 && n <= 100000 ? n : 30000;
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

import { Readability } from "@mozilla/readability";

const MAX_ARTICLE_LENGTH = 30000;

function truncateParagraphs(paragraphs: string[]): string[] {
  let total = 0;
  const out: string[] = [];
  for (const p of paragraphs) {
    if (total + p.length > MAX_ARTICLE_LENGTH) break;
    out.push(p);
    total += p.length;
  }
  return out;
}

function cleanParagraphs(paragraphs: string[], url: string): string[] {
  const guardian = /theguardian\.com/i.test(url);
  return paragraphs
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      const lower = p.toLowerCase();
      if (lower.includes("advertisement")) return false;
      if (lower.includes("sign up for")) return false;
      if (lower.includes("all rights reserved")) return false;
      if (lower.includes("copyright")) return false;
      if (lower.includes("caption")) return false;
      if (lower.includes("figure")) return false;
      if (guardian && (lower.includes("the guardian") || lower.includes("first published"))) return false;
      return true;
    });
}

function extractParagraphsFromHtml(doc: Document): string[] {
  const blocks: string[] = [];
  doc.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre").forEach((el) => {
    const text = (el.textContent ?? "").trim();
    if (text.length >= 2) blocks.push(text);
  });
  if (blocks.length < 2) {
    const text = (doc.body?.textContent ?? "").trim();
    blocks.push(...text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean));
  }
  return blocks;
}

/** 本地 Tauri 抓取，完美模拟 bypass-paywalls-chrome (使用用户本地真实 IP) */
async function fetchTauriArticleContent(url: string): Promise<ArticleResult> {
  const strategies = [
    {
      name: "twitter",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://t.co/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    },
    {
      name: "googlebot",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Referer": "https://www.google.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    }
  ];

  let lastError: Error | null = null;

  for (const strategy of strategies) {
    try {
      const res = await tauriFetch(url, {
        method: "GET",
        headers: strategy.headers,
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(`HTTP ${res.status} (Access Denied)`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      doc.querySelectorAll("script, style, noscript, nav, form, iframe, .ad, .ads, .advertisement").forEach(el => el.remove());

      const article = new Readability(doc).parse();
      if (!article) throw new Error("Readability 解析失败");

      const textContent = article.textContent?.trim() ?? "";
      const contentDoc = parser.parseFromString(article.content, "text/html");
      const paragraphs = cleanParagraphs(extractParagraphsFromHtml(contentDoc), url);

      const isFullArticle = textContent.length >= 500 && paragraphs.length >= 3;
      
      // 如果推特策略疑似遇到付费墙（截断太短），尝试 googlebot
      if (!isFullArticle && strategy.name === "twitter") {
         const lower = textContent.toLowerCase();
         const isPaywall = ["subscribe", "subscription", "log in", "reached your limit"].some(s => lower.includes(s));
         if (isPaywall) throw new Error("Paywall detected, trying next strategy");
      }

      return {
        title: article.title ?? "",
        paragraphs: truncateParagraphs(paragraphs),
        wordCount: textContent.split(/\s+/).filter(Boolean).length,
        isFullArticle,
      };

    } catch (e) {
      lastError = e as Error;
      console.warn(`[Tauri Local Fetch] ${strategy.name} failed:`, e);
    }
  }

  throw lastError ?? new Error("本地抓取失败");
}

/** 抓取文章正文 */
export async function fetchArticleContent(articleUrl: string): Promise<ArticleResult> {
  // 如果是 Tauri 桌面端，直接在本地使用用户真实 IP 抓取，绕过 Worker 和 Cloudflare 拦截！
  if (isTauri()) {
    try {
      return await fetchTauriArticleContent(articleUrl);
    } catch (localError) {
      console.warn("Tauri local fetch failed, falling back to Worker:", localError);
      // fallback to worker
    }
  }

  const base = await getWorkerBaseUrl();
  if (!base) throw new Error("请先在设置中配置 Worker 地址（同步地址或 DeepL CORS 代理）");
  const maxLength = await getArticleMaxLength();
  const res = await httpFetch(
    `${base}/api/news/article?url=${encodeURIComponent(articleUrl)}&maxLength=${maxLength}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string; debug?: any };
      if (data?.debug) {
        detail += ` | ${data.debug.reason || JSON.stringify(data.debug)}`;
      } else if (data?.detail) {
        detail += ` | ${data.detail}`;
      }
    } catch {}
    throw new Error(`文章获取失败（${detail}）`);
  }
  return (await res.json()) as ArticleResult;
}
