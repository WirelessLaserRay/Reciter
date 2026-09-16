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

export type ArticleChannel = "auto" | "direct" | "jina" | "archive_today" | "wayback";

export interface ArticleResult {
  title?: string;
  paragraphs: string[];
  wordCount?: number;
  isFullArticle?: boolean;
  channel?: ArticleChannel;
  channelLabel?: string;
  isPaywallDetected?: boolean;
  archiveUrls?: {
    archiveToday: string;
    wayback: string;
  };
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
export async function fetchNewsList(source: string, topic?: string, limit = 50): Promise<NewsListResult> {
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
  limit = 50
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
      if (lower === "advertisement" || lower.startsWith("advertisement:") || lower.startsWith("advertisement ")) return false;
      if (lower.includes("sign up for our") || lower.includes("sign up to our")) return false;
      if (lower.includes("all rights reserved") || /©\s*\d{4}/.test(p)) return false;
      // 仅对短文本元数据行应用图注/版权过滤，避免正文长句包含 figure/caption 等词被误删
      if (lower.length < 120) {
        if (/^(figure|caption|photograph|photo|image)\b/i.test(p)) return false;
        if (lower === "caption" || lower === "figure") return false;
        if (lower.includes("copyright")) return false;
        if (guardian && (lower.includes("the guardian") || lower.includes("first published"))) return false;
      }
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

const PAYWALL_FINGERPRINTS = [
  "subscribe to continue reading",
  "subscribe to continue",
  "subscription required",
  "exclusive to subscribers",
  "subscribers only",
  "to read the full article",
  "sign in or create an account",
  "reached your limit of free articles",
  "register for free to continue",
  "this story is available exclusively for",
  "unlock full access",
  "already a subscriber? sign in",
  "read the rest of this story with a free account",
  "support quality journalism",
  "become a member to continue reading",
  "enjoy more articles with a free account",
  "log in or subscribe",
  "already a subscriber",
];

export function isPaywallOrTruncated(textContent: string, paragraphsCount: number): boolean {
  const lower = textContent.toLowerCase();
  if (PAYWALL_FINGERPRINTS.some((kw) => lower.includes(kw))) {
    return true;
  }
  if (textContent.length < 450 || paragraphsCount < 3) {
    return true;
  }
  return false;
}

export function getArchiveUrls(url: string) {
  return {
    archiveToday: `https://archive.ph/${encodeURI(url)}`,
    wayback: `https://web.archive.org/web/*/${encodeURI(url)}`,
  };
}

/** 本地直接请求策略（模拟正常浏览器 / Twitter Referer / Googlebot） */
async function fetchTauriDirect(url: string): Promise<ArticleResult> {
  const strategies = [
    {
      name: "twitter",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://t.co/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    },
    {
      name: "googlebot",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Referer": "https://www.google.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    },
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

      doc.querySelectorAll("script, style, noscript, nav, form, iframe, .ad, .ads, .advertisement").forEach((el) => el.remove());

      const article = new Readability(doc).parse();
      if (!article) throw new Error("Readability 解析失败");

      const textContent = article.textContent?.trim() ?? "";
      const contentDoc = parser.parseFromString(article.content, "text/html");
      const paragraphs = cleanParagraphs(extractParagraphsFromHtml(contentDoc), url);
      const isPaywall = isPaywallOrTruncated(textContent, paragraphs.length);
      const isFullArticle = !isPaywall;

      if (isPaywall && strategy.name === "twitter") {
        throw new Error("Paywall detected, trying next strategy");
      }

      return {
        title: article.title ?? "",
        paragraphs: truncateParagraphs(paragraphs),
        wordCount: textContent.split(/\s+/).filter(Boolean).length,
        isFullArticle,
        channel: "direct",
        channelLabel: "直连抓取",
        isPaywallDetected: isPaywall,
      };
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError ?? new Error("直连抓取失败");
}

/** 本地 Jina Reader 结构化提取 */
async function fetchTauriJina(url: string): Promise<ArticleResult> {
  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const res = await tauriFetch(jinaUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/plain",
      "X-Return-Format": "text",
    },
  });
  if (!res.ok) throw new Error(`Jina Reader 请求失败 (HTTP ${res.status})`);
  const text = await res.text();
  const rawParagraphs = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !s.startsWith("![") && !s.startsWith("Title:"));
  const paragraphs = cleanParagraphs(rawParagraphs, url);
  const textContent = paragraphs.join(" ");
  const isPaywall = isPaywallOrTruncated(textContent, paragraphs.length);

  return {
    title: "",
    paragraphs: truncateParagraphs(paragraphs),
    wordCount: textContent.split(/\s+/).filter(Boolean).length,
    isFullArticle: !isPaywall,
    channel: "jina",
    channelLabel: "Jina Reader 提取",
    isPaywallDetected: isPaywall,
  };
}

/** 本地 Archive.today (archive.is / archive.ph) 快照检索 */
async function fetchTauriArchiveToday(url: string): Promise<ArticleResult> {
  const hosts = ["https://archive.is", "https://archive.ph", "https://archive.today"];
  let lastError: Error | null = null;

  for (const host of hosts) {
    try {
      const target = `${host}/newest/${encodeURI(url)}`;
      const res = await tauriFetch(target, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!res.ok) throw new Error(`Archive.today 状态异常: HTTP ${res.status}`);
      const html = await res.text();

      // 避免 Cloudflare 质询被误识别为正文
      if (html.includes("cf-turnstile") || html.includes("challenge-platform") || html.includes("Just a moment...")) {
        throw new Error("Archive.today 遇到人机验证拦截");
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // 清理 Archive.today 自带的工具栏与导航
      doc.querySelectorAll("#HEADER, #banner, #CONTENT-HEADER, script, style, noscript, nav, form, iframe, .ad, .ads").forEach((el) => el.remove());

      const article = new Readability(doc).parse();
      if (!article) throw new Error("Archive.today 内容提取失败");

      const textContent = article.textContent?.trim() ?? "";
      const contentDoc = parser.parseFromString(article.content, "text/html");
      const paragraphs = cleanParagraphs(extractParagraphsFromHtml(contentDoc), url);
      const isPaywall = isPaywallOrTruncated(textContent, paragraphs.length);

      return {
        title: article.title ?? "",
        paragraphs: truncateParagraphs(paragraphs),
        wordCount: textContent.split(/\s+/).filter(Boolean).length,
        isFullArticle: !isPaywall,
        channel: "archive_today",
        channelLabel: "Archive.today 快照",
        isPaywallDetected: isPaywall,
      };
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError ?? new Error("Archive.today 检索未果");
}

/** 本地 Wayback Machine (archive.org) 历史快照检索 */
async function fetchTauriWayback(url: string): Promise<ArticleResult> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  const apiRes = await tauriFetch(api, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  if (!apiRes.ok) throw new Error(`Wayback Availability 接口异常 (HTTP ${apiRes.status})`);
  const meta = (await apiRes.json()) as {
    archived_snapshots?: {
      closest?: {
        available: boolean;
        url: string;
        status: string;
      };
    };
  };

  const snapshotUrl = meta?.archived_snapshots?.closest?.url;
  if (!meta?.archived_snapshots?.closest?.available || !snapshotUrl) {
    throw new Error("Wayback Machine 暂无此文章快照");
  }

  const pageRes = await tauriFetch(snapshotUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!pageRes.ok) throw new Error(`Wayback 快照获取失败 (HTTP ${pageRes.status})`);
  const html = await pageRes.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  // 移除 Wayback 顶部横幅及脚本
  doc.querySelectorAll("#wm-ipp-base, #wm-ipp, #wm-ipp-inside, script, style, noscript, nav, form, iframe, .ad, .ads").forEach((el) => el.remove());

  const article = new Readability(doc).parse();
  if (!article) throw new Error("Wayback 快照正文解析失败");

  const textContent = article.textContent?.trim() ?? "";
  const contentDoc = parser.parseFromString(article.content, "text/html");
  const paragraphs = cleanParagraphs(extractParagraphsFromHtml(contentDoc), url);
  const isPaywall = isPaywallOrTruncated(textContent, paragraphs.length);

  return {
    title: article.title ?? "",
    paragraphs: truncateParagraphs(paragraphs),
    wordCount: textContent.split(/\s+/).filter(Boolean).length,
    isFullArticle: !isPaywall,
    channel: "wayback",
    channelLabel: "Wayback 历史存档",
    isPaywallDetected: isPaywall,
  };
}

/** 本地 Tauri 抓取：支持单通道指定与多网关自动降级 */
async function fetchTauriArticleContent(url: string, channel: ArticleChannel = "auto"): Promise<ArticleResult> {
  if (channel === "direct") return fetchTauriDirect(url);
  if (channel === "jina") return fetchTauriJina(url);
  if (channel === "archive_today") return fetchTauriArchiveToday(url);
  if (channel === "wayback") return fetchTauriWayback(url);

  // 自动优化通道级联：Direct -> Jina -> Archive.today -> Wayback
  let candidateResult: ArticleResult | null = null;
  let lastError: Error | null = null;

  // 1. 直连尝试
  try {
    const res = await fetchTauriDirect(url);
    if (res.isFullArticle && !res.isPaywallDetected) {
      return res;
    }
    candidateResult = res;
  } catch (e) {
    lastError = e as Error;
  }

  // 2. Jina Reader 尝试
  try {
    const res = await fetchTauriJina(url);
    if (res.isFullArticle && !res.isPaywallDetected) {
      return res;
    }
    if (!candidateResult || (res.paragraphs.length > candidateResult.paragraphs.length)) {
      candidateResult = res;
    }
  } catch (e) {
    lastError = e as Error;
  }

  // 3. Archive.today 快照尝试
  try {
    const res = await fetchTauriArchiveToday(url);
    if (res.isFullArticle && !res.isPaywallDetected) {
      return res;
    }
    if (!candidateResult || (res.paragraphs.length > candidateResult.paragraphs.length)) {
      candidateResult = res;
    }
  } catch (e) {
    lastError = e as Error;
  }

  // 4. Wayback Machine 历史快照尝试
  try {
    const res = await fetchTauriWayback(url);
    if (res.isFullArticle && !res.isPaywallDetected) {
      return res;
    }
    if (!candidateResult || (res.paragraphs.length > candidateResult.paragraphs.length)) {
      candidateResult = res;
    }
  } catch (e) {
    lastError = e as Error;
  }

  if (candidateResult) {
    return candidateResult;
  }

  throw lastError ?? new Error("本地多通道抓取均告失败");
}

/** 抓取文章正文 */
export async function fetchArticleContent(
  articleUrl: string,
  channel: ArticleChannel = "auto"
): Promise<ArticleResult> {
  const archiveUrls = getArchiveUrls(articleUrl);

  // 如果是 Tauri 桌面端，直接在本地使用用户真实 IP 抓取，绕过 Worker 和 Cloudflare 拦截！
  if (isTauri()) {
    try {
      const res = await fetchTauriArticleContent(articleUrl, channel);
      return { ...res, archiveUrls };
    } catch (localError) {
      console.warn("Tauri local fetch failed, falling back to Worker:", localError);
      // fallback to worker
    }
  }

  const base = await getWorkerBaseUrl();
  if (!base) throw new Error("请先在设置中配置 Worker 地址（同步地址或 DeepL CORS 代理）");
  const maxLength = await getArticleMaxLength();
  const params = new URLSearchParams({
    url: articleUrl,
    maxLength: String(maxLength),
    channel,
  });
  const res = await httpFetch(
    `${base}/api/news/article?${params.toString()}`,
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
  const result = (await res.json()) as ArticleResult;
  return { ...result, archiveUrls };
}
