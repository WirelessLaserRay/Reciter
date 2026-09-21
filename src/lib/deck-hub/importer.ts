import { db } from "@/lib/db";
import { useDeckStore } from "@/stores/useDeckStore";
import { extractPhoneticFromText } from "@/lib/phonetic";
import { splitMeaningText, isPhrase, extractAndNormalizeMeaning } from "@/lib/meaning";
import { parseAPKG } from "@/lib/apkg-parser";
import type { HubCardSample, HubDeckMeta } from "./types";
/** 将第三方（如 Qwerty Learner 格式）或通用 JSON 数据统一清洗为 Reciter 卡片结构 */
export function normalizeRawCards(rawArray: any[]): HubCardSample[] {
  const normalized: HubCardSample[] = [];
  for (const item of rawArray) {
    if (!item || typeof item !== "object") continue;
    const front = String(
      item.name || item.word || item.front || item.term || item.headWord || item.headword || ""
    ).trim();
    if (!front) continue;

    const rawMeaning =
      item.trans ??
      item.translation ??
      item.definition ??
      item.back ??
      item.meaning ??
      item.explain ??
      item.explanation ??
      "";

    const explicitPos = String(item.pos || item.partOfSpeech || "").trim();
    const { pos, back } = extractAndNormalizeMeaning(front, rawMeaning, explicitPos);
    if (!back && !front) continue;

    let phonetic = String(
      item.usphone || item.ukphone || item.phonetic || item.phone || extractPhoneticFromText(front) || ""
    ).trim();
    if (phonetic && !phonetic.startsWith("/") && !phonetic.startsWith("[")) {
      phonetic = `/${phonetic}/`;
    }

    const example = typeof item.example === "string" ? item.example.trim() : "";
    const exampleCn = typeof item.example_cn === "string" ? item.example_cn.trim() : "";
    const tags = Array.isArray(item.tags)
      ? item.tags.map(String)
      : typeof item.tags === "string"
        ? item.tags.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

    normalized.push({
      front,
      pos: pos || undefined,
      back: back || front,
      phonetic,
      example,
      example_cn: exampleCn,
      tags,
    });
  }
  return normalized;
}

/**
 * 一键下载/导入词库广场词书（支持 JSON 词库与 Anki .apkg 牌组）
 */
