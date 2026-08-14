import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";
import { getPromptTemplate } from "@/lib/ai-prompts";
import { parseGradeResult, parseSSELine } from "@/lib/ai-parse";

export interface AIConfig {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIQuestionResult {
  question: string;
  answer?: string;
}

export interface AIGradeResult {
  grade: 1 | 2 | 3 | 4;
  comment: string;
}

export interface AIQuestionParams {
  front: string;
  back: string;
  type: "cloze" | "context" | "example" | "choice";
  /** 选择题方向（choice 模板的 {direction} 占位符） */
  direction?: string;
}

/** 从 settings KV 读取 AI 配置 */
export async function getAIConfig(): Promise<AIConfig> {
  const [baseURL, apiKey, model, temp] = await Promise.all([
    db.getSetting("ai_base_url"),
    db.getSetting("ai_api_key"),
    db.getSetting("ai_model"),
    db.getSetting("ai_temperature"),
  ]);
  return {
    enabled: !!baseURL && !!model,
    baseURL: (baseURL ?? "").trim(),
    apiKey: apiKey ?? "",
    model: model ?? "deepseek-chat",
    temperature: temp ? parseFloat(temp) : 0.7,
  };
}

/** 保存 AI 配置到 settings KV */
export async function saveAIConfig(cfg: Partial<AIConfig>): Promise<void> {
  if (cfg.baseURL !== undefined) await db.setSetting("ai_base_url", cfg.baseURL);
  if (cfg.apiKey !== undefined) await db.setSetting("ai_api_key", cfg.apiKey);
  if (cfg.model !== undefined) await db.setSetting("ai_model", cfg.model);
  if (cfg.temperature !== undefined) await db.setSetting("ai_temperature", String(cfg.temperature));
}

/** AI 服务商预设 */
export const AI_PRESETS: { name: string; baseURL: string; apiKey: string; model: string }[] = [
  { name: "DeepSeek", baseURL: "https://api.deepseek.com/v1", apiKey: "", model: "deepseek-chat" },
  { name: "Ollama（本地）", baseURL: "http://localhost:11434/v1", apiKey: "", model: "qwen2.5:7b" },
  { name: "OpenAI", baseURL: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
];

const REQUEST_TIMEOUT_MS = 60_000;

/** 模板占位符替换（ES2020 兼容，替代 String.replaceAll） */
function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split("{" + k + "}").join(v);
  return out;
}

/** 环境自适应 fetch：Tauri 走 plugin-http（无 CORS）；Web 走 window.fetch（受 CORS 限制，需代理） */
const httpFetch = isTauri() ? tauriFetch : (...args: Parameters<typeof fetch>) => fetch(...args);

/** 构建 OpenAI 兼容 chat/completions 请求体 */
function buildBody(messages: ChatMessage[], model: string, temperature: number, stream: boolean) {
  return JSON.stringify({ model, messages, temperature, stream });
}

function buildHeaders(cfg: AIConfig) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;
  return headers;
}

function normalizeBaseURL(url: string): string {
  let u = url.trim().replace(/\/$/, "");
  if (!u.startsWith("http")) u = "https://" + u;
  return u;
}

/**
 * OpenAI 兼容客户端（DeepSeek 云端 / Ollama 本地 / OpenAI，代码零分叉）
 * 经 tauri-plugin-http 发请求（绕过 WebView CORS）。
 */
export class AIClient {
  constructor(private config: AIConfig) {}

  get isReady(): boolean {
    return this.config.enabled && this.config.baseURL.length > 0 && this.config.model.length > 0;
  }

  get model(): string {
    return this.config.model;
  }

  private endpoint(): string {
    return normalizeBaseURL(this.config.baseURL) + "/chat/completions";
  }

  /** 非流式对话，返回完整回复文本 */
  async chat(messages: ChatMessage[], temperature?: number): Promise<string> {
    const res = await httpFetch(this.endpoint(), {
      method: "POST",
      headers: buildHeaders(this.config),
      body: buildBody(messages, this.config.model, temperature ?? this.config.temperature, false),
      connectTimeout: REQUEST_TIMEOUT_MS,
    });
    if (!res.ok) throw new Error("AI 请求失败 (" + res.status + "): " + (await res.text()).slice(0, 300));
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (data.error) throw new Error("AI 返回错误: " + data.error.message);
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI 返回为空");
    return content;
  }

  /**
   * 流式对话（SSE），逐 token 回调 onToken，返回完整文本。
   * 兼容流式（stream:true）与非流式响应（部分服务忽略 stream）。
   */
  async streamChat(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    temperature?: number
  ): Promise<string> {
    const res = await httpFetch(this.endpoint(), {
      method: "POST",
      headers: buildHeaders(this.config),
      body: buildBody(messages, this.config.model, temperature ?? this.config.temperature, true),
      connectTimeout: REQUEST_TIMEOUT_MS,
    });
    if (!res.ok) throw new Error("AI 请求失败 (" + res.status + "): " + (await res.text()).slice(0, 300));

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // 服务端忽略了 stream，走非流式解析
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const full = data.choices?.[0]?.message?.content ?? "";
      onToken(full);
      return full;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("无法读取 AI 流式响应");
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 按行解析 SSE（data: {...} / data: [DONE]）
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const parsed = parseSSELine(line);
          if (parsed.error) throw new Error("AI 流式错误: " + parsed.error);
          if (parsed.token) {
            full += parsed.token;
            onToken(parsed.token);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (!full) throw new Error("AI 流式返回为空");
    return full;
  }

  /** 生成 AI 题目（完形/语境/选择题），返回题目文本与（可选）答案 */
  async generateQuestion(params: AIQuestionParams): Promise<AIQuestionResult | null> {
    if (!this.isReady) return null;
    const template = await getPromptTemplate(params.type);
    const prompt = fillTemplate(template, {
      word: params.front,
      meaning: params.back,
      level: "B2",
      direction: params.direction ?? "看释义选单词",
    });
    const content = await this.chat([
      { role: "system", content: "你是 Reciter 英语学习应用的题目生成器，严格按模板输出。" },
      { role: "user", content: prompt },
    ]);
    return { question: content };
  }

  /** AI 判分：对用户回答给出 1-4 评分与评语 */
  async gradeAnswer(params: { question: string; answer: string; userAnswer: string }): Promise<AIGradeResult> {
    const template = await getPromptTemplate("grading");
    const prompt = fillTemplate(template, {
      question: params.question,
      answer: params.answer,
      userAnswer: params.userAnswer,
    });
    const content = await this.chat([
      { role: "system", content: "你是 Reciter 英语学习应用的评分助手，严格按格式输出。" },
      { role: "user", content: prompt },
    ]);
    return parseGradeResult(content);
  }

  /** 测试连接：发送一条极简请求验证配置 */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const reply = await this.chat([{ role: "user", content: "回复 OK 即可" }], 0);
      return { ok: true, message: "连接成功：" + reply.slice(0, 80) };
    } catch (e) {
      return { ok: false, message: "连接失败：" + String(e).slice(0, 200) };
    }
  }
}

