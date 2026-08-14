import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";
import type { Card, CardState, DailyStats, Deck, ReviewLog } from "@/types";

export interface BackupData {
  version: number;
  exportedAt: string;
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
    if (!data || typeof data.version !== "number" || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
      return { ok: false, message: "无效的备份文件（缺少 decks/cards 字段）" };
    }
    await db.clearAllData();
    for (const d of data.decks) await db.restoreDeck(d);
    for (const c of data.cards) await db.restoreCard(c);
    for (const l of data.reviewLogs ?? []) await db.restoreReviewLog(l);
    for (const s of data.settings ?? []) await db.restoreSetting(s.key, s.value);
    for (const s of data.dailyStats ?? []) await db.restoreDailyStat(s);
    return {
      ok: true,
      message: "恢复成功（已替换现有数据）",
      decks: data.decks.length,
      cards: data.cards.length,
    };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
