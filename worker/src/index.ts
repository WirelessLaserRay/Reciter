/**
 * Reciter Cloudflare Worker
 *
 * 1. DeepL CORS Proxy：纯转发代理，接收前端请求（携带用户自己的 API Key），转发到 DeepL。
 * 2. 轻量全量快照同步：把 Reciter 备份 JSON 存到 KV，供 PWA / Windows 跨端同步。
 * 3. 每日一文：RSS 代理 + Readability 正文提取。
 *
 * Worker 不存储 DeepL Key；同步 Token 通过环境变量 SYNC_TOKEN 配置（wrangler secret put）。
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const DEEPL_API = "https://api-free.deepl.com/v2/translate";

/** 允许跨域的来源白名单（正则） */
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[\w-]+\.github\.io$/,
  // Tauri v2 桌面端 WebView Origin
  /^tauri:\/\/localhost$/,
  /^https?:\/\/tauri\.localhost$/,
  /^https?:\/\/[a-zA-Z0-9-]+\.tauri\.localhost$/,
  // 鸿蒙/部分 WebView/文件模式会发送 Origin: null
  /^null$/i,
];

interface Env {
  KV_BINDING: KVNamespace;
  SYNC_TOKEN?: string;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((re) => re.test(origin));
}

function corsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
    "Access-Control-Max-Age": "86400",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(data: unknown, status = 200, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  const token = request.headers.get("X-Sync-Token") ?? "";
  return !!env.SYNC_TOKEN && token === env.SYNC_TOKEN;
}

/** 处理 /api/sync/* 的轻量全量快照同步 */
async function handleSync(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 所有同步接口都需要 Token
  if (!isAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, 401, cors);
  }

  const SNAPSHOT_KEY = "snapshot_data";

  if (path === "/api/sync/meta" && request.method === "GET") {
    const raw = await env.KV_BINDING.get(SNAPSHOT_KEY);
    let updatedAt: string | null = null;
    if (raw) {
      try {
        updatedAt = (JSON.parse(raw) as { updatedAt?: string }).updatedAt ?? null;
      } catch {
        updatedAt = null;
      }
    }
    return json({ updatedAt }, 200, cors);
  }

  if (path === "/api/sync/snapshot") {
    if (request.method === "GET") {
      const raw = await env.KV_BINDING.get(SNAPSHOT_KEY);
      if (raw === null) {
        return json({ error: "No snapshot yet" }, 404, cors);
      }
      // 兼容旧数据：如果 raw 本身就是备份 JSON，则直接返回；否则取合并结构里的 snapshot
      let snapshot = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.snapshot === "string") snapshot = parsed.snapshot;
      } catch {
        // raw 是旧版直接存储的备份 JSON
      }
      return new Response(snapshot, {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (request.method === "PUT") {
      const raw = await request.text();
      if (!raw || raw.length > 10 * 1024 * 1024) {
        return json({ error: "Snapshot too large (max 10MB)" }, 413, cors);
      }
      try {
        JSON.parse(raw); // 校验必须是合法 JSON
      } catch {
        return json({ error: "Invalid JSON" }, 400, cors);
      }
      const updatedAt = new Date().toISOString();
      // 合并为单个 Key，避免 KV 最终一致性下 snapshot 与 updated_at 读取不一致
      const payload = JSON.stringify({ updatedAt, snapshot: raw });
      await env.KV_BINDING.put(SNAPSHOT_KEY, payload);
      return json({ ok: true, updatedAt }, 200, cors);
    }

    if (request.method === "DELETE") {
      await env.KV_BINDING.delete(SNAPSHOT_KEY);
      return json({ ok: true }, 200, cors);
    }
  }

  return json({ error: "Not Found" }, 404, cors);
}

