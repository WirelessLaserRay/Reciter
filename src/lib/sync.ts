import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";
import { buildBackup, restoreBackupData, type BackupData } from "@/lib/backup";

export interface SyncConfig {
  endpoint: string;
  token: string;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  updatedAt?: string | null;
  decks?: number;
  cards?: number;
}

const httpFetch = isTauri()
  ? tauriFetch
  : (...args: Parameters<typeof fetch>) => fetch(...args);

function syncBase(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

export async function getSyncConfig(): Promise<SyncConfig> {
  const [endpoint, token] = await Promise.all([
    db.getSetting("sync_endpoint"),
    db.getSetting("sync_token"),
  ]);
  return {
    endpoint: endpoint?.trim() ?? "",
    token: token ?? "",
  };
}

export async function saveSyncConfig(endpoint: string, token: string): Promise<void> {
  await db.setSetting("sync_endpoint", endpoint.trim());
  await db.setSetting("sync_token", token.trim());
}

/** 测试同步服务连通性（GET /api/sync/meta） */
export async function testSyncConnection(): Promise<SyncResult> {
  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    return { ok: false, message: "请先填写同步地址和 Token" };
  }
  try {
    const res = await httpFetch(`${syncBase(cfg.endpoint)}/api/sync/meta`, {
      headers: { "X-Sync-Token": cfg.token },
    });
    if (!res.ok) {
      return { ok: false, message: `连接失败（HTTP ${res.status}）` };
    }
    const data = (await res.json()) as { updatedAt?: string | null };
    return { ok: true, message: "连接成功", updatedAt: data.updatedAt ?? null };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** 上传当前完整备份到云端（覆盖云端快照） */
export async function pushSnapshot(): Promise<SyncResult> {
  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    return { ok: false, message: "请先填写同步地址和 Token" };
  }
  try {
    const data = await buildBackup();
    const body = JSON.stringify(data);
    const res = await httpFetch(`${syncBase(cfg.endpoint)}/api/sync/snapshot`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Token": cfg.token,
      },
      body,
    });
    if (!res.ok) {
      return { ok: false, message: `上传失败（HTTP ${res.status}）` };
    }
    const result = (await res.json()) as { ok?: boolean; updatedAt?: string };
    return {
      ok: true,
      message: "上传成功",
      updatedAt: result.updatedAt,
      decks: data.decks.length,
      cards: data.cards.length,
    };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/** 从云端下载完整备份并覆盖本地数据 */
export async function pullSnapshot(): Promise<SyncResult> {
  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    return { ok: false, message: "请先填写同步地址和 Token" };
  }
  try {
    const res = await httpFetch(`${syncBase(cfg.endpoint)}/api/sync/snapshot`, {
      headers: { "X-Sync-Token": cfg.token },
    });
    if (res.status === 404) {
      return { ok: false, message: "云端暂无快照" };
    }
    if (!res.ok) {
      return { ok: false, message: `下载失败（HTTP ${res.status}）` };
    }
    const data = (await res.json()) as BackupData;
    return restoreBackupData(data);
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
