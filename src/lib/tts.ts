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

export function isSentenceText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 30 || trimmed.split(/\s+/).length > 3;
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
    // 排除括号内部的斜杠（如 "organi(s/z)e"）
    const matchSlashOutside = text.match(/^([^/()（）[\]【】]+)\s*\/\s*.+$/);
    if (matchSlashOutside && matchSlashOutside[1]) {
      text = matchSlashOutside[1].trim();
    }
  }

  // 1. 处理括号内含 / 或 | 的形近变体字母，如 organi(s/z)e -> organise, colo(u|r) -> colour
  text = text.replace(/[(（[【]([a-zA-Z]+)[/|][a-zA-Z]+[)）\]】]/g, "$1");

  // 2. 识别并剥离无须发音的注释性括号内容（中文、词性标注、占位符），保留单词内拼写字母：
  const POS_REGEX = /^(?:vt\.?&vi|vi\.?&vt|vt|vi|v|n|adj|adv|pron|conj|prep|num|int|art|aux|abbr|phr|part|pl|sing|c|u|bre|ame|modal)\.?$/i;
  const PLACEHOLDER_REGEX = /^(?:sb|sth|somebody|something|one's|oneself)\.?$/i;

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

// 全局单例 Audio，避免每次 new Audio 丢失用户手势授权
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
  const cleaned = cleanTextForTTS(text);
  const trimmed = cleaned.trim();
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

    // 必须在同步调用栈内 play
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
  const cleaned = cleanTextForTTS(text);
  const trimmed = cleaned.trim();
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