/** 原有 DeepL CORS 代理 */
async function handleDeepL(request: Request, cors: Record<string, string>): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405, cors);
  }

  let body: {
    text?: string[];
    target_lang?: string;
    auth_key?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }

  const { auth_key, text, target_lang } = body;
  if (!auth_key) {
    return json({ error: "Missing auth_key" }, 400, cors);
  }
  if (!text || !Array.isArray(text) || text.length === 0) {
    return json({ error: "Missing text" }, 400, cors);
  }
  if (text.length > 20) {
    return json({ error: "Too many text entries (max 20)" }, 400, cors);
  }
  if (text.some((t) => typeof t !== "string" || t.length > 2000)) {
    return json({ error: "Text entry too long (max 2000 chars)" }, 400, cors);
  }

  const deeplBody = JSON.stringify({ text, target_lang: target_lang || "ZH-HANS" });
  try {
    const deeplRes = await fetch(DEEPL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `DeepL-Auth-Key ${auth_key}`,
      },
      body: deeplBody,
    });
    const responseBody = await deeplRes.text();
    return new Response(responseBody, {
      status: deeplRes.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json({ error: "DeepL request failed", detail: String(e) }, 502, cors);
  }
}

// ==================== 每日一文（RSS 代理 + 正文提取） ====================

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  /** RSS 自带全文（如有） */
  content?: string;
}

const MAX_ARTICLE_LENGTH = 30000;
const RSS_FULL_TEXT_CACHE_MAX = 100;
/** 近期 RSS 自带的全文缓存：URL -> 全文（Worker 单实例内存，带上限防内存泄漏） */
const rssFullTextCache = new Map<string, string>();

/** 写入 RSS 全文缓存，超过上限时清理一半最旧条目，防止 Worker 内存膨胀 */
function setRssFullTextCache(url: string, content: string): void {
  if (rssFullTextCache.size >= RSS_FULL_TEXT_CACHE_MAX) {
    const keys = Array.from(rssFullTextCache.keys());
    for (let i = 0; i < Math.ceil(RSS_FULL_TEXT_CACHE_MAX / 2); i++) {
      rssFullTextCache.delete(keys[i]);
    }
  }
  rssFullTextCache.set(url, content);
}

function truncateParagraphs(paragraphs: string[], maxLength = MAX_ARTICLE_LENGTH): string[] {
  let total = 0;
  const out: string[] = [];
  for (const p of paragraphs) {
    if (total + p.length > maxLength) break;
    out.push(p);
    total += p.length;
  }
  return out;
}

/** 全文质量判断：至少 3 个段落且累计正文长度 ≥ 400 字符 */
function isFullEnough(paragraphs: string[]): boolean {
  return paragraphs.length >= 3 && paragraphs.reduce((sum, p) => sum + p.length, 0) >= 400;
}

interface NewsTopic {
  id: string;
  label: string;
  url: string;
}

