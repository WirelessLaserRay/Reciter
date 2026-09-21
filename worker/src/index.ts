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
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token, X-Device-Id, X-Expected-Updated-At, X-Force, If-Match",
    "Access-Control-Expose-Headers": "X-Snapshot-Updated-At, X-Snapshot-Device-Id, Retry-After",
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

/** 常量时间字符串比对，防止侧信道时序攻击泄露 SYNC_TOKEN */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(request: Request, env: Env): boolean {
  const token = request.headers.get("X-Sync-Token") ?? "";
  const expected = env.SYNC_TOKEN ?? "";
  if (!expected || !token) return false;
  return timingSafeEqual(token, expected);
}

/** 滑动时间窗口简易限流器（实例内存级，防止暴力枚举与泛洪） */
interface RateLimitBucket {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(key);
  if (!bucket || now > bucket.resetTime) {
    if (rateLimitMap.size > 2000) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetTime) rateLimitMap.delete(k);
      }
    }
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) {
    return false;
  }
  bucket.count++;
  return true;
}

/** 处理 /api/sync/* 的轻量全量快照同步（支持并发冲突检测与设备追踪） */
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
    let deviceId: string | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.snapshot === "string") {
          updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
          deviceId = typeof parsed.deviceId === "string" ? parsed.deviceId : null;
        } else if (parsed && typeof parsed.updatedAt === "string") {
          updatedAt = parsed.updatedAt;
          deviceId = parsed.deviceId ?? null;
        }
      } catch {
        updatedAt = null;
      }
    }
    return json({ updatedAt, deviceId }, 200, cors);
  }

  if (path === "/api/sync/snapshot") {
    if (request.method === "GET") {
      const raw = await env.KV_BINDING.get(SNAPSHOT_KEY);
      if (raw === null) {
        return json({ error: "No snapshot yet" }, 404, cors);
      }
      let snapshot = raw;
      let updatedAt: string | null = null;
      let deviceId: string | null = null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.snapshot === "string") {
          snapshot = parsed.snapshot;
          updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
          deviceId = typeof parsed.deviceId === "string" ? parsed.deviceId : null;
        }
      } catch {
        // raw 是旧版直接存储的备份 JSON
      }
      const responseHeaders: Record<string, string> = {
        ...cors,
        "Content-Type": "application/json",
      };
      if (updatedAt) {
        responseHeaders["X-Snapshot-Updated-At"] = updatedAt;
      }
      if (deviceId) {
        responseHeaders["X-Snapshot-Device-Id"] = deviceId;
      }
      return new Response(snapshot, {
        status: 200,
        headers: responseHeaders,
      });
    }

    if (request.method === "PUT") {
      const raw = await request.text();
      if (!raw || raw.length > 10 * 1024 * 1024) {
        return json({ error: "Snapshot too large (max 10MB)" }, 413, cors);
      }

      // 验证必须是合法的 JSON 对象
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return json({ error: "Invalid backup JSON: root must be an object" }, 400, cors);
        }
      } catch {
        return json({ error: "Invalid JSON" }, 400, cors);
      }

      // 乐观并发控制：客户端若提供预期时间戳且未声明 force，则检测云端并发更新
      const isForce = url.searchParams.get("force") === "true" || request.headers.get("X-Force") === "true";
      const expectedUpdatedAt = request.headers.get("X-Expected-Updated-At") || request.headers.get("If-Match");

      if (!isForce && expectedUpdatedAt) {
        const existingRaw = await env.KV_BINDING.get(SNAPSHOT_KEY);
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw);
            const currentUpdatedAt = typeof existing?.updatedAt === "string" ? existing.updatedAt : null;
            if (currentUpdatedAt && currentUpdatedAt !== expectedUpdatedAt) {
              return json(
                {
                  error: "Conflict",
                  message: "云端检测到更新的快照，若继续将覆盖云端数据",
                  remoteUpdatedAt: currentUpdatedAt,
                  remoteDeviceId: existing?.deviceId ?? null,
                },
                409,
                cors
              );
            }
          } catch {
            // ignore
          }
        }
      }

      const clientDeviceId = request.headers.get("X-Device-Id")?.trim().slice(0, 50) || "unknown";
      const updatedAt = new Date().toISOString();
      const payload = JSON.stringify({
        updatedAt,
        deviceId: clientDeviceId,
        snapshot: raw,
      });
      await env.KV_BINDING.put(SNAPSHOT_KEY, payload);
      return json({ ok: true, updatedAt, deviceId: clientDeviceId }, 200, cors);
    }

    if (request.method === "DELETE") {
      await env.KV_BINDING.delete(SNAPSHOT_KEY);
      return json({ ok: true }, 200, cors);
    }
  }

  return json({ error: "Not Found" }, 404, cors);
}

