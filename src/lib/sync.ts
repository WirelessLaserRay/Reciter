import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";
import { buildBackup, restoreBackupData, restoreSafetyBackup } from "@/lib/backup";

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
  conflict?: boolean;
  remoteUpdatedAt?: string | null;
  localLastSync?: string | null;
}

export interface SyncMetaInfo {
  ok: boolean;
  message?: string;
  remoteUpdatedAt: string | null;
  localLastRemoteTime: string | null;
  localLastSyncTime: string | null;
}

export interface PushConflictCheck {
  hasConflict: boolean;
  reason?: "remote_newer" | "first_push_remote_exists";
  remoteUpdatedAt: string | null;
  localLastSync: string | null;
}

const httpFetch = isTauri()
  ? tauriFetch
  : (...args: Parameters<typeof fetch>) => fetch(...args);

function syncBase(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

/** 把底层网络/HTTP 错误转成更易排查的提示 */
function syncErrorMessage(e: unknown): string {
  const msg = String(e);
  if (/401|Unauthorized/i.test(msg)) {
    return "同步 Token 不正确或未填写（401 Unauthorized），请检查 Reciter 设置与 Cloudflare SYNC_TOKEN 是否一致";
  }
  if (/403|Forbidden/i.test(msg)) {
    return "Worker 拒绝了请求（403 Forbidden），请确认已部署最新 Worker 且 Origin 允许";
  }
  if (/404|Not Found/i.test(msg)) {
    return "同步接口不存在（404），请确认 Worker 已部署最新代码";
  }
  return msg;
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

/** 获取同步状态元数据（云端最新时间与本地记录） */
export async function getSyncMetaInfo(): Promise<SyncMetaInfo> {
  const cfg = await getSyncConfig();
  const [localLastRemoteTime, localLastSyncTime] = await Promise.all([
    db.getSetting("sync_last_remote_time"),
    db.getSetting("sync_last_local_time"),
  ]);

  if (!cfg.endpoint || !cfg.token) {
    return {
      ok: false,
      message: "未配置同步地址或 Token",
      remoteUpdatedAt: null,
      localLastRemoteTime: localLastRemoteTime || null,
      localLastSyncTime: localLastSyncTime || null,
    };
  }

  try {
    const res = await httpFetch(`${syncBase(cfg.endpoint)}/api/sync/meta`, {
      headers: { "X-Sync-Token": cfg.token },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: res.status === 401
          ? "同步 Token 不正确或未填写（401 Unauthorized）"
          : `连接失败（HTTP ${res.status}）`,
        remoteUpdatedAt: null,
        localLastRemoteTime: localLastRemoteTime || null,
        localLastSyncTime: localLastSyncTime || null,
      };
    }
    const data = (await res.json()) as { updatedAt?: string | null };
    return {
      ok: true,
      remoteUpdatedAt: data.updatedAt ?? null,
      localLastRemoteTime: localLastRemoteTime || null,
      localLastSyncTime: localLastSyncTime || null,
    };
  } catch (e) {
    return {
      ok: false,
      message: syncErrorMessage(e),
      remoteUpdatedAt: null,
      localLastRemoteTime: localLastRemoteTime || null,
      localLastSyncTime: localLastSyncTime || null,
    };
  }
}

/** 测试同步服务连通性（GET /api/sync/meta） */
export async function testSyncConnection(): Promise<SyncResult> {
  const meta = await getSyncMetaInfo();
  if (!meta.ok) {
    return { ok: false, message: meta.message ?? "连接失败" };
  }
  return { ok: true, message: "连接成功", updatedAt: meta.remoteUpdatedAt };
}

/** 检查推送冲突（检测云端是否存在其他设备上传的更新快照） */
export async function checkPushConflict(): Promise<PushConflictCheck> {
  const meta = await getSyncMetaInfo();
  if (!meta.ok || !meta.remoteUpdatedAt) {
    return {
      hasConflict: false,
      remoteUpdatedAt: null,
      localLastSync: meta.localLastSyncTime,
    };
  }

  const remoteTime = new Date(meta.remoteUpdatedAt).getTime();

  // 如果本地有记录上次同步时的远端时间
  if (meta.localLastRemoteTime) {
    const localRemoteTime = new Date(meta.localLastRemoteTime).getTime();
    if (remoteTime > localRemoteTime) {
      return {
        hasConflict: true,
        reason: "remote_newer",
        remoteUpdatedAt: meta.remoteUpdatedAt,
        localLastSync: meta.localLastSyncTime,
      };
    }
    return {
      hasConflict: false,
      remoteUpdatedAt: meta.remoteUpdatedAt,
      localLastSync: meta.localLastSyncTime,
    };
  }

  // 本地从未与该云端同步过，但云端已有数据
  return {
    hasConflict: true,
    reason: "first_push_remote_exists",
    remoteUpdatedAt: meta.remoteUpdatedAt,
    localLastSync: meta.localLastSyncTime,
  };
}

/** 上传当前完整备份到云端（带冲突拦截与状态更新） */
export async function pushSnapshot(options?: { force?: boolean }): Promise<SyncResult> {
  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    return { ok: false, message: "请先填写同步地址和 Token" };
  }

  // 若未强制，先检查冲突
  if (!options?.force) {
    const check = await checkPushConflict();
    if (check.hasConflict) {
      return {
        ok: false,
        conflict: true,
        remoteUpdatedAt: check.remoteUpdatedAt,
        localLastSync: check.localLastSync,
        message: check.reason === "first_push_remote_exists"
          ? "云端已存在快照，直接上传将覆盖云端数据。请确认是否继续。"
          : "云端检测到更新的快照（其他设备可能已提交新进度）。若继续上传将覆盖云端，请确认。",
      };
    }
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
      return {
        ok: false,
        message: res.status === 401
          ? "同步 Token 不正确或未填写（401 Unauthorized），请检查 Reciter 设置与 Cloudflare SYNC_TOKEN 是否一致"
          : `上传失败（HTTP ${res.status}）`,
      };
    }
    const result = (await res.json()) as { ok?: boolean; updatedAt?: string };
    const updatedAt = result.updatedAt ?? new Date().toISOString();

    // 记录同步元数据
    await Promise.all([
      db.setSetting("sync_last_remote_time", updatedAt),
      db.setSetting("sync_last_local_time", new Date().toISOString()),
    ]);

    return {
      ok: true,
      message: "快照已成功同步上传至云端",
      updatedAt,
      decks: data.decks.length,
      cards: data.cards.length,
    };
  } catch (e) {
    return { ok: false, message: syncErrorMessage(e) };
  }
}

