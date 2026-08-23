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

// ⚠️ 全局单例 Audio，避免每次 new Audio 丢失用户手势授权
const globalAudio = typeof window !== "undefined" ? new Audio() : null;

/**
 * 播放读音：必须同步执行（不能有 await 阻塞前置逻辑），以避免移动端浏览器拦截 Autoplay。
 * 优先系统 TTS，否则使用网络 TTS (国内首选 Youdao 以避免 Google 超时)。
 */
export function speak(text: string, lang = "en-US"): Promise<void> {
  if (!text.trim()) return Promise.resolve();

  const source = cachedTtsSource;
  const useSystem = (source === "system" || source === "auto") && isSystemTTSAvailable();

  // 1. 系统 TTS (如果是系统优先)
  if (useSystem) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
      return Promise.resolve();
    } catch {
      // 抛错时 fallback 到 Audio
    }
  }

  // 2. 网页 Audio 发音
  return new Promise((resolve) => {
    if (!globalAudio) return resolve();

    // 如果指定了 google 则走 google，否则 auto 模式下直接走有道（国内不超时）
    const primaryUrl = source === "google" ? googleTTSURL(text) : youdaoTTSURL(text);
    const fallbackUrl = source === "google" ? youdaoTTSURL(text) : googleTTSURL(text);

    globalAudio.src = primaryUrl;
    globalAudio.onended = () => resolve();

    globalAudio.onerror = () => {
      // 降级使用备用 URL
      globalAudio.src = fallbackUrl;
      globalAudio.play().then(() => resolve()).catch(() => resolve());
    };

    // ⚠️ 必须在同步调用栈内 play
    globalAudio.play()
      .then(() => resolve())
      .catch((err) => {
        // 如果是因为 NotAllowedError (手势被拦截)，降级也没用
        if (err.name !== "NotAllowedError") {
          globalAudio.src = fallbackUrl;
          globalAudio.play().then(() => resolve()).catch(() => resolve());
        } else {
          resolve();
        }
      });
  });
}

/** 预加载读音：仅对全局 Audio 对象发起低开销预加载 */
export async function preloadSpeech(text: string): Promise<void> {
  if (!text.trim()) return;
  const source = cachedTtsSource;
  if ((source === "system" || source === "auto") && isSystemTTSAvailable()) return;

  try {
    if (globalAudio) {
      // 不影响正在播放的声音的情况下，静默 preload
      const tempAudio = new Audio(source === "google" ? googleTTSURL(text) : youdaoTTSURL(text));
      tempAudio.preload = "auto";
      tempAudio.load();
    }
  } catch {
    // 静默降级
  }
}
