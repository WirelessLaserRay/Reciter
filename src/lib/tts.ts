import { db } from "@/lib/db";

export type TTSSource = "auto" | "system" | "google";

export function googleTTSURL(text: string): string {
  return (
    "https://translate.google.com/translate_tts?ie=UTF-8&q=" +
    encodeURIComponent(text.trim()) +
    "&tl=en&client=tw-ob"
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

/** 播放读音：按设置选择系统 TTS 或 Google TTS；auto 优先系统 */
export async function speak(text: string, lang = "en-US"): Promise<void> {
  if (!text.trim()) return;
  const source = await getTTSSource();
  const useSystem = source === "system" || (source === "auto" && isSystemTTSAvailable());
  if (useSystem) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
      return;
    } catch {
      // fall through to google
    }
  }
  try {
    const audio = new Audio(googleTTSURL(text));
    audio.play().catch(() => {});
  } catch {
    // 静默降级
  }
}

/** 预加载读音：若最终会走 Google TTS，则提前加载音频 */
export async function preloadSpeech(text: string): Promise<void> {
  if (!text.trim()) return;
  const source = await getTTSSource();
  if (source === "system") return;
  if (source === "auto" && isSystemTTSAvailable()) return;
  try {
    const audio = new Audio(googleTTSURL(text));
    audio.preload = "auto";
    audio.load();
  } catch {
    // 静默降级
  }
}
