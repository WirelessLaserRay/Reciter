import { db } from "@/lib/db";

export type TTSSource = "auto" | "system" | "google";

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
  return raw === "system" || raw === "google" ? raw : "auto";
}

export async function saveTTSSource(source: TTSSource): Promise<void> {
  await db.setSetting("tts_source", source);
}

export function isSystemTTSAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

async function playAudio(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.onerror = () => resolve(false);
      audio.onended = () => resolve(true);
      audio.play().then(() => resolve(true)).catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/** 播放读音：优先系统 TTS（移动端可用系统语音），否则 Google → Youdao 音频兜底 */
export async function speak(text: string, lang = "en-US"): Promise<void> {
  if (!text.trim()) return;
  const source = await getTTSSource();
  const useSystem = (source === "system" || source === "auto") && isSystemTTSAvailable();
  if (useSystem) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
      return;
    } catch {
      // fall through to audio
    }
  }
  if (await playAudio(googleTTSURL(text))) return;
  await playAudio(youdaoTTSURL(text));
}

/** 预加载读音：若最终会走系统 TTS 则跳过；否则预加载 Google 音频 */
export async function preloadSpeech(text: string): Promise<void> {
  if (!text.trim()) return;
  const source = await getTTSSource();
  if ((source === "system" || source === "auto") && isSystemTTSAvailable()) return;
  try {
    const audio = new Audio(googleTTSURL(text));
    audio.preload = "auto";
    audio.load();
  } catch {
    // 静默降级
  }
}
