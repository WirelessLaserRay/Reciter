import { db } from "@/lib/db";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";

export type TTSSource = "auto" | "system" | "google" | "youdao";

export const TTS_SOURCE_KEY = "reciter-tts-source";
export const TTS_FALLBACK_KEY = "reciter-tts-fallback-enabled";

function getStoredSource(): TTSSource {
  if (typeof window !== "undefined") {
    try {
      const v = localStorage.getItem(TTS_SOURCE_KEY);
      if (v === "system" || v === "google" || v === "youdao" || v === "auto") {
        return v as TTSSource;
      }
    } catch {}
  }
  return "auto";
}

function getStoredFallback(): boolean {
  if (typeof window !== "undefined") {
    try {
      const v = localStorage.getItem(TTS_FALLBACK_KEY);
      if (v !== null) return v === "1" || v === "true";
    } catch {}
  }
  // 默认关闭强行回退系统音，尊重用户音源选择；auto 模式下内部始终支持智能回退
  return false;
}

// 同步内存缓存，保证 speak 零延迟同步执行（初始化时从 localStorage 优先同步读取）
let cachedTtsSource: TTSSource = getStoredSource();
let cachedTtsFallback: boolean = getStoredFallback();

/** 数据库就绪后异步同步最新设置（由 App.tsx 在 db.init() 成功后调用） */
export async function initTTSSettings(): Promise<void> {
  try {
    const [rawSource, rawFallback] = await Promise.all([
      db.getSetting("tts_source"),
      db.getSetting("tts_fallback_enabled"),
    ]);

    if (rawSource === "system" || rawSource === "google" || rawSource === "youdao" || rawSource === "auto") {
      cachedTtsSource = rawSource as TTSSource;
      if (typeof window !== "undefined") {
        localStorage.setItem(TTS_SOURCE_KEY, rawSource);
      }
    } else if (cachedTtsSource !== "auto") {
      // 数据库无记录时将 localStorage 的已配置项写回
      await db.setSetting("tts_source", cachedTtsSource);
    }

    if (rawFallback !== null) {
      cachedTtsFallback = rawFallback === "1" || rawFallback === "true";
      if (typeof window !== "undefined") {
        localStorage.setItem(TTS_FALLBACK_KEY, cachedTtsFallback ? "1" : "0");
      }
    }
  } catch (e) {
    console.warn("initTTSSettings sync failed:", e);
  }
}

export function isSentenceText(text: string): boolean {
  const trimmed = text.trim();
  // 长度超过 80 字符，或包含句号/问号/感叹号的完整句子，或单词数超过 10 的长文本才视为句子
  if (trimmed.length > 80) return true;
  if (/[.!?]$/.test(trimmed) && trimmed.split(/\s+/).length > 3) return true;
  return trimmed.split(/\s+/).length > 10;
}

/**
 * 规范化朗读文本（专为发音优化，忽略括号读完整单词）：
 * 1. 自动忽略卡片中包含单词组成部分的括号（如 "recov(er)" -> "recover"、"theat(re)" -> "theatre"、"(in)dependent" -> "independent"），拼接为完整单词朗读
 * 2. 括号内若含有斜杠变体（如 "organi(s/z)e"），优先提取首个有效拼写（"organise"）
 * 3. 剔除卡片中纯词性标注（如 "(n.)"、"(adj.)"、"[v.]"）、中文释义（如 "(动词)"、"（飞机起飞）"）及占位符（如 "(sb.)"）
 * 4. 若为带斜杠的多变体词（如 "theatre / theater"），仅取首个变体发音，避免 TTS 读出 "slash" 噪音
 * 5. 保留完整连贯语流，清理多余标点与空白
 */