export async function importHubDeck(
  meta: HubDeckMeta,
  onProgress?: (msg: string) => void
): Promise<{ deckId: number; count: number; name: string }> {
  onProgress?.(`正在准备获取【${meta.name}】数据...`);

  let loadedCards: HubCardSample[] = [];

  if (meta.format === "apkg") {
    // ==================== APKG 格式处理 ====================
    let apkgBuffer: ArrayBuffer | null = null;

    // 1. 本地内置资源尝试加载
    if (meta.localPath) {
      try {
        const base = import.meta.env.BASE_URL || "";
        const url = `${base.replace(/\/$/, "")}/${meta.localPath.replace(/^\//, "")}`;
        onProgress?.("正在读取本地 Anki 牌组文件...");
        const res = await fetch(url);
        if (res.ok) {
          apkgBuffer = await res.arrayBuffer();
        }
      } catch {}
    }

    // 2. 远程加载
    if (!apkgBuffer && meta.remoteUrls && meta.remoteUrls.length > 0) {
      for (const remoteUrl of meta.remoteUrls) {
        try {
          onProgress?.(`正在拉取远程 Anki 牌组 (${new URL(remoteUrl).hostname})...`);
          const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            apkgBuffer = await res.arrayBuffer();
            if (apkgBuffer && apkgBuffer.byteLength > 0) break;
          }
        } catch {}
      }
    }

    if (!apkgBuffer) {
      throw new Error(`未能获取 Anki 牌组【${meta.name}】数据，请检查网络连接后重试`);
    }

    onProgress?.("正在轻量解包并解析 Anki SQLite 数据库...");
    const parsed = await parseAPKG(apkgBuffer, meta.name);
    if (parsed.cards.length === 0) {
      const warn = parsed.warnings.join("；") || "未找到卡片记录";
      throw new Error(`解析 Anki 牌组失败: ${warn}`);
    }

    for (const c of parsed.cards) {
      loadedCards.push({
        front: c.front,
        back: c.back,
        phonetic: c.phonetic,
        example: c.markdown,
        tags: c.tags,
      });
    }
  } else {
    // ==================== JSON 格式处理 ====================
    // 1. 本地内置加载（秒开，离线可用）
    if (meta.localPath) {
      try {
        const base = import.meta.env.BASE_URL || "";
        const url = `${base.replace(/\/$/, "")}/${meta.localPath.replace(/^\//, "")}`;
        onProgress?.("正在从本地内置资源快速加载...");
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            loadedCards = normalizeRawCards(json);
          }
        }
      } catch {}
    }

    // 2. 远程开源 CDN 镜像拉取
    if (loadedCards.length === 0 && meta.remoteUrls && meta.remoteUrls.length > 0) {
      for (const remoteUrl of meta.remoteUrls) {
        try {
          const host = new URL(remoteUrl).hostname;
          onProgress?.(`正在从镜像源拉取全量词库 (${host})...`);
          const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json) && json.length > 0) {
              loadedCards = normalizeRawCards(json);
              if (loadedCards.length > 0) break;
            }
          }
        } catch {}
      }
    }

    if (loadedCards.length === 0) {
      throw new Error(
        `获取词库【${meta.name}】远程数据失败，所有镜像节点连接超时。请检查网络后重试。`
      );
    }
  }

  if (loadedCards.length === 0) {
    throw new Error(`未能获取词库【${meta.name}】的有效词条数据`);
  }

  // 写入数据库
  const folder = meta.format === "apkg" ? "Anki记忆库" : "官方词库";
  const targetDeckName = await db.getUniqueDeckName(meta.name, folder);
  const deckId = await db.createDeck(targetDeckName, meta.description, undefined, folder);

  const total = loadedCards.length;
  onProgress?.(`正在写入本地词库 (0/${total})...`);

  const existingSet = new Set<string>();

  for (let i = 0; i < total; i++) {
    const card = loadedCards[i];
    const isPhraseWord = isPhrase(card.front);
    let finalBack = card.back;
    if (card.pos && !isPhraseWord && !card.back.startsWith(card.pos)) {
      finalBack = `${card.pos} ${card.back}`;
    }
    const meaning = splitMeaningText(finalBack, card.front);
    const markdown = card.example
      ? card.example_cn
        ? `${card.example}\n\n${card.example_cn}`
        : card.example
      : card.example_cn || "";

    const tags = card.tags && card.tags.length > 0 ? card.tags : meta.tags;

    await db.upsertCard(
      {
        deckId,
        front: card.front,
        back: finalBack,
        phonetic: card.phonetic || extractPhoneticFromText(card.front),
        markdown,
        sourceType: meta.format === "apkg" ? "manual" : "json",
        tags,
        meaningPrimary: meaning.primary,
        meaningSecondary: meaning.secondary,
      },
      existingSet
    );

    // 每 100 词汇报一次进度，并微小休眠让渡 UI 主线程
    if ((i + 1) % 100 === 0 || i === total - 1) {
      onProgress?.(`正在写入本地词库 (${i + 1}/${total})...`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await useDeckStore.getState().refresh();

  return {
    deckId,
    count: total,
    name: targetDeckName,
  };
}

/**
 * 支持从用户自定义的任意在线 URL（.json 或 .apkg）拉取并导入为新词库
 */
export async function importFromCustomUrl(
  urlStr: string,
  customDeckName?: string,
  onProgress?: (msg: string) => void
): Promise<{ deckId: number; count: number; name: string }> {
  onProgress?.("正在解析并连接目标资源...");
  const trimmedUrl = urlStr.trim();
  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    throw new Error("请输入以 http:// 或 https:// 开头的有效网络直链");
  }

  const isApkg = /\.apkg(\?.*)?$/i.test(trimmedUrl);
  const guessedName =
    customDeckName?.trim() ||
    decodeURIComponent(trimmedUrl.split("/").pop()?.replace(/(\.json|\.apkg)(\?.*)?$/i, "") || "") ||
    (isApkg ? "Anki 在线导入" : "在线导入词库");

  if (isApkg) {
    onProgress?.("正在下载在线 Anki 牌组包...");
    const res = await fetch(trimmedUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`下载失败 (HTTP ${res.status}): ${res.statusText}`);
    const buffer = await res.arrayBuffer();

    onProgress?.("正在解包并解析 Anki 牌组...");
    const parsed = await parseAPKG(buffer, guessedName);
    if (parsed.cards.length === 0) throw new Error("Anki 牌组内未提取到有效卡片");

    const folder = "Anki记忆库";
    const targetDeckName = await db.getUniqueDeckName(guessedName, folder);
    const deckId = await db.createDeck(targetDeckName, `从在线直链导入: ${trimmedUrl}`, undefined, folder);

    const total = parsed.cards.length;
    const existingSet = new Set<string>();

    for (let i = 0; i < total; i++) {
      const c = parsed.cards[i];
      await db.upsertCard(
        {
          deckId,
          front: c.front,
          back: c.back,
          phonetic: c.phonetic,
          markdown: c.markdown,
          sourceType: "manual",
          tags: c.tags,
          meaningPrimary: c.meaningPrimary,
          meaningSecondary: c.meaningSecondary,
        },
        existingSet
      );
      if ((i + 1) % 50 === 0 || i === total - 1) {
        onProgress?.(`正在写入本地词库 (${i + 1}/${total})...`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await useDeckStore.getState().refresh();
    return { deckId, count: total, name: targetDeckName };
  } else {
    onProgress?.("正在拉取在线 JSON 词库...");
    const res = await fetch(trimmedUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`下载失败 (HTTP ${res.status}): ${res.statusText}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("在线数据格式不匹配：必须为包含卡片对象的 JSON 数组");

    const normalized = normalizeRawCards(json);
    if (normalized.length === 0) throw new Error("未能从在线数据中解析出有效词条");

    const folder = "网络词库";
    const targetDeckName = await db.getUniqueDeckName(guessedName, folder);
    const deckId = await db.createDeck(targetDeckName, `从在线直链导入: ${trimmedUrl}`, undefined, folder);

    const total = normalized.length;
    const existingSet = new Set<string>();

    for (let i = 0; i < total; i++) {
      const card = normalized[i];
      const isPhraseWord = isPhrase(card.front);
      let finalBack = card.back;
      if (card.pos && !isPhraseWord && !card.back.startsWith(card.pos)) {
        finalBack = `${card.pos} ${card.back}`;
      }
      const meaning = splitMeaningText(finalBack, card.front);

      await db.upsertCard(
        {
          deckId,
          front: card.front,
          back: finalBack,
          phonetic: card.phonetic || extractPhoneticFromText(card.front),
          markdown: card.example,
          sourceType: "json",
          tags: card.tags,
          meaningPrimary: meaning.primary,
          meaningSecondary: meaning.secondary,
        },
        existingSet
      );
      if ((i + 1) % 100 === 0 || i === total - 1) {
        onProgress?.(`正在写入本地词库 (${i + 1}/${total})...`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await useDeckStore.getState().refresh();
    return { deckId, count: total, name: targetDeckName };
  }
}