const NEWS_SOURCES: Record<string, { name: string; topics: NewsTopic[] }> = {
  cgtn: {
    name: "CGTN",
    topics: [
      { id: "world", label: "World", url: "https://www.cgtn.com/subscribe/rss/section/world.xml" },
      { id: "opinion", label: "Opinion", url: "https://www.cgtn.com/subscribe/rss/section/opinion.xml" },
      { id: "tech-sci", label: "Tech/Sci", url: "https://www.cgtn.com/subscribe/rss/section/tech-sci.xml" },
      { id: "culture", label: "Culture", url: "https://www.cgtn.com/subscribe/rss/section/culture.xml" },
    ],
  },
  cnn: {
    name: "CNN",
    topics: [{ id: "edition", label: "Edition", url: "http://rss.cnn.com/rss/edition.rss" }],
  },
  guardian: {
    name: "The Guardian",
    topics: [
      { id: "world", label: "World", url: "https://www.theguardian.com/world/rss" },
      { id: "technology", label: "Technology", url: "https://www.theguardian.com/technology/rss" },
      { id: "environment", label: "Environment", url: "https://www.theguardian.com/environment/rss" },
    ],
  },
  npr: {
    name: "NPR",
    topics: [
      { id: "top-stories", label: "Top Stories", url: "https://feeds.npr.org/1001/rss.xml" },
      { id: "science", label: "Science", url: "https://feeds.npr.org/1007/rss.xml" },
    ],
  },
  bbc: {
    name: "BBC",
    topics: [
      { id: "world", label: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
      { id: "science", label: "Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
      { id: "technology", label: "Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    ],
  },
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 按 <item>...</item> 切分 RSS，CDATA 内的 </item> 不会被误判。
 * 避免用正则直接解析 XML 导致 CDATA 内容破坏结构。
 */
function splitRssItems(xml: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  let i = 0;
  let inCdata = false;
  while (i < xml.length) {
    if (!inCdata && xml.startsWith("<![CDATA[", i)) {
      inCdata = true;
      i += "<![CDATA[".length;
      continue;
    }
    if (inCdata && xml.startsWith("]]>", i)) {
      inCdata = false;
      i += 3;
      continue;
    }
    if (!inCdata) {
      if (xml.startsWith("<item>", i) || xml.startsWith("<item ", i)) {
        if (depth === 0) start = i;
        depth++;
        i += "<item".length;
        continue;
      }
      if (xml.startsWith("</item>", i) && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          blocks.push(xml.slice(start, i + "</item>".length));
          start = -1;
        }
        i += "</item>".length;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

function extractRssItems(xml: string, source: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  for (const block of splitRssItems(xml)) {
    if (items.length >= limit) break;
    const pick = (tag: string) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return mm ? decodeXmlEntities(stripTags(unwrapCdata(mm[1]))) : "";
    };
    const pickAttr = (tag: string, attr: string) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
      return mm ? decodeXmlEntities(mm[1]) : "";
    };
    const title = pick("title");
    const link = pick("link");
    const sourceUrl = pickAttr("source", "url") || link;
    const description = pick("description");
    const pubDate = pick("pubDate");
    const fullContent = pick("content:encoded") || (description.length > 1000 ? description : "");
    if (title && sourceUrl) {
      if (fullContent) setRssFullTextCache(sourceUrl, fullContent);
      items.push({ title, link: sourceUrl, description, pubDate, source, content: fullContent || undefined });
    }
  }
  return items;
}

interface ArticleExtractResult {
  title: string;
  paragraphs: string[];
  wordCount: number;
  isFullArticle: boolean;
  debug?: ArticleDebug;
}

interface ArticleDebug {
  fetchStatus: number;
  readabilityOk: boolean;
  timesExtractorUsed: boolean;
  paywallDetected: boolean;
  usedJinaFallback: boolean;
  reason?: string;
}

/** 从 Readability 的 article.content HTML 中提取结构化段落/块 */
function extractParagraphsFromHtml(html: string): string[] {
  const { document } = parseHTML(html);
  const blocks: string[] = [];
  document
    .querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre")
    .forEach((el) => {
      const text = decodeXmlEntities(stripTags(el.textContent ?? "")).trim();
      if (text.length >= 2) blocks.push(text);
    });
  // 结构化块太少时，退化为 body textContent 按空行分段
  if (blocks.length < 2) {
    const text = decodeXmlEntities(stripTags(document.body?.textContent ?? "")).trim();
    blocks.push(...text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean));
  }
  return blocks;
}

function isGuardianUrl(url: string): boolean {
  return /theguardian\.com/i.test(url);
}

/** 简单 SSRF 防护：禁止自定义 RSS 请求内网/保留地址 */
function isBlockedRssUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return true;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const a = parseInt(ipv4[1], 10);
      const b = parseInt(ipv4[2], 10);
      if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)) {
        return true;
      }
    }
  } catch {
    return true;
  }
  return false;
}

