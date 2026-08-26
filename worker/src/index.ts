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
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
    "Access-Control-Max-Age": "86400",
  };
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

  if (path === "/api/sync/meta" && request.method === "GET") {
    const updatedAt = await env.KV_BINDING.get("snapshot_updated_at");
    return json({ updatedAt: updatedAt ?? null }, 200, cors);
  }

  if (path === "/api/sync/snapshot") {
    if (request.method === "GET") {
      const snapshot = await env.KV_BINDING.get("snapshot");
      if (snapshot === null) {
        return json({ error: "No snapshot yet" }, 404, cors);
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
      await env.KV_BINDING.put("snapshot", raw);
      await env.KV_BINDING.put("snapshot_updated_at", updatedAt);
      return json({ ok: true, updatedAt }, 200, cors);
    }

    if (request.method === "DELETE") {
      await env.KV_BINDING.delete("snapshot");
      await env.KV_BINDING.delete("snapshot_updated_at");
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
/** 近期 RSS 自带的全文缓存：URL -> 全文（Worker 单实例内存） */
const rssFullTextCache = new Map<string, string>();

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

/** 全文质量判断：至少 3 个段落且累计正文长度 ≥ 400 字符 */
function isFullEnough(paragraphs: string[]): boolean {
  return paragraphs.length >= 3 && paragraphs.reduce((sum, p) => sum + p.length, 0) >= 400;
}

const NEWS_SOURCES: Record<string, { name: string; feeds: string[] }> = {
  chinadaily: {
    name: "China Daily",
    feeds: [
      "https://www.chinadaily.com.cn/rss/opinion_rss.xml",
      "https://www.chinadaily.com.cn/rss/world_rss.xml",
    ],
  },
  nyt: {
    name: "The New York Times",
    feeds: [
      "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
      "https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/spotlight/artificial-intelligence/rss.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
    ],
  },
  guardian: {
    name: "The Guardian",
    feeds: [
      "https://www.theguardian.com/world/rss",
      "https://www.theguardian.com/technology/rss",
      "https://www.theguardian.com/environment/rss",
    ],
  },
  npr: {
    name: "NPR",
    feeds: [
      "https://feeds.npr.org/1001/rss.xml",
      "https://feeds.npr.org/1007/rss.xml",
    ],
  },
  bbc: {
    name: "BBC",
    feeds: [
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
      "https://feeds.bbci.co.uk/news/technology/rss.xml",
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

function extractRssItems(xml: string, source: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
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
      if (fullContent) rssFullTextCache.set(sourceUrl, fullContent);
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

/** NYT 专用提取：JSON-LD articleBody / article 内段落 */
function extractTimesArticle(html: string): string | null {
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

/**
 * 抓取文章正文：
 * fetch 原始 URL → DOMParser → Readability → article.content 结构化解析
 * → Guardian 特殊清洗 → 质量检测 → 返回 paragraphs
 */
async function fetchArticleDirect(url: string, debug: ArticleDebug): Promise<ArticleExtractResult> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  debug.fetchStatus = res.status;

  // ① 记录真实 status；403/401 = 访问控制/订阅问题
  if (res.status === 401 || res.status === 403) {
    debug.reason = "Times access control / subscription required (HTTP " + res.status + ")";
    console.log("[Times] access control", url, res.status);
    throw new Error(debug.reason);
  }
  if (!res.ok) throw new Error("Article fetch failed: " + res.status);
  const html = await res.text();

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

  // ③ Readability null → Times 专用 extractor
  if (!article) {
    debug.timesExtractorUsed = true;
    const timesText = extractTimesArticle(html);
    if (timesText && timesText.trim().length >= 200) {
      const paragraphs = truncateParagraphs(
        cleanParagraphs(
          timesText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
          guardian
        )
      );
      debug.reason = "Readability null -> Times extractor";
      console.log("[Times] Readability null, Times extractor OK", url);
      return {
        title: "",
        paragraphs,
        wordCount: timesText.split(/\s+/).filter(Boolean).length,
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
        )
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

  const limited = truncateParagraphs(paragraphs);
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
async function fetchArticle(url: string): Promise<ArticleExtractResult> {
  const debug: ArticleDebug = {
    fetchStatus: 0,
    readabilityOk: false,
    timesExtractorUsed: false,
    paywallDetected: false,
    usedJinaFallback: false,
  };
  try {
    return await fetchArticleDirect(url, debug);
  } catch (directError) {
    try {
      const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/plain",
        },
        redirect: "follow",
      });
      if (!res.ok) throw new Error("Jina fallback failed: " + res.status);
      const text = await res.text();
      const paragraphs = cleanParagraphs(
        text
          .split(/\n{2,}/)
          .map((s) => decodeXmlEntities(stripTags(s)).trim())
          .filter((s) => s.length >= 2),
        isGuardianUrl(url)
      );
      if (paragraphs.length < 2) throw directError;

      const limited = truncateParagraphs(paragraphs);
      debug.usedJinaFallback = true;
      debug.reason = (debug.reason ? debug.reason + " -> " : "") + "Jina fallback";
      console.log("[Times] Jina fallback OK", url);
      return {
        title: "",
        paragraphs: limited,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        isFullArticle: limited.length === paragraphs.length && isFullEnough(paragraphs),
        debug,
      };
    } catch {
      (directError as Error & { debug?: ArticleDebug }).debug = debug;
      throw directError;
    }
  }
}

async function handleNews(request: Request, cors: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 文章正文提取
  if (path === "/api/news/article" && request.method === "GET") {
    const target = url.searchParams.get("url") ?? "";
    if (!/^https?:\/\//i.test(target)) {
      return json({ error: "Invalid url" }, 400, cors);
    }
    try {
      const result = await fetchArticle(target);
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

  // RSS 列表
  if (path === "/api/news" && request.method === "GET") {
    const source = url.searchParams.get("source") ?? "chinadaily";
    const limit = Math.min(10, Math.max(1, parseInt(url.searchParams.get("limit") ?? "5", 10) || 5));
    const cfg = NEWS_SOURCES[source];
    if (!cfg) {
      return json({ error: "Unknown source", sources: Object.keys(NEWS_SOURCES) }, 400, cors);
    }
    const all: NewsItem[] = [];
    const seen = new Set<string>();
    for (const feed of cfg.feeds) {
      try {
        const res = await fetch(feed, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Reciter/1.0)" },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        for (const it of extractRssItems(xml, cfg.name, limit * 2)) {
          if (!seen.has(it.link)) {
            seen.add(it.link);
            all.push(it);
          }
        }
      } catch {
        // 单个 feed 失败不阻断其他 feed
      }
    }
    all.sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
    const items = all.slice(0, limit);
    if (items.length === 0) {
      return json({ error: "No articles from feeds" }, 502, cors);
    }
    return json({ source: cfg.name, items }, 200, cors);
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

    return handleDeepL(request, cors);
  },
};
