import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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

const BACKUP_VERSION = 1;

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
    appVersion: "0.16.0",
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
    const data = JSON.parse(content) as BackupData;
    if (!data || typeof data.version !== "number" || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
      throw new Error("无效的备份文件（缺少 decks/cards 字段）");
    }
    return data;
  } catch (e) {
    throw new Error(String(e));
  }
}

/** 从 BackupData 整体恢复（清空现有数据后恢复，带原子回滚与自校验） */
export async function restoreBackupData(data: BackupData): Promise<BackupResult> {
  if (!data || typeof data.version !== "number" || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
    return { ok: false, message: "无效的备份数据（缺少 decks/cards 字段）" };
  }
  // 原子导入：先快照，失败回滚，成功立即持久化，避免残留半状态
  const snap = db.snapshot();
  try {
    await db.transaction(async () => {
      await db.clearAllData();
      for (const d of data.decks) await db.restoreDeck(d);
      for (const c of data.cards) await db.restoreCard(c as never);
      for (const l of data.reviewLogs ?? []) await db.restoreReviewLog(l);
      for (const s of data.settings ?? []) await db.restoreSetting(s.key, s.value);
      for (const s of data.dailyStats ?? []) await db.restoreDailyStat(s);
    });
    // 自校验：恢复数量与备份一致
    const deckCount = (await db.getDecks()).length;
    const cardCount = await db.getTotalCardCount();
    if (deckCount !== data.decks.length || cardCount !== data.cards.length) {
      throw new Error(
        "恢复校验失败：词库 " + deckCount + "/" + data.decks.length +
        "，卡片 " + cardCount + "/" + data.cards.length
      );
    }
    await db.flush(); // 立即持久化，防止刷新丢数据
    return {
      ok: true,
      message: "恢复成功（" + deckCount + " 词库 / " + cardCount + " 卡片）",
      decks: deckCount,
      cards: cardCount,
    };
  } catch (e) {
    if (snap) await db.restoreSnapshot(snap).catch(() => {});
    return { ok: false, message: String(e) };
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
    let content: string;
    if (isTauri()) {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return { ok: false, message: "已取消导入" };
      content = await invoke<string>("read_text_file", { path });
    } else {
      // Web：文件选择器读取
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
    const data = JSON.parse(content) as BackupData;
    return restoreBackupData(data);
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