/** 从云端下载完整备份并覆盖本地数据（带安全快照保护与向下兼容清洗） */
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
      return {
        ok: false,
        message: res.status === 401
          ? "同步 Token 不正确或未填写（401 Unauthorized），请检查 Reciter 设置与 Cloudflare SYNC_TOKEN 是否一致"
          : `下载失败（HTTP ${res.status}）`,
      };
    }

    const remoteHeaderTime = res.headers.get("X-Snapshot-Updated-At");
    const rawData = await res.json();

    // 执行恢复（内部自动生成覆盖前的本地安全快照与数据清洗）
    const restoreRes = await restoreBackupData(rawData, { reason: "pre_sync" });
    if (!restoreRes.ok) {
      return { ok: false, message: restoreRes.message };
    }

    const updatedAt = remoteHeaderTime ?? (rawData as { exportedAt?: string }).exportedAt ?? new Date().toISOString();
    await Promise.all([
      db.setSetting("sync_last_remote_time", updatedAt),
      db.setSetting("sync_last_local_time", new Date().toISOString()),
    ]);

    return {
      ok: true,
      message: `云端快照下载恢复成功（${restoreRes.decks} 词库 / ${restoreRes.cards} 卡片）`,
      updatedAt,
      decks: restoreRes.decks,
      cards: restoreRes.cards,
    };
  } catch (e) {
    return { ok: false, message: syncErrorMessage(e) };
  }
}

/** 撤销上次同步恢复（一键回滚到本地覆盖前快照） */
export async function undoSyncRestore(): Promise<SyncResult> {
  try {
    const r = await restoreSafetyBackup();
    return {
      ok: r.ok,
      message: r.message,
      decks: r.decks,
      cards: r.cards,
    };
  } catch (e) {
    return { ok: false, message: `撤销失败: ${String(e)}` };
  }
}
