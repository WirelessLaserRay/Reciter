import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";
import type { Card, CardState, DailyStats, Deck, ReviewLog } from "@/types";

export interface BackupData {
  version: number;
  exportedAt: string;
  appVersion?: string;
  deckCount?: number;
  cardCount?: number;
  reviewCount?: number;
  decks: Deck[];
  cards: (Card & CardState)[];
  reviewLogs: ReviewLog[];
  settings: { key: string; value: string }[];
  dailyStats: DailyStats[];
}

export const APP_VERSION = "0.16.4";
export const BACKUP_VERSION = 2;

export const SAFETY_BACKUP_KEY = "reciter_safety_backup_data";
export const SAFETY_META_KEY = "reciter_safety_backup_meta";

/** 本地特定设备受保护的设置键（恢复/同步快照时严禁被远程冲刷抹除） */
export const DEVICE_PRESERVED_SETTINGS = [
  "sync_endpoint",
  "sync_token",
  "sync_last_remote_time",
  "sync_last_local_time",
  "safety_backup_time",
];

export interface SafetyBackupMeta {
  savedAt: string;
  deckCount: number;
  cardCount: number;
  reason: "pre_restore" | "pre_sync";
}

let memorySafetyBackup: BackupData | null = null;
let memorySafetyMeta: SafetyBackupMeta | null = null;

export async function saveSafetyBackup(
  data: BackupData,
  reason: "pre_restore" | "pre_sync" = "pre_sync"
): Promise<void> {
  const meta: SafetyBackupMeta = {
    savedAt: new Date().toISOString(),
    deckCount: data.decks.length,
    cardCount: data.cards.length,
    reason,
  };
  memorySafetyBackup = data;
  memorySafetyMeta = meta;

  try {
    await idbSet(SAFETY_BACKUP_KEY, data);
    await idbSet(SAFETY_META_KEY, meta);
  } catch (e) {
    console.warn("无法持久化安全快照至 IndexedDB:", e);
  }
  try {
    localStorage.setItem(SAFETY_META_KEY, JSON.stringify(meta));
  } catch {}
}

