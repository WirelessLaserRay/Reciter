import { describe, it, expect, vi, beforeEach } from "vitest";

// 模拟 @/lib/db
vi.mock("@/lib/db", () => {
  const store = new Map<string, string>();
  return {
    db: {
      getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
      setSetting: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
      }),
      _reset: () => store.clear(),
    },
  };
});

// Polyfill localStorage and window for Node test environment
const storageMap = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storageMap.set(k, String(v));
  },
  removeItem: (k: string) => {
    storageMap.delete(k);
  },
  clear: () => {
    storageMap.clear();
  },
};
// @ts-expect-error mock localStorage
globalThis.localStorage = fakeLocalStorage;
// @ts-expect-error mock window
globalThis.window = globalThis;
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-audio");
  globalThis.URL.revokeObjectURL = vi.fn();
}

import {
  cleanTextForTTS,
  isSentenceText,
  googleTTSURL,
  youdaoTTSURL,
  getTTSSource,
  saveTTSSource,
  getTTSFallbackEnabled,
  saveTTSFallbackEnabled,
  initTTSSettings,
  fetchAudioBlobUrl,
  splitTextForTTS,
  TTS_SOURCE_KEY,
  TTS_FALLBACK_KEY,
} from "@/lib/tts";
import { db } from "@/lib/db";

