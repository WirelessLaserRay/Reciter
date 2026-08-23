/** 轻量 TTS：优先 Web Speech API，失败/不可用时回退到 Google TTS 音频 */
export function isTTSAvailable(): boolean {
  return typeof window !== "undefined" && ("speechSynthesis" in window || !!document.createElement("audio"));
}

export function speak(text: string, lang = "en-US"): void {
  if (!text.trim()) return;
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
      return;
    }
  } catch {
    // fall through to audio fallback
  }
  try {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&q=" +
      encodeURIComponent(text.trim()) +
      "&tl=en&client=tw-ob";
    const audio = new Audio(url);
    audio.play().catch(() => {});
  } catch {
    // 静默降级
  }
}
