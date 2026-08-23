# HarmonyOS 上 TTS 网页无法播放的原因及修复方案

在 HarmonyOS（特别是原生浏览器的 ArkWeb）以及 iOS Safari 等严格的移动端浏览器中，你目前遇到的 TTS 发音无声问题，主要由以下几个原因叠加导致：

## 1. 核心原因：移动端严格的 Autoplay（自动播放）限制
移动端浏览器有一个硬性规定：**任何音频的播放 (`audio.play()`) 或是语音合成 (`speechSynthesis.speak()`)，必须在用户真实交互（如 `click` 或 `touchstart`）的**同步调用栈**内执行。**

看一下原先 `tts.ts` 里的 `speak` 函数逻辑：
```typescript
export async function speak(text: string, lang = "en-US"): Promise<void> {
  if (!text.trim()) return;
  const source = await getTTSSource(); // ⚠️ 致命点：这里用了 await
  // ...
  if (await playAudio(googleTTSURL(text))) return;
}
```
因为 `await db.getSetting("tts_source")` 是异步的，当它解析完毕继续往下执行时，浏览器已经认为这脱离了用户的"点击"上下文。接着执行的 `audio.play()` 就会因为“非用户主动触发”而被浏览器强行拦截，抛出 `NotAllowedError`。

## 2. 每次 new Audio() 无法继承解锁状态
原代码中 `playAudio` 每次都会创建一个全新的 `new Audio(url)`。在移动端，即使你通过点击解锁了某个 Audio 实例，新创建的 Audio 实例如果没有在点击的同步流里调用 play()，仍然会被拦截。必须使用**全局单例（Singleton）**的 Audio 对象。

## 3. 网络连通性与降级过慢
原逻辑是 `Google TTS -> 如果失败 -> Youdao TTS`。
对于国内的 HarmonyOS 手机，Google 服务（`translate.google.com`）是连不上的。由于原先的 `playAudio` 试图等待 Google 超时（或者被浏览器拦截），整个过程既耗时又因为异步完全丢失了播放权限，最终兜底的 Youdao 也无法发声。

---

## 修复方案：重构 `tts.ts`

针对以上痛点，我对 `src/lib/tts.ts` 进行了重构设计，主要改动：
1. **同步读取配置**：在初始化时缓存 `tts_source`，让 `speak` 函数不再使用 `await db`。
2. **全局单例 Audio**：只创建一个 `globalAudio` 实例反复复用。
3. **同步调用 play()**：在函数最开始没有任何 await 的情况下立刻调用 `play()` 或 `speak()`，确保 100% 携带用户的交互授权。

下面是修复后的 `src/lib/tts.ts` 完整代码，点击 **Proceed** 即可直接将其写入你的项目。

```typescript
import { db } from "@/lib/db";

export type TTSSource = "auto" | "system" | "google";

// 缓存的音源配置，用于确保 speak 的同步执行
let cachedTtsSource: TTSSource = "auto";

// 初始化时拉取一次并监听更改（也可由外部在修改设置时同步更新）
db.getSetting("tts_source").then((raw) => {
  cachedTtsSource = (raw === "system" || raw === "google" ? raw : "auto") as TTSSource;
}).catch(() => {});

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
  cachedTtsSource = (raw === "system" || raw === "google" ? raw : "auto") as TTSSource;
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
      // 如果不是强制 system，系统可能没加载声音，这里无法立刻捕获，所以系统模式就不混用在线 Audio 了
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
        if (err.name !== 'NotAllowedError') {
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
    }
  } catch {
    // 静默降级
  }
}
```
