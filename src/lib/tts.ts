import { db } from "@/lib/db";

export type TTSSource = "auto" | "system" | "google" | "youdao";

// 缓存的音源配置，用于确保 speak 的同步执行
let cachedTtsSource: TTSSource = "auto";

// 初始化时拉取一次并监听更改（也可由外部在修改设置时同步更新）
db.getSetting("tts_source")
  .then((raw) => {
    cachedTtsSource = (raw === "system" || raw === "google" || raw === "youdao" ? raw : "auto") as TTSSource;
  })
  .catch(() => {});

export function googleTTSURL(text: string): string {
  return (
    "https://translate.google.com/translate_tts?ie=UTF-8&q=" +
    encodeURIComponent(text.trim()) +
    "&tl=en&client=tw-ob"
  );
}

/** Youdao TTS 备用源（国内可访问性更好） */
export function youdaoTTSURL(text: string): string {
  return (
    "https://dict.youdao.com/dictvoice?audio=" +
    encodeURIComponent(text.trim()) +
    "&type=2"
  );
}

export async function getTTSSource(): Promise<TTSSource> {
  const raw = await db.getSetting("tts_source");
  cachedTtsSource = (raw === "system" || raw === "google" || raw === "youdao" ? raw : "auto") as TTSSource;
  return cachedTtsSource;
}

export async function saveTTSSource(source: TTSSource): Promise<void> {
  cachedTtsSource = source;
  await db.setSetting("tts_source", source);
}

export function isSystemTTSAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSentenceText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 30 || trimmed.split(/\s+/).length > 3;
}

// ⚠️ 全局单例 Audio，避免每次 new Audio 丢失用户手势授权
const globalAudio = typeof window !== "undefined" ? new Audio() : null;

// 全局递增请求序号，用于排查并发与废弃过期请求回调
let activeTtsRequestId = 0;

/** 停止所有正在发音的通道（系统合成与网页音频） */
export function stopAudio(): void {
  activeTtsRequestId++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // 忽略
    }
  }
  if (globalAudio) {
    try {
      globalAudio.pause();
      globalAudio.currentTime = 0;
      globalAudio.onended = null;
      globalAudio.onerror = null;
      globalAudio.removeAttribute("src");
    } catch {
      // 忽略
    }
  }
}

function speakWithSystem(text: string, lang = "en-US", reqId?: number): boolean {
  if (!isSystemTTSAvailable()) return false;
  if (reqId !== undefined && reqId !== activeTtsRequestId) return false;

  try {
    // 严格互斥：停止任何可能残留的在线音频
    if (globalAudio) {
      try {
        globalAudio.pause();
        globalAudio.currentTime = 0;
        globalAudio.onended = null;
        globalAudio.onerror = null;
        globalAudio.removeAttribute("src");
      } catch {
        // 忽略
      }
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/**
 * 播放读音：必须同步执行（不能有 await 阻塞前置逻辑），以避免移动端浏览器拦截 Autoplay。
 * - 针对例句（长文本）：有道 dictvoice 仅支持词条预录音（句子必报 500），谷歌超过 100 字符报 400；例句优先使用系统原生语音合成。
 * - 针对单词：按配置源发音，若网络音频失败，自动触发备用源，并最终回退至系统 TTS 兜底。
 * - 具备绝对互斥与请求锁：彻底杜绝系统 TTS 与在线 TTS 重叠发声的竞态 Bug。
 */
export function speak(text: string, lang = "en-US"): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return Promise.resolve();

  // 递增当前请求令牌
  const reqId = ++activeTtsRequestId;

  // 每次触发新朗读时，先全面停止上一轮未结束的任何朗读
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (globalAudio) {
    try {
      globalAudio.pause();
      globalAudio.currentTime = 0;
      globalAudio.onended = null;
      globalAudio.onerror = null;
      globalAudio.removeAttribute("src");
    } catch {}
  }

  const source = cachedTtsSource;
  const isSentence = isSentenceText(trimmed);

  // 1. 系统原生 TTS 优先场景：
  // - 用户显式指定 system
  // - 处于 auto 自动模式
  // - 朗读例句长句，且系统 TTS 可用（有道 dictvoice 不支持句子，谷歌超过 100 字符报 400）
  const preferSystem =
    source === "system" ||
    source === "auto" ||
    (isSentence && isSystemTTSAvailable() && (source === "youdao" || trimmed.length > 100));

  if (preferSystem && speakWithSystem(trimmed, lang, reqId)) {
    return Promise.resolve();
  }

  // 2. 网页 Audio 发音
  return new Promise((resolve) => {
    if (!globalAudio) {
      if (speakWithSystem(trimmed, lang, reqId)) return resolve();
      return resolve();
    }

    // 构建主用与备用 URL（长句不把有道作为备用，避免返回 500 报废）
    let primaryUrl: string;
    let fallbackUrl: string | null = null;

    if (source === "google") {
      primaryUrl = googleTTSURL(trimmed);
      if (!isSentence) fallbackUrl = youdaoTTSURL(trimmed);
    } else {
      primaryUrl = isSentence ? googleTTSURL(trimmed) : youdaoTTSURL(trimmed);
      if (!isSentence) fallbackUrl = googleTTSURL(trimmed);
    }

    let hasHandledFallback = false;
    const playFallbackOrSystem = () => {
      if (hasHandledFallback) return;
      hasHandledFallback = true;
      if (reqId !== activeTtsRequestId) {
        return resolve();
      }

      if (fallbackUrl) {
        globalAudio.src = fallbackUrl;
        globalAudio.onended = () => {
          if (reqId === activeTtsRequestId) resolve();
        };
        globalAudio.onerror = () => {
          if (reqId === activeTtsRequestId) {
            speakWithSystem(trimmed, lang, reqId);
          }
          resolve();
        };
        globalAudio
          .play()
          .then(() => resolve())
          .catch((err) => {
            if (reqId !== activeTtsRequestId) return resolve();
            // 忽略被中止或未授权请求，决不误触发降级系统发音
            if (err?.name === "AbortError" || err?.name === "NotAllowedError") {
              return resolve();
            }
            speakWithSystem(trimmed, lang, reqId);
            resolve();
          });
      } else {
        speakWithSystem(trimmed, lang, reqId);
        resolve();
      }
    };

    globalAudio.src = primaryUrl;
    globalAudio.onended = () => {
      if (reqId === activeTtsRequestId) resolve();
    };

    globalAudio.onerror = () => {
      if (reqId === activeTtsRequestId) {
        playFallbackOrSystem();
      } else {
        resolve();
      }
    };

    // ⚠️ 必须在同步调用栈内 play
    globalAudio
      .play()
      .then(() => resolve())
      .catch((err) => {
        if (reqId !== activeTtsRequestId) {
          return resolve();
        }
        // 如果是因为 AbortError（被新请求打断）或 NotAllowedError（手势被拦截），决不触发降级系统 TTS
        if (err?.name === "AbortError" || err?.name === "NotAllowedError") {
          return resolve();
        }
        playFallbackOrSystem();
      });
  });
}

/** 预加载读音：仅对全局 Audio 对象发起低开销预加载（长句不进行预加载） */
export async function preloadSpeech(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || isSentenceText(trimmed)) return;
  const source = cachedTtsSource;
  if ((source === "system" || source === "auto") && isSystemTTSAvailable()) return;

  try {
    const tempAudio = new Audio(source === "google" ? googleTTSURL(trimmed) : youdaoTTSURL(trimmed));
    tempAudio.preload = "auto";
    tempAudio.load();
  } catch {
    // 静默降级
  }
}
