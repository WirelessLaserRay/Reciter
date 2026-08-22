/** 轻量 TTS：优先 Web Speech API；无 TTS 时静默降级 */
export function isTTSAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang = "en-US"): void {
  if (!isTTSAvailable() || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  } catch {
    // 静默降级
  }
}
