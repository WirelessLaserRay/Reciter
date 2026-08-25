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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isSync = url.pathname.startsWith("/api/sync/");
    const origin = request.headers.get("Origin") ?? "";

    // 拒绝不在白名单内的来源；同步接口允许无 Origin 的桌面端原生请求（Token 已鉴权）
    if (!isOriginAllowed(origin) && !(isSync && !origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (isSync) {
      return handleSync(request, env, cors);
    }

    return handleDeepL(request, cors);
  },
};