/** 原有 DeepL CORS 代理（强化参数校验与超时保护） */
async function handleDeepL(request: Request, cors: Record<string, string>): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405, cors);
  }

  let body: {
    text?: string[];
    target_lang?: string;
    source_lang?: string;
    auth_key?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }

  const { auth_key, text, target_lang, source_lang } = body;
  if (!auth_key) {
    return json({ error: "Missing auth_key" }, 400, cors);
  }
  if (!text || !Array.isArray(text) || text.length === 0) {
    return json({ error: "Missing text" }, 400, cors);
  }
  if (text.length > 50) {
    return json({ error: "Too many text entries (max 50)" }, 400, cors);
  }
  if (text.some((t) => typeof t !== "string" || t.length > 5000)) {
    return json({ error: "Text entry too long (max 5000 chars)" }, 400, cors);
  }

  const sanitizedTarget = (target_lang || "ZH-HANS").trim().toUpperCase();
  if (!/^[A-Z]{2,3}(-[A-Z0-9]{2,4})?$/.test(sanitizedTarget)) {
    return json({ error: "Invalid target_lang code" }, 400, cors);
  }

  // 根据 Key 特征自适应选择 Free / Pro API 终端
  const deeplEndpoint = auth_key.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const deeplPayload: Record<string, unknown> = {
    text,
    target_lang: sanitizedTarget,
  };
  if (source_lang && typeof source_lang === "string" && /^[A-Z]{2,3}$/i.test(source_lang.trim())) {
    deeplPayload.source_lang = source_lang.trim().toUpperCase();
  }

  try {
    const deeplRes = await fetch(deeplEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `DeepL-Auth-Key ${auth_key}`,
      },
      body: JSON.stringify(deeplPayload),
      signal: AbortSignal.timeout(15000),
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
  channel?: string;
  channelLabel?: string;
  isPaywallDetected?: boolean;
  debug?: ArticleDebug;
}

interface ArticleDebug {
  fetchStatus: number;
  readabilityOk: boolean;
  timesExtractorUsed: boolean;
  paywallDetected: boolean;
  usedJinaFallback: boolean;
  usedArchiveTodayFallback?: boolean;
  usedWaybackFallback?: boolean;
  reason?: string;
}

