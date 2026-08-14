import { db } from "@/lib/db";

export interface AIConfig {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
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
    baseURL: baseURL ?? "",
    apiKey: apiKey ?? "",
    model: model ?? "deepseek-chat",
    temperature: temp ? parseFloat(temp) : 0.7,
  };
}

export interface AIQuestionParams {
  front: string;
  back: string;
  type: "cloze" | "context" | "choice";
}

/**
 * OpenAI 兼容客户端（DeepSeek 云端 / Ollama 本地双通道，Phase 4 实现真实调用）。
 * 测试模式通过本接口让 AI 参与题目设置：
 *  - 当前（Phase 3）未接入时返回 null，测试模式用本地出题兜底；
 *  - Phase 4 填充 generateQuestion 后，可生成语境完形/干扰项/例句等。
 */
export class AIClient {
  constructor(private config: AIConfig) {}

  get isReady(): boolean {
    return this.config.enabled && this.config.baseURL.length > 0 && this.config.model.length > 0;
  }

  get model(): string {
    return this.config.model;
  }

  /**
   * 为给定单词生成一道 AI 题目（预留接口）
   * TODO(Phase 4): 调用 {baseURL}/chat/completions（SSE 流式），
   * prompt 示例：
   *   "用单词 {front}（释义：{back}）生成一道适合 B2 学习者的{type}题，含选项与解析"
   */
  async generateQuestion(_params: AIQuestionParams): Promise<string | null> {
    if (!this.isReady) return null;
    // Phase 4 实现
    return null;
  }
}
