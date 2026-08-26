/**
 * Reciter Cloudflare Worker
 *
 * 1. DeepL CORS Proxy：纯转发代理，接收前端请求（携带用户自己的 API Key），转发到 DeepL。
 * 2. 轻量全量快照同步：把 Reciter 备份 JSON 存到 KV，供 PWA / Windows 跨端同步。
 *
 * Worker 不存储 DeepL Key；同步 Token 通过环境变量 SYNC_TOKEN 配置（wrangler secret put）。
 */

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
}

const NEWS_SOURCES: Record<string, { name: string; feeds: string[] }> = {
  chinadaily: {
    name: "China Daily",
    feeds: [
      "https://www.chinadaily.com.cn/rss/opinion_rss.xml",
      "https://www.chinadaily.com.cn/rss/world_rss.xml",
    ],
  },
  nyt: { name: "The New York Times", feeds: ["https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"] },
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
    if (title && sourceUrl) {
      items.push({ title, link: sourceUrl, description, pubDate, source });
    }
  }
  return items;
}

/** 抓取文章正文：提取 <p> 文本，去掉脚本/样式，限制长度 */
async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Reciter/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error("Article fetch failed: " + res.status);
  const html = await res.text();
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const paragraphs = [...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((mm) => decodeXmlEntities(stripTags(mm[1])))
    .filter((t) => t.length > 20);
  const text = paragraphs.join("\n\n").slice(0, 12000);
  return text || decodeXmlEntities(stripTags(cleaned)).slice(0, 8000);
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
      const content = await fetchArticleText(target);
      if (!content) {
        return json({ error: "No content extracted" }, 422, cors);
      }
      return json({ content }, 200, cors);
    } catch (e) {
      return json({ error: "Article fetch failed", detail: String(e) }, 502, cors);
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