/** 从 Readability 的 article.content HTML 中提取结构化段落/块 */
function extractParagraphsFromHtml(html: string): string[] {
  const { document } = parseHTML(html);
  const blocks: string[] = [];
  document
    .querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre")
    .forEach((el: any) => {
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

/** 严格 SSRF 防护：禁止请求内网/保留地址/非标准协议与非法端口 */
function isBlockedRssUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // 1. 协议限制
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }

    // 2. 端口限制（只允许标准网络端口）
    if (parsed.port && !["80", "443", "8080", "8443"].includes(parsed.port)) {
      return true;
    }

    const host = parsed.hostname.toLowerCase().trim();
    if (!host) return true;

    // 3. 内部域名与特殊测试顶级域
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      host.endsWith(".lan") ||
      host.endsWith(".home") ||
      host.endsWith(".corp") ||
      host.endsWith(".test") ||
      host.endsWith(".example") ||
      host.endsWith(".invalid") ||
      host.includes("nip.io") ||
      host.includes("sslip.io") ||
      host.includes("localtest.me") ||
      host.includes("lvh.me")
    ) {
      return true;
    }

    // 4. IPv6 检测
    const cleanHost = host.replace(/^\[|\]$/g, "");
    if (cleanHost.includes(":")) {
      // IPv6 回环、未指定、链路本地、唯一本地、IPv4 映射
      if (
        cleanHost === "::1" ||
        cleanHost === "::" ||
        cleanHost.startsWith("fe80:") ||
        cleanHost.startsWith("fc00:") ||
        cleanHost.startsWith("fd00:") ||
        cleanHost.startsWith("ff") ||
        cleanHost.includes("::ffff:")
      ) {
        return true;
      }
    }

    // 5. 纯整数或十六进制 IP 绕过（如 2130706433 或 0x7f000001）
    if (/^(0x[0-9a-f]+|\d+)$/i.test(cleanHost)) {
      return true;
    }

    // 6. IPv4 点分十进制解析
    const ipv4 = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const a = parseInt(ipv4[1], 10);
      const b = parseInt(ipv4[2], 10);
      const c = parseInt(ipv4[3], 10);
      const d = parseInt(ipv4[4], 10);
      if (a > 255 || b > 255 || c > 255 || d > 255) return true;

      // 0.0.0.0/8 (当前网络)
      if (a === 0) return true;
      // 10.0.0.0/8 (私有网络)
      if (a === 10) return true;
      // 100.64.0.0/10 (运营商级 NAT)
      if (a === 100 && b >= 64 && b <= 127) return true;
      // 127.0.0.0/8 (环回地址)
      if (a === 127) return true;
      // 169.254.0.0/16 (链路本地 / 云平台元数据)
      if (a === 169 && b === 254) return true;
      // 172.16.0.0/12 (私有网络)
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.0.0.0/24 (IETF 协议)
      if (a === 192 && b === 0 && c === 0) return true;
      // 192.0.2.0/24 (TEST-NET-1)
      if (a === 192 && b === 0 && c === 2) return true;
      // 192.168.0.0/16 (私有网络)
      if (a === 192 && b === 168) return true;
      // 198.18.0.0/15 (基准测试)
      if (a === 198 && (b === 18 || b === 19)) return true;
      // 198.51.100.0/24 (TEST-NET-2)
      if (a === 198 && b === 51 && c === 100) return true;
      // 203.0.113.0/24 (TEST-NET-3)
      if (a === 203 && b === 0 && c === 113) return true;
      // 224.0.0.0/4 及以上 (组播与未来保留 240.0.0.0/4, 广播 255.255.255.255)
      if (a >= 224) return true;
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

/** 深度查找对象中的文章长文本或段落块数组 */
function findContentInObjectWorker(obj: any, depth = 0): string | null {
  if (!obj || depth > 5) return null;
  if (typeof obj === "string" && obj.length >= 400 && !obj.startsWith("http") && !obj.startsWith("data:")) {
    const clean = stripTags(decodeXmlEntities(obj)).trim();
    if (clean.length >= 350) return clean;
  }
  if (Array.isArray(obj)) {
    const joined = obj
      .map((item) => {
        if (typeof item === "string") return stripTags(decodeXmlEntities(item)).trim();
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
      const found = findContentInObjectWorker(item, depth + 1);
      if (found) return found;
    }
  } else if (typeof obj === "object") {
    const priorityKeys = ["articleBody", "content", "contentHtml", "body", "story", "html", "articleText"];
    for (const key of priorityKeys) {
      if (key in obj) {
        const found = findContentInObjectWorker(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const key of Object.keys(obj)) {
      if (priorityKeys.includes(key)) continue;
      const found = findContentInObjectWorker(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** 通用提取：JSON-LD articleBody / Next.js __NEXT_DATA__ / article 标签 */
function extractJsonLdArticle(html: string): string | null {
  // 1. JSON-LD (application/ld+json)
  const jsonLdBlocks = [
    ...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const m of jsonLdBlocks) {
    try {
      const data = JSON.parse(decodeXmlEntities(m[1]));
      const candidates = Array.isArray(data) ? data : (data?.["@graph"] ?? [data]);
      for (const item of candidates) {
        const body =
          typeof item?.articleBody === "string"
            ? item.articleBody
            : typeof item?.text === "string" && item["@type"] && /article|post|news/i.test(String(item["@type"]))
            ? item.text
            : null;
        if (body && body.trim().length > 300) {
          return stripTags(decodeXmlEntities(body)).trim();
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Next.js __NEXT_DATA__
  const nextDataBlocks = [
    ...html.matchAll(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const m of nextDataBlocks) {
    try {
      const nextJson = JSON.parse(m[1]);
      const pageProps = nextJson?.props?.pageProps;
      if (pageProps) {
        const found = findContentInObjectWorker(pageProps);
        if (found && found.length >= 350) return found;
      }
    } catch {}
  }

  // 3. Fallback to article selector
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

/** 检测 paywall / 截断标志 */
function detectPaywall(html: string, text: string): boolean {
  const lower = (html + " " + text).toLowerCase();
  return PAYWALL_FINGERPRINTS.some((s) => lower.includes(s));
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

  // 校验 Content-Type：防止请求大文件、媒体流或非 HTML 数据导致内存过载
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml") &&
    !contentType.includes("text/xml") &&
    !contentType.includes("text/plain")
  ) {
    throw new Error("Unsupported content-type: " + contentType);
  }

  const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
  if (contentLength > 5_000_000) {
    throw new Error("Article too large (max 5MB)");
  }

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
    .forEach((el: any) => el.remove());

  // ② 200 → Readability
  let article = new Readability(document as any).parse();
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
        isPaywallDetected: false,
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
    // 借鉴 BPC：若 Readability 仅抓到付费墙片段，优先尝试从结构化数据（JSON-LD / Next.js）提取未截断正文
    const structuredText = extractJsonLdArticle(html);
    if (structuredText && structuredText.trim().length >= 400 && structuredText.length > textContent.length) {
      const structuredParagraphs = truncateParagraphs(
        cleanParagraphs(
          structuredText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
          guardian
        ),
        maxLength
      );
      if (structuredParagraphs.length >= 2) {
        debug.reason = "Paywall bypassed via JSON-LD / Next.js structured data";
        console.log("[Fallback] Structured data OK", url);
        return {
          title: article.title ?? "",
          paragraphs: structuredParagraphs,
          wordCount: structuredText.split(/\s+/).filter(Boolean).length,
          isFullArticle: isFullEnough(structuredParagraphs),
          isPaywallDetected: false,
          debug,
        };
      }
    }

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
        isPaywallDetected: debug.paywallDetected,
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
    isPaywallDetected: false,
    debug,
  };
}

/** Jina AI 结构化 Markdown 提取 */
async function fetchArticleFromJina(
  url: string,
  maxLength = MAX_ARTICLE_LENGTH,
  debug: ArticleDebug
): Promise<ArticleExtractResult> {
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
  const rawParagraphs = text
    .split(/\n{2,}/)
    .map((s) => decodeXmlEntities(stripTags(s)).trim())
    .filter((s) => s.length >= 2 && !s.startsWith("![") && !s.startsWith("Title:"));
  const paragraphs = cleanParagraphs(rawParagraphs, isGuardianUrl(url));
  if (paragraphs.length < 2) throw new Error("Jina failed to extract paragraphs");

  const textContent = paragraphs.join(" ");
  const paywall = detectPaywall(text, textContent);
  const limited = truncateParagraphs(paragraphs, maxLength);
  debug.usedJinaFallback = true;

  return {
    title: "",
    paragraphs: limited,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    isFullArticle: !paywall && limited.length >= 3 && textContent.length >= 450,
    channel: "jina",
    channelLabel: "Jina Reader 提取",
    isPaywallDetected: paywall,
    debug,
  };
}

/** Archive.today (archive.is / archive.ph) 快照检索 */
async function fetchArticleFromArchiveToday(
  url: string,
  maxLength = MAX_ARTICLE_LENGTH,
  debug: ArticleDebug
): Promise<ArticleExtractResult> {
  const hosts = ["https://archive.is", "https://archive.ph", "https://archive.today"];
  let lastError: Error | null = null;

  for (const host of hosts) {
    try {
      const target = `${host}/newest/${encodeURI(url)}`;
      const res = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("Archive.today HTTP " + res.status);
      const html = await res.text();
      if (html.includes("cf-turnstile") || html.includes("challenge-platform") || html.includes("Just a moment...")) {
        throw new Error("Archive.today 遇到人机验证拦截");
      }

      const { document } = parseHTML(html);
      document.querySelectorAll("#HEADER, #banner, #CONTENT-HEADER, script, style, noscript, nav, form, iframe, .ad, .ads").forEach((el: any) => el.remove());

      const article = new Readability(document as any).parse();
      if (!article) throw new Error("Archive.today Readability failed");

      const textContent = article.textContent?.trim() ?? "";
      const paragraphs = cleanParagraphs(extractParagraphsFromHtml(article.content ?? ""), isGuardianUrl(url));
      const paywall = detectPaywall(html, textContent);
      const limited = truncateParagraphs(paragraphs, maxLength);
      debug.usedArchiveTodayFallback = true;

      return {
        title: article.title ?? "",
        paragraphs: limited,
        wordCount: textContent.split(/\s+/).filter(Boolean).length,
        isFullArticle: !paywall && limited.length >= 3 && textContent.length >= 450,
        channel: "archive_today",
        channelLabel: "Archive.today 快照",
        isPaywallDetected: paywall,
        debug,
      };
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError ?? new Error("Archive.today failed");
}

/** Wayback Machine (archive.org) 历史快照检索 */
async function fetchArticleFromWayback(
  url: string,
  maxLength = MAX_ARTICLE_LENGTH,
  debug: ArticleDebug
): Promise<ArticleExtractResult> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  const apiRes = await fetch(api, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!apiRes.ok) throw new Error("Wayback availability HTTP " + apiRes.status);
  const meta = (await apiRes.json()) as {
    archived_snapshots?: { closest?: { available: boolean; url: string } };
  };
  const snapshotUrl = meta?.archived_snapshots?.closest?.url;
  if (!meta?.archived_snapshots?.closest?.available || !snapshotUrl) {
    throw new Error("Wayback Machine 暂无此文章快照");
  }

  const pageRes = await fetch(snapshotUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!pageRes.ok) throw new Error("Wayback fetch HTTP " + pageRes.status);
  const html = await pageRes.text();
  const { document } = parseHTML(html);
  document.querySelectorAll("#wm-ipp-base, #wm-ipp, #wm-ipp-inside, script, style, noscript, nav, form, iframe, .ad, .ads").forEach((el: any) => el.remove());

  const article = new Readability(document as any).parse();
  if (!article) throw new Error("Wayback Readability failed");

  const textContent = article.textContent?.trim() ?? "";
  const paragraphs = cleanParagraphs(extractParagraphsFromHtml(article.content ?? ""), isGuardianUrl(url));
  const paywall = detectPaywall(html, textContent);
  const limited = truncateParagraphs(paragraphs, maxLength);
  debug.usedWaybackFallback = true;

  return {
    title: article.title ?? "",
    paragraphs: limited,
    wordCount: textContent.split(/\s+/).filter(Boolean).length,
    isFullArticle: !paywall && limited.length >= 3 && textContent.length >= 450,
    channel: "wayback",
    channelLabel: "Wayback 历史存档",
    isPaywallDetected: paywall,
    debug,
  };
}

/**
 * 正文入口：支持指定通道与自动优化多网关级联降级
 */
async function fetchArticle(
  url: string,
  maxLength = MAX_ARTICLE_LENGTH,
  channel = "auto"
): Promise<ArticleExtractResult> {
  const debug: ArticleDebug = {
    fetchStatus: 0,
    readabilityOk: false,
    timesExtractorUsed: false,
    paywallDetected: false,
    usedJinaFallback: false,
  };

  if (channel === "direct") {
    const res = await fetchArticleDirect(url, debug, "googlebot", maxLength);
    return { ...res, channel: "direct", channelLabel: "直连抓取" };
  }
  if (channel === "jina") {
    return await fetchArticleFromJina(url, maxLength, debug);
  }
  if (channel === "archive_today") {
    return await fetchArticleFromArchiveToday(url, maxLength, debug);
  }
  if (channel === "wayback") {
    return await fetchArticleFromWayback(url, maxLength, debug);
  }

  // 自动优化通道级联：直连(googlebot/twitter) -> Jina -> Archive.today -> Wayback
  let candidate: ArticleExtractResult | null = null;
  let lastError: Error | null = null;

  // 1. 直连 (Googlebot / Twitter)
  for (const strategy of ["googlebot", "twitter"] as const) {
    try {
      const res = await fetchArticleDirect(url, debug, strategy, maxLength);
      if (res.isFullArticle && !res.isPaywallDetected) {
        return { ...res, channel: "direct", channelLabel: "直连抓取" };
      }
      candidate = { ...res, channel: "direct", channelLabel: "直连抓取" };
    } catch (e) {
      lastError = e as Error;
      debug.reason = (debug.reason ? debug.reason + ` -> ` : "") + `${strategy} failed`;
    }
  }

  // 2. Jina Reader 兜底
  try {
    const res = await fetchArticleFromJina(url, maxLength, debug);
    if (res.isFullArticle && !res.isPaywallDetected) {
      return res;
    }
    if (!candidate || res.paragraphs.length > candidate.paragraphs.length) {
      candidate = res;
    }
  } catch (e) {
    lastError = e as Error;
  }

  // 3. Archive.today 快照兜底
  try {
    const res = await fetchArticleFromArchiveToday(url, maxLength, debug);
    if (res.isFullArticle && !res.isPaywallDetected) {
      return res;
    }
    if (!candidate || res.paragraphs.length > candidate.paragraphs.length) {
      candidate = res;
    }
  } catch (e) {
    lastError = e as Error;
  }

  // 4. Wayback Machine 兜底
  try {
    const res = await fetchArticleFromWayback(url, maxLength, debug);
    if (res.isFullArticle && !res.isPaywallDetected) {
      return res;
    }
    if (!candidate || res.paragraphs.length > candidate.paragraphs.length) {
      candidate = res;
    }
  } catch (e) {
    lastError = e as Error;
  }

  if (candidate) {
    return candidate;
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
      const channel = url.searchParams.get("channel") || "auto";
      const result = await fetchArticle(target, maxLength, channel);
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
      const limit = Math.min(50, Math.max(1, body.limit ?? 30));
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
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "30", 10) || 30));
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

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    // 1. 同步接口限流：每分钟上限 30 次（防御暴力猜测与高频刷库）
    if (isSync) {
      if (!checkRateLimit(`sync:${clientIp}`, 30, 60_000)) {
        return json(
          { error: "Too Many Requests", message: "同步请求过于频繁，请稍候再试" },
          429,
          { ...cors, "Retry-After": "60" }
        );
      }
      return handleSync(request, env, cors);
    }

    // 2. 新闻接口限流：全文抓取每分钟上限 60 次，聚合列表每分钟上限 30 次
    if (url.pathname.startsWith("/api/news")) {
      const isArticle = url.pathname === "/api/news/article";
      const limit = isArticle ? 60 : 30;
      if (!checkRateLimit(`news:${clientIp}`, limit, 60_000)) {
        return json(
          { error: "Too Many Requests", message: "文章提取过于频繁，请稍候再试" },
          429,
          { ...cors, "Retry-After": "60" }
        );
      }
      return handleNews(request, cors);
    }

    // 3. DeepL 翻译代理：每分钟上限 60 次
    const cleanPath = url.pathname.replace(/\/+$/, "") || "/";
    if (cleanPath === "/" || cleanPath === "/api/deepl" || cleanPath === "/translate") {
      if (!checkRateLimit(`deepl:${clientIp}`, 60, 60_000)) {
        return json(
          { error: "Too Many Requests", message: "翻译请求过于频繁，请稍候再试" },
          429,
          { ...cors, "Retry-After": "60" }
        );
      }
      return handleDeepL(request, cors);
    }

    return new Response("Not Found", { status: 404, headers: cors });
  },
};