export function cleanTextForTTS(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();

  // 若不是完整句子，且包含独立的斜杠变体（如 "theatre / theater" 或 "programme/program"），取首个变体
  if (!isSentenceText(text) && text.includes("/")) {
    const matchSlashOutside = text.match(/^([^/()（）[\]【】]+)\s*\/\s*.+$/);
    if (matchSlashOutside && matchSlashOutside[1]) {
      text = matchSlashOutside[1].trim();
    }
  }

  // 1. 处理括号内含 / 或 | 的形近变体字母，如 organi(s/z)e -> organise, colo(u|r) -> colour
  text = text.replace(/[(（[【]([a-zA-Z]+)[/|][a-zA-Z]+[)）\]】]/g, "$1");

  // 2. 识别并剥离无须发音的注释性括号内容（中文、词性标注、占位符），保留单词内拼写字母：
  const POS_REGEX = /^(?:vt\.?&vi|vi\.?&vt|vt|vi|v|n|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part|pl|sing|c|u|bre|ame|modal)\.?$/i;
  const PLACEHOLDER_ITEM = "(?:sb|sth|somebody|something|one's|oneself)\\.?";
  const PLACEHOLDER_REGEX = new RegExp(`^(?:(?:doing|having)\\s+)?(?:${PLACEHOLDER_ITEM}(?:\\s*[/|]\\s*${PLACEHOLDER_ITEM})?)$`, "i");

  text = text.replace(/(\s*)[(（[【]([^()（）[\]【】]*)[)）\]】]/g, (match, prefixSpace: string, inner: string, offset: number, fullStr: string) => {
    const trimmedInner = inner.trim();
    // 含有中文解释 -> 注释，直接移除
    if (/[\u4e00-\u9fff]/.test(trimmedInner)) return "";

    // 检查是否紧贴字母（单词内部嵌入式括号，如 "colo(u)r"、"recov(er)"、"travel(l)er"、"(in)dependent"）
    const charBeforeParen = prefixSpace.length > 0 ? " " : (offset > 0 ? fullStr[offset - 1] : "");
    const charAfterParen = offset + match.length < fullStr.length ? fullStr[offset + match.length] : "";
    const isEmbeddedInWord = /[a-zA-Z]/.test(charBeforeParen) || /[a-zA-Z]/.test(charAfterParen);

    // 如果前后紧贴字母，且内部纯为英文字母，必定是完整单词的拼写部分，保留拼写字母
    if (isEmbeddedInWord && /^[a-zA-Z]+$/.test(trimmedInner)) {
      return trimmedInner;
    }

    // 含有词性缩写标签或短语占位符 -> 语法注释，直接移除
    if (
      POS_REGEX.test(trimmedInner) ||
      PLACEHOLDER_REGEX.test(trimmedInner) ||
      /\b(?:vt|vi|v|n|adj|adv|prep|conj|pron)\./i.test(trimmedInner)
    ) {
      return "";
    }

    // 其它情况（如独立的 "(down)"、"(to)" 等）：保留其内容，保留原有空格
    return prefixSpace ? " " + trimmedInner : trimmedInner;
  });

  // 3. 剥离残留的孤立括号字符
  text = text.replace(/[()（）[\]【】{}]/g, "");

  // 4. 清理多余空格
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

export function googleTTSURL(text: string): string {
  const clean = cleanTextForTTS(text);
  return (
    "https://translate.google.com/translate_tts?ie=UTF-8&q=" +
    encodeURIComponent(clean.trim()) +
    "&tl=en&client=tw-ob"
  );
}

/** Youdao TTS 备用源（国内可访问性更好） */
export function youdaoTTSURL(text: string): string {
  const clean = cleanTextForTTS(text);
  return (
    "https://dict.youdao.com/dictvoice?audio=" +
    encodeURIComponent(clean.trim()) +
    "&type=2"
  );
}

export async function getTTSSource(): Promise<TTSSource> {
  const raw = await db.getSetting("tts_source");
  if (raw === "system" || raw === "google" || raw === "youdao" || raw === "auto") {
    cachedTtsSource = raw as TTSSource;
    if (typeof window !== "undefined") {
      localStorage.setItem(TTS_SOURCE_KEY, raw);
    }
  }
  return cachedTtsSource;
}

export async function saveTTSSource(source: TTSSource): Promise<void> {
  cachedTtsSource = source;
  if (typeof window !== "undefined") {
    localStorage.setItem(TTS_SOURCE_KEY, source);
  }
  await db.setSetting("tts_source", source);
}

export async function getTTSFallbackEnabled(): Promise<boolean> {
  const raw = await db.getSetting("tts_fallback_enabled");
  if (raw !== null) {
    cachedTtsFallback = raw === "1" || raw === "true";
    if (typeof window !== "undefined") {
      localStorage.setItem(TTS_FALLBACK_KEY, cachedTtsFallback ? "1" : "0");
    }
  }
  return cachedTtsFallback;
}

export async function saveTTSFallbackEnabled(enabled: boolean): Promise<void> {
  cachedTtsFallback = enabled;
  if (typeof window !== "undefined") {
    localStorage.setItem(TTS_FALLBACK_KEY, enabled ? "1" : "0");
  }
  await db.setSetting("tts_fallback_enabled", enabled ? "1" : "0");
}

export function isSystemTTSAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// 全局单例 Audio，避免每次 new Audio 丢失用户手势授权
const globalAudio = typeof window !== "undefined" ? new Audio() : null;
if (globalAudio) {
  try {
    (globalAudio as unknown as { referrerPolicy?: string }).referrerPolicy = "no-referrer";
  } catch {}
}

// 内存音频 Blob 缓存（针对 Google TTS 在桌面端的跨域/Referer 拦截与秒开预加载）
const audioBlobCache = new Map<string, string>();
const MAX_AUDIO_CACHE = 100;

export async function fetchAudioBlobUrl(url: string, timeoutMs = 8000): Promise<string> {
  const cached = audioBlobCache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const isGoogle = url.includes("translate.google.com");
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    if (isGoogle) {
      headers["Referer"] = "https://translate.google.com/";
    }
    const res = await (isTauri() ? tauriFetch : fetch)(url, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) {
      throw new Error(`TTS audio fetch status ${res.status}`);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    if (audioBlobCache.size >= MAX_AUDIO_CACHE) {
      const firstKey = audioBlobCache.keys().next().value;
      if (firstKey) {
        const oldUrl = audioBlobCache.get(firstKey);
        if (oldUrl && oldUrl.startsWith("blob:")) {
          URL.revokeObjectURL(oldUrl);
        }
        audioBlobCache.delete(firstKey);
      }
    }
    audioBlobCache.set(url, blobUrl);
    return blobUrl;
  } finally {
    clearTimeout(timer);
  }
}

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
 * 将长句或段落按照自然标点及长度限制进行切分（适配 Google TTS ~180 字符单次请求上限）
 */
export function splitTextForTTS(text: string, maxLen = 160): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const chunks: string[] = [];
  // 按照标点符号优先切分（逗号、句号、分号、问号、感叹号、换行）
  const parts = trimmed.match(/[^,.;:!?\n]+[,.;:!?\n]*|\S+/g) || [trimmed];
  let cur = "";

  for (const part of parts) {
    const candidate = cur ? cur + " " + part.trim() : part.trim();
    if (candidate.length <= maxLen) {
      cur = candidate;
    } else {
      if (cur) chunks.push(cur);
      // 如果单部分本身超长（如无标点的长句），按词切分
      if (part.trim().length > maxLen) {
        const words = part.trim().split(/\s+/);
        let sub = "";
        for (const w of words) {
          const subCandidate = sub ? sub + " " + w : w;
          if (subCandidate.length <= maxLen) {
            sub = subCandidate;
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        cur = sub;
      } else {
        cur = part.trim();
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length > 0 ? chunks : [trimmed];
}

/** 依次播放音频 URL 队列（支持分句连续朗读与中断保护） */
function playAudioUrlList(
  urls: string[],
  reqId: number,
  onFinished: () => void,
  onError: () => void
): void {
  if (urls.length === 0 || !globalAudio) {
    onFinished();
    return;
  }

  let index = 0;
  const playNext = async () => {
    if (reqId !== activeTtsRequestId) {
      onFinished();
      return;
    }
    if (index >= urls.length) {
      onFinished();
      return;
    }

    const currentUrl = urls[index++];
    let src = currentUrl;
    if (isTauri() && currentUrl.includes("translate.google.com")) {
      try {
        src = await fetchAudioBlobUrl(currentUrl);
      } catch {
        if (reqId === activeTtsRequestId) {
          onError();
        } else {
          onFinished();
        }
        return;
      }
    }

    if (reqId !== activeTtsRequestId) {
      onFinished();
      return;
    }

    globalAudio.src = src;
    globalAudio.onended = () => {
      if (reqId === activeTtsRequestId) {
        void playNext();
      } else {
        onFinished();
      }
    };
    globalAudio.onerror = () => {
      if (reqId === activeTtsRequestId) {
        onError();
      } else {
        onFinished();
      }
    };
    globalAudio.play().catch((err) => {
      if (reqId !== activeTtsRequestId) {
        onFinished();
        return;
      }
      if (err?.name === "AbortError" || err?.name === "NotAllowedError") {
        onFinished();
        return;
      }
      onError();
    });
  };

  void playNext();
}

/**
 * 播放读音：必须同步执行（不能有 await 阻塞前置逻辑），以避免移动端浏览器拦截 Autoplay。
 * - 用户若选择“固定音源”（有道/谷歌/系统），严格执行用户选择并按配置拒绝回退至系统机械音。
 * - 用户若选择“智能优选 (auto)”，优先在线真人发音，异常时无感回退系统语音兜底。
 * - 具备绝对互斥与请求锁：彻底杜绝系统 TTS 与在线 TTS 重叠发声的竞态 Bug。
 * - 例句发音特化：Google TTS 支持长句智能切分连续朗读；有道公开接口因仅为单词库，例句由 Google TTS 或系统语音承接。
 */
export function speak(text: string, lang = "en-US"): Promise<void> {
  const cleaned = cleanTextForTTS(text);
  const trimmed = cleaned.trim();
  if (!trimmed) return Promise.resolve();

  // 停止上一轮朗读（取消既有播放并使过往请求失效）
  stopAudio();

  // 递增当前请求令牌
  const reqId = ++activeTtsRequestId;

  const source = cachedTtsSource;
  // 是否允许回退：智能优选 (auto) 始终允许回退；固定源依据用户设置（默认拒绝回退）
  const allowFallback = source === "auto" || cachedTtsFallback;

  // 1. 用户显式指定仅使用系统发音
  if (source === "system") {
    speakWithSystem(trimmed, lang, reqId);
    return Promise.resolve();
  }

  // 2. 网页在线发音源 (youdao / google / auto)
  return new Promise((resolve) => {
    if (!globalAudio) {
      if (allowFallback) {
        speakWithSystem(trimmed, lang, reqId);
      }
      return resolve();
    }

    const isSentence = isSentenceText(trimmed);

    // 决定主用发音 URL 与备用 URL
    let primaryUrls: string[];
    let fallbackUrls: string[] | null = null;

    if (source === "google") {
      primaryUrls = splitTextForTTS(trimmed).map((c) => googleTTSURL(c));
      // 仅当非句子且允许回退时，才设置有道备用源（有道不支持句子）
      if (allowFallback && !isSentence) {
        fallbackUrls = [youdaoTTSURL(trimmed)];
      }
    } else if (source === "youdao") {
      if (isSentence) {
        // 有道公开接口为单词词典库，对任意例句/句子返回 500。
        // 例句自动路由至 Google TTS 在线朗读（支持长句切分），若网络不可用则兜底系统语音
        primaryUrls = splitTextForTTS(trimmed).map((c) => googleTTSURL(c));
        fallbackUrls = null;
      } else {
        primaryUrls = [youdaoTTSURL(trimmed)];
        if (allowFallback) {
          fallbackUrls = [googleTTSURL(trimmed)];
        }
      }
    } else {
      // auto 智能优选模式：单词走有道极速，句子走谷歌；两者皆失败时回退系统
      if (isSentence) {
        primaryUrls = splitTextForTTS(trimmed).map((c) => googleTTSURL(c));
        fallbackUrls = null;
      } else {
        primaryUrls = [youdaoTTSURL(trimmed)];
        fallbackUrls = [googleTTSURL(trimmed)];
      }
    }

    let hasHandledFallback = false;
    const playFallbackOrSystem = () => {
      if (hasHandledFallback) return;
      hasHandledFallback = true;
      if (reqId !== activeTtsRequestId) return resolve();

      // 如果备用源存在（例如单词发音的有道失败后回退谷歌）：
      if (fallbackUrls && fallbackUrls.length > 0) {
        playAudioUrlList(
          fallbackUrls,
          reqId,
          () => resolve(),
          () => {
            if (reqId === activeTtsRequestId && (allowFallback || isSentence)) {
              speakWithSystem(trimmed, lang, reqId);
            }
            resolve();
          }
        );
        return;
      }

      // 例句模式下，或者用户开启了回退开关：
      // （对于例句，因有道本身无发音能力，Google 若受网络限制无法连接，自动调用系统语音发音，确保例句可听）
      if (allowFallback || isSentence) {
        speakWithSystem(trimmed, lang, reqId);
      }
      resolve();
    };

    playAudioUrlList(
      primaryUrls,
      reqId,
      () => resolve(),
      () => {
        playFallbackOrSystem();
      }
    );
  });
}

/** 预加载读音：仅对全局 Audio 对象发起低开销预加载（长句不进行预加载） */
export async function preloadSpeech(text: string): Promise<void> {
  const cleaned = cleanTextForTTS(text);
  const trimmed = cleaned.trim();
  if (!trimmed || isSentenceText(trimmed)) return;
  const source = cachedTtsSource;
  if (source === "system") return;

  try {
    let url: string;
    if (source === "google") {
      url = googleTTSURL(trimmed);
    } else {
      url = youdaoTTSURL(trimmed);
    }
    if (isTauri() && url.includes("translate.google.com")) {
      await fetchAudioBlobUrl(url);
    } else if (typeof window !== "undefined") {
      const tempAudio = new Audio(url);
      try {
        (tempAudio as unknown as { referrerPolicy?: string }).referrerPolicy = "no-referrer";
      } catch {}
      tempAudio.preload = "auto";
      tempAudio.load();
    }
  } catch {
    // 静默降级
  }
}