export async function getSafetyBackupInfo(): Promise<SafetyBackupMeta | null> {
  if (memorySafetyMeta) return memorySafetyMeta;
  try {
    const meta = await idbGet<SafetyBackupMeta>(SAFETY_META_KEY);
    if (meta) return meta;
  } catch {}
  try {
    const raw = localStorage.getItem(SAFETY_META_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export async function clearSafetyBackup(): Promise<void> {
  memorySafetyBackup = null;
  memorySafetyMeta = null;
  try {
    await idbDel(SAFETY_BACKUP_KEY);
    await idbDel(SAFETY_META_KEY);
  } catch {}
  try {
    localStorage.removeItem(SAFETY_META_KEY);
  } catch {}
}

/** 弹性数据清洗与向下/向上迁移转换（保证新老版本互相导入不报错） */
export function sanitizeBackupData(raw: unknown): BackupData {
  if (!raw || typeof raw !== "object") {
    throw new Error("无效的备份数据：内容不是合法的 JSON 对象");
  }
  const obj = raw as Record<string, unknown>;
  const rawDecks = Array.isArray(obj.decks) ? obj.decks : [];
  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
  const rawReviewLogs = Array.isArray(obj.reviewLogs) ? obj.reviewLogs : [];
  const rawSettings = Array.isArray(obj.settings) ? obj.settings : [];
  const rawDailyStats = Array.isArray(obj.dailyStats) ? obj.dailyStats : [];

  const now = new Date().toISOString();

  // 1. 清洗与迁移 Decks
  const decks: Deck[] = rawDecks.map((d: any, idx: number) => ({
    id: typeof d.id === "number" ? d.id : idx + 1,
    folder: typeof d.folder === "string" ? d.folder : "",
    name: typeof d.name === "string" && d.name.trim() ? d.name.trim() : `词库 ${idx + 1}`,
    description: typeof d.description === "string" ? d.description : "",
    new_cards_per_day: typeof d.new_cards_per_day === "number" && d.new_cards_per_day > 0 ? d.new_cards_per_day : 20,
    created_at: typeof d.created_at === "string" ? d.created_at : now,
    updated_at: typeof d.updated_at === "string" ? d.updated_at : now,
  }));

  // 2. 清洗与迁移 Cards & CardState
  const decksSet = new Set(decks.map((d) => d.id));
  const fallbackDeckId = decks[0]?.id ?? 1;

  const cards: (Card & CardState)[] = rawCards.map((c: any, idx: number) => {
    const cardId = typeof c.card_id === "number" ? c.card_id : (typeof c.id === "number" ? c.id : idx + 1);
    const deckId = typeof c.deck_id === "number" && decksSet.has(c.deck_id) ? c.deck_id : fallbackDeckId;

    // 标签容错转 JSON 字符串
    let tagsStr = "[]";
    if (typeof c.tags === "string") {
      try {
        const parsed = JSON.parse(c.tags);
        tagsStr = Array.isArray(parsed) ? JSON.stringify(parsed.map(String)) : "[]";
      } catch {
        tagsStr = "[]";
      }
    } else if (Array.isArray(c.tags)) {
      tagsStr = JSON.stringify(c.tags.map(String));
    }

    const sourceType = (c.source_type === "markdown" || c.source_type === "csv" || c.source_type === "json" || c.source_type === "manual")
      ? c.source_type
      : "manual";

    return {
      id: cardId,
      card_id: cardId,
      deck_id: deckId,
      front: typeof c.front === "string" ? c.front : "",
      back: typeof c.back === "string" ? c.back : "",
      markdown_content: typeof c.markdown_content === "string" ? c.markdown_content : "",
      phonetic: typeof c.phonetic === "string" ? c.phonetic : "",
      source_type: sourceType,
      tags: tagsStr,
      is_key: c.is_key === 1 ? 1 : 0,
      weak_source: typeof c.weak_source === "string" ? c.weak_source : "",
      weak_dismissed: c.weak_dismissed === 1 ? 1 : 0,
      meaning_primary: typeof c.meaning_primary === "string" ? c.meaning_primary : "",
      meaning_secondary: typeof c.meaning_secondary === "string" ? c.meaning_secondary : "",
      ignored: c.ignored === 1 ? 1 : 0,
      created_at: typeof c.created_at === "string" ? c.created_at : now,
      updated_at: typeof c.updated_at === "string" ? c.updated_at : now,

      // FSRS 记忆进度安全垫片
      state: typeof c.state === "number" ? c.state : 0,
      stability: typeof c.stability === "number" ? c.stability : 0,
      difficulty: typeof c.difficulty === "number" ? c.difficulty : 0,
      due: typeof c.due === "string" ? c.due : now,
      last_review: typeof c.last_review === "string" ? c.last_review : null,
      elapsed_days: typeof c.elapsed_days === "number" ? c.elapsed_days : 0,
      scheduled_days: typeof c.scheduled_days === "number" ? c.scheduled_days : 0,
      learning_steps: typeof c.learning_steps === "number" ? c.learning_steps : 0,
      reps: typeof c.reps === "number" ? c.reps : 0,
      lapses: typeof c.lapses === "number" ? c.lapses : 0,
      desired_retention: typeof c.desired_retention === "number" ? c.desired_retention : 0.9,
      algorithm_version: typeof c.algorithm_version === "string" ? c.algorithm_version : "FSRS-5",
    };
  });

  // 3. 清洗与迁移 ReviewLogs
  const reviewLogs: ReviewLog[] = rawReviewLogs.map((l: any, idx: number) => ({
    id: typeof l.id === "number" ? l.id : idx + 1,
    card_id: typeof l.card_id === "number" ? l.card_id : (cards[0]?.id ?? 1),
    grade: (l.grade === 1 || l.grade === 2 || l.grade === 3 || l.grade === 4) ? l.grade : 3,
    reviewed_at: typeof l.reviewed_at === "string" ? l.reviewed_at : now,
    response_time_ms: typeof l.response_time_ms === "number" ? l.response_time_ms : null,
    source: (l.source === "review" || l.source === "quiz" || l.source === "ai_test") ? l.source : "review",
    ai_question: typeof l.ai_question === "string" ? l.ai_question : null,
    ai_answer: typeof l.ai_answer === "string" ? l.ai_answer : null,
  }));

  // 4. 清洗 Settings
  const settings: { key: string; value: string }[] = rawSettings
    .filter((s: any) => s && typeof s.key === "string" && s.key.trim())
    .map((s: any) => ({ key: String(s.key).trim(), value: typeof s.value === "string" ? s.value : JSON.stringify(s.value) }));

  // 5. 清洗 DailyStats
  const dailyStats: DailyStats[] = rawDailyStats.map((s: any) => ({
    date: typeof s.date === "string" ? s.date : now.slice(0, 10),
    new_count: typeof s.new_count === "number" ? s.new_count : 0,
    review_count: typeof s.review_count === "number" ? s.review_count : 0,
    again_count: typeof s.again_count === "number" ? s.again_count : 0,
    total_time_ms: typeof s.total_time_ms === "number" ? s.total_time_ms : 0,
    retention_rate: typeof s.retention_rate === "number" ? s.retention_rate : 0,
  }));

  return {
    version: typeof obj.version === "number" ? obj.version : BACKUP_VERSION,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : now,
    appVersion: typeof obj.appVersion === "string" ? obj.appVersion : APP_VERSION,
    deckCount: decks.length,
    cardCount: cards.length,
    reviewCount: reviewLogs.length,
    decks,
    cards,
    reviewLogs,
    settings,
    dailyStats,
  };
}

export async function buildBackup(): Promise<BackupData> {
  const [decks, cards, reviewLogs, settings, dailyStats] = await Promise.all([
    db.getDecks(),
    db.getAllCardsWithState(),
    db.getReviewLogs(),
    db.getAllSettings(),
    db.getAllDailyStats(),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    deckCount: decks.length,
    cardCount: cards.length,
    reviewCount: reviewLogs.length,
    decks,
    cards,
    reviewLogs,
    settings,
    dailyStats,
  };
}

export interface BackupResult {
  ok: boolean;
  message: string;
  decks?: number;
  cards?: number;
}

/** 恢复安全备份到当前库 */
export async function restoreSafetyBackup(): Promise<BackupResult> {
  let data = memorySafetyBackup;
  if (!data) {
    try {
      data = (await idbGet<BackupData>(SAFETY_BACKUP_KEY)) ?? null;
    } catch {}
  }
  if (!data) {
    return { ok: false, message: "未找到可恢复的本地安全备份" };
  }
  return restoreBackupData(data, { skipSafetyBackup: true });
}

export interface RestoreOptions {
  skipSafetyBackup?: boolean;
  reason?: "pre_restore" | "pre_sync";
}

/** 从 BackupData 整体恢复（带安全快照备份、本地设置保护、向下兼容清洗与自校验） */
export async function restoreBackupData(
  raw: unknown,
  options?: RestoreOptions
): Promise<BackupResult> {
  let data: BackupData;
  try {
    data = sanitizeBackupData(raw);
  } catch (e) {
    return { ok: false, message: `备份数据解析校验失败: ${String(e)}` };
  }

  // 1. 恢复前生成安全备份（只要本地有数据且未显式跳过）
  let safetyBackup: BackupData | null = null;
  if (!options?.skipSafetyBackup) {
    try {
      safetyBackup = await buildBackup();
      if (safetyBackup.decks.length > 0 || safetyBackup.cards.length > 0) {
        await saveSafetyBackup(safetyBackup, options?.reason ?? "pre_restore");
      }
    } catch (e) {
      console.warn("生成安全备份失败:", e);
    }
  }

  // 2. 提取本地需要保留的关键设备配置（凭据与同步状态）
  const preservedMap = new Map<string, string>();
  try {
    const localSettings = await db.getAllSettings();
    for (const s of localSettings) {
      if (DEVICE_PRESERVED_SETTINGS.includes(s.key)) {
        preservedMap.set(s.key, s.value);
      }
    }
  } catch {}

  // 3. 执行原子恢复
  const snap = db.snapshot();
  try {
    await db.transaction(async () => {
      await db.clearAllData();
      for (const d of data.decks) await db.restoreDeck(d);
      for (const c of data.cards) await db.restoreCard(c as never);
      for (const l of data.reviewLogs ?? []) await db.restoreReviewLog(l);
      for (const s of data.settings ?? []) {
        if (!DEVICE_PRESERVED_SETTINGS.includes(s.key)) {
          await db.restoreSetting(s.key, s.value);
        }
      }
      for (const s of data.dailyStats ?? []) await db.restoreDailyStat(s);

      // 写回保留的本地私有配置
      for (const [key, val] of preservedMap.entries()) {
        await db.restoreSetting(key, val);
      }
    });

    // 自校验：恢复数量与清洗后一致
    const deckCount = (await db.getDecks()).length;
    const cardCount = await db.getTotalCardCount();
    if (deckCount !== data.decks.length || cardCount !== data.cards.length) {
      throw new Error(
        `恢复校验失败：词库 ${deckCount}/${data.decks.length}，卡片 ${cardCount}/${data.cards.length}`
      );
    }
    await db.flush(); // 立即持久化，防止刷新丢数据
    return {
      ok: true,
      message: `恢复成功（${deckCount} 词库 / ${cardCount} 卡片）`,
      decks: deckCount,
      cards: cardCount,
    };
  } catch (e) {
    // 失败回滚保护：Web 端用 snapshot 回滚，Tauri 端用 safetyBackup 回滚！
    if (snap) {
      await db.restoreSnapshot(snap).catch(() => {});
    } else if (safetyBackup) {
      try {
        await db.transaction(async () => {
          await db.clearAllData();
          for (const d of safetyBackup.decks) await db.restoreDeck(d);
          for (const c of safetyBackup.cards) await db.restoreCard(c as never);
          for (const l of safetyBackup.reviewLogs ?? []) await db.restoreReviewLog(l);
          for (const s of safetyBackup.settings ?? []) await db.restoreSetting(s.key, s.value);
          for (const s of safetyBackup.dailyStats ?? []) await db.restoreDailyStat(s);
          for (const [key, val] of preservedMap.entries()) {
            await db.restoreSetting(key, val);
          }
        });
      } catch (rollbackErr) {
        console.error("安全快照紧急回滚失败:", rollbackErr);
      }
    }
    return { ok: false, message: `恢复失败已尝试回滚: ${String(e)}` };
  }
}

/** 导出全量数据为 JSON 文件（Tauri：保存对话框；Web：浏览器下载） */
export async function exportToJSON(): Promise<BackupResult> {
  try {
    const data = await buildBackup();
    const json = JSON.stringify(data, null, 2);
    if (isTauri()) {
      const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
      const path = await save({
        defaultPath: "reciter-backup-" + stamp + ".json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return { ok: false, message: "已取消导出" };
      await invoke("write_text_file", { path, content: json });
      return { ok: true, message: "导出成功：" + path, decks: data.decks.length, cards: data.cards.length };
    }
    // Web：Blob 下载
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reciter-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, message: "已下载备份文件", decks: data.decks.length, cards: data.cards.length };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** 读取并解析备份文件（不写入数据，用于导入前摘要） */
export async function readBackupFile(): Promise<BackupData | null> {
  try {
    let content: string;
    if (isTauri()) {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return null;
      content = await invoke<string>("read_text_file", { path });
    } else {
      content = await new Promise<string>((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return reject(new Error("未选择文件"));
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("读取文件失败"));
          reader.readAsText(f);
        };
        input.click();
      });
    }
    const raw = JSON.parse(content);
    return sanitizeBackupData(raw);
  } catch (e) {
    throw new Error(String(e));
  }
}

/** 批量导出指定词库为可再次导入的 JSON（保留标签、重点标记、文件夹） */
export async function exportDecksToJSON(deckIds: number[]): Promise<BackupResult> {
  try {
    const decks = await db.getDecks();
    const selected = decks.filter((d) => deckIds.includes(d.id));
    const items: unknown[] = [];
    for (const d of selected) {
      const cards = await db.getCardsByDeck(d.id);
      for (const c of cards) {
        let tags: string[] = [];
        try {
          const parsed = JSON.parse(c.tags);
          tags = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          tags = [];
        }
        items.push({
          folder: d.folder ?? "",
          deck: d.name,
          front: c.front,
          back: c.back,
          markdown: c.markdown_content,
          tags,
          is_key: c.is_key === 1,
          weak_source: c.weak_source,
          weak_dismissed: c.weak_dismissed,
        });
      }
    }
    const json = JSON.stringify(items, null, 2);
    if (isTauri()) {
      const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
      const path = await save({
        defaultPath: "reciter-decks-" + stamp + ".json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return { ok: false, message: "已取消导出" };
      await invoke("write_text_file", { path, content: json });
      return { ok: true, message: "导出成功：" + path, decks: selected.length, cards: items.length };
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reciter-decks-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, message: "已下载词库 JSON", decks: selected.length, cards: items.length };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** 从 JSON 文件恢复（清空现有数据后整体恢复） */
export async function importFromJSON(): Promise<BackupResult> {
  try {
    const data = await readBackupFile();
    if (!data) return { ok: false, message: "已取消导入" };
    return restoreBackupData(data, { reason: "pre_restore" });
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
