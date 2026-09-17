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

/** 深度查找对象中的文章长文本或段落块数组 */
function findContentInObject(obj: any, depth = 0): string | null {
  if (!obj || depth > 5) return null;
  if (typeof obj === "string" && obj.length >= 400 && !obj.startsWith("http") && !obj.startsWith("data:")) {
    try {
      const tempDoc = new DOMParser().parseFromString(obj, "text/html");
      const extracted = tempDoc.body?.textContent?.trim();
      if (extracted && extracted.length >= 350) return extracted;
    } catch {
      return obj;
    }
  }
  if (Array.isArray(obj)) {
    const joined = obj
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.text) return item.text;
        if (item?.value) return item.value;
        if (item?.children && Array.isArray(item.children)) {
          return item.children.map((c: any) => c.text || "").join("");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
    if (joined.length >= 400) return joined;

    for (const item of obj) {
      const found = findContentInObject(item, depth + 1);
      if (found) return found;
    }
  } else if (typeof obj === "object") {
    const priorityKeys = ["articleBody", "content", "contentHtml", "body", "story", "html", "articleText"];
    for (const key of priorityKeys) {
      if (key in obj) {
        const found = findContentInObject(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const key of Object.keys(obj)) {
      if (priorityKeys.includes(key)) continue;
      const found = findContentInObject(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 借鉴 BPC (Bypass Paywalls Clean) 核心技术：从页面结构化数据（JSON-LD / Next.js __NEXT_DATA__）提取未被付费墙截断的全文
 */
function extractStructuredContent(doc: Document, url: string): { title?: string; paragraphs: string[] } | null {
  // 1. JSON-LD (application/ld+json)
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const rawText = script.textContent?.trim();
      if (!rawText) continue;
      const data = JSON.parse(rawText);
      const items = Array.isArray(data)
        ? data
        : data?.["@graph"]
        ? (Array.isArray(data["@graph"]) ? data["@graph"] : [data["@graph"]])
        : [data];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const body =
          typeof item.articleBody === "string"
            ? item.articleBody
            : typeof item.text === "string" && item["@type"] && /article|post|news/i.test(String(item["@type"]))
            ? item.text
            : null;

        if (body && body.trim().length >= 350) {
          let cleanText = body;
          if (cleanText.includes("<") && cleanText.includes(">")) {
            try {
              const tempDoc = new DOMParser().parseFromString(cleanText, "text/html");
              cleanText = tempDoc.body?.textContent?.trim() ?? cleanText;
            } catch {}
          }
          const rawParagraphs = cleanText
            .split(/\r?\n\r?\n|\r?\n/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length >= 10);
          const cleaned = cleanParagraphs(rawParagraphs, url);
          if (cleaned.length >= 2 && cleaned.join(" ").length >= 350) {
            return {
              title: typeof item.headline === "string" ? item.headline : undefined,
              paragraphs: cleaned,
            };
          }
        }
      }
    } catch {
      // 忽略格式不规范的 JSON-LD
    }
  }

  // 2. Next.js Hydration 数据 (script#__NEXT_DATA__)
  const nextDataScript = doc.querySelector('script#__NEXT_DATA__');
  if (nextDataScript && nextDataScript.textContent) {
    try {
      const nextJson = JSON.parse(nextDataScript.textContent);
      const pageProps = nextJson?.props?.pageProps;
      if (pageProps) {
        const candidateText = findContentInObject(pageProps);
        if (candidateText && candidateText.length >= 350) {
          const rawParagraphs = candidateText
            .split(/\r?\n\r?\n|\r?\n/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length >= 10);
          const cleaned = cleanParagraphs(rawParagraphs, url);
          if (cleaned.length >= 2) {
            return {
              paragraphs: cleaned,
            };
          }
        }
      }
    } catch {
      // 忽略 Next.js 数据解析错误
    }
  }

  return null;
}

/** 探测并抓取 AMP 版本（解决大量支持 Google 移动极速收录的媒体付费墙） */
async function fetchAmpArticle(originUrl: string, ampUrl: string): Promise<ArticleResult | null> {
  try {
    const fullAmpUrl = new URL(ampUrl, originUrl).href;
    const res = await tauriFetch(fullAmpUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const structured = extractStructuredContent(doc, originUrl);
    if (structured) {
      const text = structured.paragraphs.join(" ");
      if (!isPaywallOrTruncated(text, structured.paragraphs.length)) {
        return {
          title: structured.title || doc.title || "",
          paragraphs: truncateParagraphs(structured.paragraphs),
          wordCount: text.split(/\s+/).filter(Boolean).length,
          isFullArticle: true,
          channel: "direct",
          channelLabel: "直连抓取 (AMP镜像-结构化)",
          isPaywallDetected: false,
        };
      }
    }

    doc.querySelectorAll("amp-access-hide, [amp-access-hide], amp-subscriptions-hide, [amp-subscriptions-hide]").forEach((el) => {
      el.removeAttribute("amp-access-hide");
      el.removeAttribute("amp-subscriptions-hide");
    });
    doc.querySelectorAll("script, style, noscript, nav, form, iframe, .ad, .ads").forEach((el) => el.remove());

    const article = new Readability(doc).parse();
    if (!article) return null;

    const textContent = article.textContent?.trim() ?? "";
    const contentDoc = parser.parseFromString(article.content, "text/html");
    const paragraphs = cleanParagraphs(extractParagraphsFromHtml(contentDoc), originUrl);
    const isPaywall = isPaywallOrTruncated(textContent, paragraphs.length);

    if (isPaywall) return null;

    return {
      title: article.title ?? "",
      paragraphs: truncateParagraphs(paragraphs),
      wordCount: textContent.split(/\s+/).filter(Boolean).length,
      isFullArticle: true,
      channel: "direct",
      channelLabel: "直连抓取 (AMP镜像)",
      isPaywallDetected: false,
    };
  } catch {
    return null;
  }
}

/** 清除已知的遮罩层类名，防止 Readability 被付费墙提示遮罩误导 */
function cleanPaywallDOMElements(doc: Document) {
  const paywallSelectors = [
    ".paywall",
    "#paywall",
    "[id*='paywall']",
    "[class*='paywall']",
    "[id*='subscriber-gate']",
    "[class*='subscriber-gate']",
    "[class*='subscription-barrier']",
    "[class*='meter-modal']",
    ".tp-modal",
    ".tp-backdrop",
    "#piano-root",
    ".zephr-overlay",
    ".fc-ab-root",
    "#gateway-content",
    ".ad-container",
    ".advertisement",
    "aside",
  ];
  doc.querySelectorAll(paywallSelectors.join(", ")).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "article" && tag !== "main" && tag !== "body") {
      el.remove();
    }
  });

  doc.querySelectorAll("[style*='blur'], [style*='hidden'], [style*='none']").forEach((el) => {
    const s = el.getAttribute("style") || "";
    if (s.includes("blur") || s.includes("filter")) {
      el.setAttribute("style", s.replace(/filter\s*:[^;]+;?/gi, ""));
    }
  });
}

/** 本地直接请求策略（融合 BPC 最佳实践：Google 搜索导流、Google-InspectionTool、移动端社交 UA） */
async function fetchTauriDirect(url: string): Promise<ArticleResult> {
  const strategies: { name: string; headers: Record<string, string> }[] = [
    {
      name: "google_search",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        "Referer": "https://www.google.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
      },
    },
    {
      name: "google_inspection",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
        "Referer": "https://www.google.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
    {
      name: "social_mobile",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
        "Referer": "https://t.co/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    },
  ];

  let lastCandidate: ArticleResult | null = null;
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

      // 1. 结构化数据提取（JSON-LD / Next.js __NEXT_DATA__）- 在删除 script 前探测！
      const structured = extractStructuredContent(doc, url);
      if (structured) {
        const textContent = structured.paragraphs.join(" ");
        const isPaywall = isPaywallOrTruncated(textContent, structured.paragraphs.length);
        if (!isPaywall) {
          return {
            title: structured.title || doc.title || "",
            paragraphs: truncateParagraphs(structured.paragraphs),
            wordCount: textContent.split(/\s+/).filter(Boolean).length,
            isFullArticle: true,
            channel: "direct",
            channelLabel: "直连抓取 (结构化数据)",
            isPaywallDetected: false,
          };
        }
      }

      // 2. AMP 探针
      const ampLink = doc.querySelector('link[rel="amphtml"]')?.getAttribute("href");
      if (ampLink) {
        const ampResult = await fetchAmpArticle(url, ampLink);
        if (ampResult && ampResult.isFullArticle) {
          return ampResult;
        }
      }

      // 3. DOM 净化与 Readability 提取
      cleanPaywallDOMElements(doc);
      doc.querySelectorAll("script, style, noscript, nav, form, iframe, .ad, .ads, .advertisement").forEach((el) => el.remove());

      const article = new Readability(doc).parse();
      if (!article) throw new Error("Readability 解析失败");

      const textContent = article.textContent?.trim() ?? "";
      const contentDoc = parser.parseFromString(article.content, "text/html");
      const paragraphs = cleanParagraphs(extractParagraphsFromHtml(contentDoc), url);
      const isPaywall = isPaywallOrTruncated(textContent, paragraphs.length);

      if (!isPaywall) {
        return {
          title: article.title ?? "",
          paragraphs: truncateParagraphs(paragraphs),
          wordCount: textContent.split(/\s+/).filter(Boolean).length,
          isFullArticle: true,
          channel: "direct",
          channelLabel: "直连抓取",
          isPaywallDetected: false,
        };
      }

      lastCandidate = {
        title: article.title ?? "",
        paragraphs: truncateParagraphs(paragraphs),
        wordCount: textContent.split(/\s+/).filter(Boolean).length,
        isFullArticle: false,
        channel: "direct",
        channelLabel: "直连抓取 (疑似受限)",
        isPaywallDetected: true,
      };
    } catch (e) {
      lastError = e as Error;
    }
  }

  if (lastCandidate) return lastCandidate;
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