/** 清理正文段落中的噪声 */
function cleanParagraphs(paragraphs: string[], guardian = false): string[] {
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

/** 通用提取：JSON-LD articleBody / article 内段落 */
function extractJsonLdArticle(html: string): string | null {
  const jsonLdBlocks = [
    ...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const m of jsonLdBlocks) {
    try {
      const data = JSON.parse(decodeXmlEntities(m[1]));
      const candidates = Array.isArray(data) ? data : (data?.["@graph"] ?? [data]);
      for (const item of candidates) {
        if (typeof item?.articleBody === "string" && item.articleBody.trim().length > 200) {
          return item.articleBody.trim();
        }
      }
    } catch {
      // ignore
    }
  }
  const { document } = parseHTML(html);
  const container =
    document.querySelector("article") ??
    document.querySelector("section[name='articleBody'], section[itemprop='articleBody']");
  if (container) {
    const paragraphs = [...container.querySelectorAll("p")]
      .map((el) => decodeXmlEntities(stripTags(el.textContent ?? "")).trim())
      .filter((t) => t.length > 20);
    if (paragraphs.length >= 2) return paragraphs.join("\n\n");
  }
  return null;
}

/** 检测 paywall / 截断标志 */
function detectPaywall(html: string, text: string): boolean {
  const lower = (html + " " + text).toLowerCase();
  return [
    "subscribe",
    "subscription",
    "log in",
    "you have reached your limit",
    "unlimited article",
    "continue reading",
    "sign up",
    "paid subscriber",
  ].some((s) => lower.includes(s));
}

async function fetchArticleDirect(
  url: string,
  debug: ArticleDebug,
  strategy: "googlebot" | "twitter" = "googlebot",
  maxLength = MAX_ARTICLE_LENGTH
): Promise<ArticleExtractResult> {
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  if (strategy === "googlebot") {
    headers["User-Agent"] = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    headers["Referer"] = "https://www.google.com/";
    headers["X-Forwarded-For"] = "66.249.66.1";
  } else if (strategy === "twitter") {
    // 模拟正常用户从推特点击进入，很多媒体开放了社交媒体的 First Click Free
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    headers["Referer"] = "https://t.co/";
  }

  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  debug.fetchStatus = res.status;

  // ① 记录真实 status；403/401 = 访问控制/订阅问题
  if (res.status === 401 || res.status === 403) {
    debug.reason = "Access control / subscription required (HTTP " + res.status + ")";
    console.log(`[${strategy}] access control`, url, res.status);
    throw new Error(debug.reason);
  }
  if (!res.ok) throw new Error("Article fetch failed: " + res.status);
  const html = await res.text();
  // 防止超大 HTML 导致 linkedom/Readability 消耗过多 CPU/内存
  if (html.length > 5_000_000) {
    throw new Error("Article too large");
  }

  const { document } = parseHTML(html);
  // 只移除明确与正文无关的节点；figure/footer/aside/caption 等交给 Readability 和后续清洗处理
  document
    .querySelectorAll(
      "script, style, noscript, nav, form, iframe, .ad, .ads, .advertisement"
    )
    .forEach((el) => el.remove());

  // ② 200 → Readability
  let article = new Readability(document as unknown as Document).parse();
  debug.readabilityOk = !!article;
  const guardian = isGuardianUrl(url);

  // ③ Readability null → JsonLd 专用 extractor
  if (!article) {
    debug.timesExtractorUsed = true; // 兼容原有 debug 字段
    const fallbackText = extractJsonLdArticle(html);
    if (fallbackText && fallbackText.trim().length >= 200) {
      const paragraphs = truncateParagraphs(
        cleanParagraphs(
          fallbackText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
          guardian
        ),
        maxLength
      );
      debug.reason = "Readability null -> JsonLd extractor";
      console.log("[Fallback] Readability null, JsonLd extractor OK", url);
      return {
        title: "",
        paragraphs,
        wordCount: fallbackText.split(/\s+/).filter(Boolean).length,
        isFullArticle: isFullEnough(paragraphs),
        debug,
      };
    }
    throw new Error("Readability failed");
  }

  const textContent = article.textContent?.trim() ?? "";
  const contentHtml = article.content ?? "";
  let paragraphs = cleanParagraphs(extractParagraphsFromHtml(contentHtml), guardian);
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;

  // ④ 正文太短 → paywall / truncated 判断（条件收紧，避免把片段当全文）
  const isFullArticle = textContent.length >= 500 && isFullEnough(paragraphs);
  if (!isFullArticle) {
    debug.paywallDetected = detectPaywall(html, textContent);
    debug.reason = debug.paywallDetected
      ? "Paywall/truncated detected"
      : "Article content too short or not extractable";
    console.log("[Times] quality check failed", url, debug.reason, "paywall=" + debug.paywallDetected);

    const cached = rssFullTextCache.get(url);
    if (cached && cached.trim().length >= 200) {
      const fallback = truncateParagraphs(
        cleanParagraphs(
          cached
            .split(/\n{2,}/)
            .map((s) => decodeXmlEntities(stripTags(s)).trim())
            .filter(Boolean),
          guardian
        ),
        maxLength
      );
      return {
        title: article.title ?? "",
        paragraphs: fallback,
        wordCount,
        isFullArticle: false,
        debug,
      };
    }
    throw new Error(debug.reason);
  }

  const limited = truncateParagraphs(paragraphs, maxLength);
  return {
    title: article.title ?? "",
    paragraphs: limited,
    wordCount,
    isFullArticle: limited.length === paragraphs.length,
    debug,
  };
}

/**
 * 正文入口：优先直接抓取 + Readability；失败时用 Jina Reader 兜底（解决 NYT 等反爬/付费墙 502）
 */
async function fetchArticle(url: string, maxLength = MAX_ARTICLE_LENGTH): Promise<ArticleExtractResult> {
  const debug: ArticleDebug = {
    fetchStatus: 0,
    readabilityOk: false,
    timesExtractorUsed: false,
    paywallDetected: false,
    usedJinaFallback: false,
  };
  
  const strategies: ("googlebot" | "twitter" | "jina")[] = ["googlebot", "twitter", "jina"];
  let lastError: Error | null = null;
  
  for (const strategy of strategies) {
    try {
      if (strategy === "jina") {
        // 策略 3: Jina AI 兜底
        const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            Accept: "text/plain",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error("Jina fallback failed: " + res.status);
        const text = await res.text();
        const paragraphs = cleanParagraphs(
          text.split(/\n{2,}/).map((s) => decodeXmlEntities(stripTags(s)).trim()).filter((s) => s.length >= 2),
          isGuardianUrl(url)
        );
        if (paragraphs.length < 2) throw lastError ?? new Error("Jina failed to extract paragraphs");

        const limited = truncateParagraphs(paragraphs, maxLength);
        debug.usedJinaFallback = true;
        console.log("[Jina] fallback OK", url);
        return {
          title: "",
          paragraphs: limited,
          wordCount: text.split(/\s+/).filter(Boolean).length,
          isFullArticle: limited.length === paragraphs.length && isFullEnough(paragraphs),
          debug,
        };
      } else {
        // 策略 1 & 2: 直接请求
        return await fetchArticleDirect(url, debug, strategy, maxLength);
      }
    } catch (err) {
      lastError = err as Error;
      debug.reason = (debug.reason ? debug.reason + ` -> ` : "") + `${strategy} failed`;
    }
  }

  if (lastError) {
    (lastError as Error & { debug?: ArticleDebug }).debug = debug;
    throw lastError;
  }
  throw new Error("All fetch strategies failed");
}

/** 抓取多个 RSS feed 并合并去重排序（并发请求，避免串行超时） */
async function fetchRssFeeds(urls: string[], sourceName: string, limit: number): Promise<NewsItem[]> {
  const all: NewsItem[] = [];
  const seen = new Set<string>();

  const requests = urls.map(async (feed) => {
    try {
      const res = await fetch(feed, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Reciter/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const xml = await res.text();
      return extractRssItems(xml, sourceName, limit * 2);
    } catch {
      return null; // 单个 feed 失败不阻断其他 feed
    }
  });

  const results = await Promise.allSettled(requests);
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      for (const it of result.value) {
        if (!seen.has(it.link)) {
          seen.add(it.link);
          all.push(it);
        }
      }
    }
  }

  all.sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
  return all.slice(0, limit);
}

