/**
 * Reciter DeepL CORS Proxy
 *
 * 纯转发代理：接收前端请求（携带用户自己的 API Key），转发到 DeepL，返回结果。
 * Worker 本身不存储任何密钥。
 */

const DEEPL_API = "https://api-free.deepl.com/v2/translate";

/** 允许跨域的来源白名单（正则） */
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[\w-]+\.github\.io$/,
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((re) => re.test(origin));
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

interface TranslateRequest {
  text?: string[];
  target_lang?: string;
  auth_key?: string;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";

    // 拒绝不在白名单内的来源
    if (!isOriginAllowed(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    const cors = corsHeaders(origin);

    // 处理 CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    // 解析请求体
    let body: TranslateRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 校验必填字段
    const { auth_key, text, target_lang } = body;
    if (!auth_key) {
      return new Response(JSON.stringify({ error: "Missing auth_key" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!text || !Array.isArray(text) || text.length === 0) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 防滥用：限制 text 数量和单条长度
    if (text.length > 20) {
      return new Response(JSON.stringify({ error: "Too many text entries (max 20)" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (text.some((t) => typeof t !== "string" || t.length > 2000)) {
      return new Response(JSON.stringify({ error: "Text entry too long (max 2000 chars)" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 构造转发给 DeepL 的请求（去掉 auth_key，放到 Header 里）
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
        headers: {
          ...cors,
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "DeepL request failed", detail: String(e) }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  },
};