describe("tts.ts - 语音发音与文本清洗引擎", () => {
  beforeEach(() => {
    localStorage.clear();
    (db as unknown as { _reset: () => void })._reset();
    vi.clearAllMocks();
  });

  describe("isSentenceText 句子与短语判定", () => {
    it("单个单词不是句子", () => {
      expect(isSentenceText("apple")).toBe(false);
      expect(isSentenceText("consequence")).toBe(false);
    });

    it("常见词组短语不是句子（词数<=10 且无句尾标点）", () => {
      expect(isSentenceText("look forward to doing")).toBe(false);
      expect(isSentenceText("take care of")).toBe(false);
      expect(isSentenceText("in spite of")).toBe(false);
      expect(isSentenceText("as well as")).toBe(false);
    });

    it("带有句号/问号/感叹号的完整句子判定为句子", () => {
      expect(isSentenceText("This is a great day.")).toBe(true);
      expect(isSentenceText("How are you doing today?")).toBe(true);
      expect(isSentenceText("Please never give up!")).toBe(true);
    });

    it("超长文本 (>80字符) 判定为句子", () => {
      const longText = "This is a very long text designed to exceed eighty characters in total length for testing purpose";
      expect(isSentenceText(longText)).toBe(true);
    });
  });

  describe("cleanTextForTTS 文本规范化与括号清洗", () => {
    it("正确还原单词内部拼写括号", () => {
      expect(cleanTextForTTS("recov(er)")).toBe("recover");
      expect(cleanTextForTTS("theat(re)")).toBe("theatre");
      expect(cleanTextForTTS("colo(u)r")).toBe("colour");
      expect(cleanTextForTTS("(in)dependent")).toBe("independent");
      expect(cleanTextForTTS("travel(l)er")).toBe("traveller");
    });

    it("正确处理括号内形近变体字母 (s/z)", () => {
      expect(cleanTextForTTS("organi(s/z)e")).toBe("organise");
      expect(cleanTextForTTS("reali(s/z)ation")).toBe("realisation");
    });

    it("剥离词性标注与占位符", () => {
      expect(cleanTextForTTS("apple (n.)")).toBe("apple");
      expect(cleanTextForTTS("run (vt. & vi.)")).toBe("run");
      expect(cleanTextForTTS("depend on (sb.)")).toBe("depend on");
      expect(cleanTextForTTS("look forward to (doing sth.)")).toBe("look forward to");
      expect(cleanTextForTTS("look after (sb./sth.)")).toBe("look after");
    });

    it("剥离中文解释与说明", () => {
      expect(cleanTextForTTS("take off (起飞)")).toBe("take off");
      expect(cleanTextForTTS("bank (银行；岸)")).toBe("bank");
    });

    it("处理斜杠变体词只取首个，避免 TTS 读出 slash 噪音", () => {
      expect(cleanTextForTTS("theatre / theater")).toBe("theatre");
      expect(cleanTextForTTS("programme/program")).toBe("programme");
    });
  });

  describe("URL 生成器", () => {
    it("生成正确的 Google TTS URL", () => {
      const url = googleTTSURL("apple (n.)");
      expect(url).toContain("https://translate.google.com/translate_tts?");
      expect(url).toContain("q=apple");
      expect(url).toContain("tl=en");
    });

    it("生成正确的 Youdao TTS URL", () => {
      const url = youdaoTTSURL("recov(er)");
      expect(url).toContain("https://dict.youdao.com/dictvoice?");
      expect(url).toContain("audio=recover");
      expect(url).toContain("type=2");
    });
  });

  describe("splitTextForTTS 长文本与例句智能分片", () => {
    it("短句与常规例句（<=160字符）不进行额外切分", () => {
      const sentence = "She went to the market to buy fresh vegetables.";
      expect(splitTextForTTS(sentence)).toEqual([sentence]);
    });

    it("空文本返回空数组", () => {
      expect(splitTextForTTS("")).toEqual([]);
      expect(splitTextForTTS("   ")).toEqual([]);
    });

    it("超长例句（>160字符）优先按标点符号自然分段", () => {
      const longSentence =
        "Artificial intelligence and deep learning algorithms have transformed various industries, from healthcare and finance to autonomous vehicles and education, enabling unprecedented levels of automation and intelligent decision-making capabilities.";
      const chunks = splitTextForTTS(longSentence, 160);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(160);
      }
      // 所有分片拼接后应覆盖全部内容
      expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(longSentence.replace(/\s+/g, " "));
    });
  });

  describe("配置存储与启动同步 (localStorage + SQLite 零延迟同步)", () => {
    it("saveTTSSource 同时写入 localStorage 和 db", async () => {
      await saveTTSSource("youdao");
      expect(localStorage.getItem(TTS_SOURCE_KEY)).toBe("youdao");
      expect(db.setSetting).toHaveBeenCalledWith("tts_source", "youdao");

      const source = await getTTSSource();
      expect(source).toBe("youdao");
    });

    it("saveTTSFallbackEnabled 严格控制回退开关", async () => {
      await saveTTSFallbackEnabled(false);
      expect(localStorage.getItem(TTS_FALLBACK_KEY)).toBe("0");
      expect(db.setSetting).toHaveBeenCalledWith("tts_fallback_enabled", "0");

      const enabled = await getTTSFallbackEnabled();
      expect(enabled).toBe(false);

      await saveTTSFallbackEnabled(true);
      expect(localStorage.getItem(TTS_FALLBACK_KEY)).toBe("1");
      expect(db.setSetting).toHaveBeenCalledWith("tts_fallback_enabled", "1");
    });

    it("initTTSSettings 从 SQLite 同步恢复配置", async () => {
      await db.setSetting("tts_source", "google");
      await db.setSetting("tts_fallback_enabled", "0");

      await initTTSSettings();

      expect(localStorage.getItem(TTS_SOURCE_KEY)).toBe("google");
      expect(localStorage.getItem(TTS_FALLBACK_KEY)).toBe("0");
      expect(await getTTSSource()).toBe("google");
      expect(await getTTSFallbackEnabled()).toBe(false);
    });
  });

  describe("fetchAudioBlobUrl 音频流获取与反防盗链 Referer 注入", () => {
    it("获取 Google TTS 时正确注入 Referer 头并返回 Blob URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => new Blob(["fake-audio-bytes"], { type: "audio/mpeg" }),
      });
      globalThis.fetch = mockFetch;

      const url = googleTTSURL("apple");
      const blobUrl = await fetchAudioBlobUrl(url);

      expect(blobUrl).toMatch(/^blob:/);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe(url);
      expect(calledOptions.headers.Referer).toBe("https://translate.google.com/");

      // 第二次请求同一 URL 时应命中内存缓存，无需重复网络请求
      const cachedUrl = await fetchAudioBlobUrl(url);
      expect(cachedUrl).toBe(blobUrl);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