async function handleNews(request: Request, cors: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 文章正文提取
  if (path === "/api/news/article" && request.method === "GET") {
    const target = url.searchParams.get("url") ?? "";
    if (!/^https?:\/\//i.test(target) || isBlockedRssUrl(target)) {
      return json({ error: "Invalid or blocked url" }, 400, cors);
    }
    try {
      const maxLengthRaw = url.searchParams.get("maxLength");
      const maxLength = maxLengthRaw
        ? Math.min(100000, Math.max(1000, parseInt(maxLengthRaw, 10) || MAX_ARTICLE_LENGTH))
        : MAX_ARTICLE_LENGTH;
      const result = await fetchArticle(target, maxLength);
      return json(result, 200, cors);
    } catch (e) {
      const err = e as Error & { debug?: ArticleDebug };
      return json(
        { error: "Article fetch failed", detail: String(e), debug: err.debug },
        502,
        cors
      );
    }
  }

  // 自定义 RSS 列表（用户导入的多个主题链接）
  if (path === "/api/news/custom" && request.method === "POST") {
    try {
      const body = (await request.json()) as { name?: string; urls?: string[]; limit?: number };
      const limit = Math.min(10, Math.max(1, body.limit ?? 8));
      const urls = (body.urls ?? [])
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//i.test(u) && !isBlockedRssUrl(u))
        .slice(0, 20);
      if (urls.length === 0) {
        return json({ error: "No valid urls" }, 400, cors);
      }
      const sourceName = body.name?.trim().slice(0, 50) || "Custom";
      const items = await fetchRssFeeds(urls, sourceName, limit);
      if (items.length === 0) {
        return json({ error: "No articles from feeds" }, 502, cors);
      }
      return json({ source: sourceName, items }, 200, cors);
    } catch (e) {
      return json({ error: "Invalid request", detail: String(e) }, 400, cors);
    }
  }

  // 内置 RSS 列表（支持 topic 切换）
  if (path === "/api/news" && request.method === "GET") {
    const source = url.searchParams.get("source") ?? "cgtn";
    const topic = url.searchParams.get("topic") ?? "";
    const limit = Math.min(10, Math.max(1, parseInt(url.searchParams.get("limit") ?? "8", 10) || 8));
    const cfg = NEWS_SOURCES[source];
    if (!cfg) {
      return json({ error: "Unknown source", sources: Object.keys(NEWS_SOURCES) }, 400, cors);
    }
    const selectedTopics = topic
      ? cfg.topics.filter((t) => t.id === topic)
      : cfg.topics;
    if (topic && selectedTopics.length === 0) {
      return json({ error: "Unknown topic", topics: cfg.topics }, 400, cors);
    }
    const items = await fetchRssFeeds(
      selectedTopics.map((t) => t.url),
      cfg.name,
      limit
    );
    if (items.length === 0) {
      return json({ error: "No articles from feeds" }, 502, cors);
    }
    return json({ source: cfg.name, topics: cfg.topics, items }, 200, cors);
  }

  return json({ error: "Not Found" }, 404, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isSync = url.pathname.startsWith("/api/sync/");
    const origin = request.headers.get("Origin") ?? "";

    // 拒绝不在白名单内的来源；无 Origin 的原生/WebView 请求放行（同步有 Token，DeepL 用用户自己的 Key）
    if (origin && !isOriginAllowed(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (isSync) {
      return handleSync(request, env, cors);
    }

    if (url.pathname.startsWith("/api/news")) {
      return handleNews(request, cors);
    }

    // DeepL 只允许明确的路径，避免把任意请求都当翻译代理
    if (url.pathname === "/" || url.pathname === "/api/deepl" || url.pathname === "/translate") {
      return handleDeepL(request, cors);
    }

    return new Response("Not Found", { status: 404, headers: cors });
  },
};
