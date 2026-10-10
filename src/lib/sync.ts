import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "@/lib/env";
import { db } from "@/lib/db";
import {
  buildBackup,
  isPreservedDeviceSetting,
  restoreBackupData,
  restoreSafetyBackup,
} from "@/lib/backup";
import { useSyncStore } from "@/stores/useSyncStore";

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
  remoteClientId?: string | null;
  remoteDeviceId?: string | null;
  localLastRemoteTime: string | null;
  localLastSyncTime: string | null;
}

export interface PushConflictCheck {
  hasConflict: boolean;
  reason?: "remote_newer" | "first_push_remote_exists";
  remoteUpdatedAt: string | null;
  localLastSync: string | null;
}

const rawFetch = isTauri()
  ? tauriFetch
  : (...args: Parameters<typeof fetch>) => fetch(...args);

/** 带超时控制器与瞬态错误重试的安全网络请求函数 */
async function safeHttpFetch(
  input: string | URL | Request,
  init?: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const execute = async (attempt: number): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (init?.signal) {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const res = await rawFetch(input, {
        ...init,
        signal: controller.signal,
      });
      // 对瞬态网关错误（502、503、504）进行一次重试
      if (res.status >= 502 && res.status <= 504 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
        return execute(attempt + 1);
      }
      return res;
    } catch (err: unknown) {
      const isAbort = controller.signal.aborted;
      if (attempt === 0 && !init?.signal?.aborted) {
        // 网络抖动断开或超时重试一次
        await new Promise((r) => setTimeout(r, 800));
        return execute(attempt + 1);
      }
      if (isAbort && !init?.signal?.aborted) {
        throw new Error(`网络请求超时（${Math.round(timeoutMs / 1000)}秒未响应），请检查网络连接`, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  return execute(0);
}

function syncBase(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

let cachedClientId: string | null = null;
let cachedDeviceId: string | null = null;

/** 获取当前设备的唯一持久化客户端 ID，用于精准区分自身上传与跨端冲突 */
export async function getClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  try {
    let id = await db.getSetting("sync_client_id");
    if (!id) {
      id = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      await db.setSetting("sync_client_id", id);
    }
    cachedClientId = id;
    return id;
  } catch {
    if (!cachedClientId) {
      cachedClientId = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
    return cachedClientId;
  }
}

/** 获取当前设备的唯一持久化设备标识，兼顾新旧 Worker 存储与跨端识别 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const clientId = await getClientId();
  const shortId = clientId.replace(/^client_/, "").slice(-8);
  const platform = isTauri() ? "desktop" : "web";
  cachedDeviceId = `reciter-${platform}-${shortId}`;
  return cachedDeviceId;
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
  if (/429|Too Many Requests/i.test(msg)) {
    return "同步请求过于频繁（429 Too Many Requests），系统已自动降频，请稍候片刻";
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
    const [clientId, deviceId] = await Promise.all([getClientId(), getDeviceId()]);
    const res = await safeHttpFetch(`${syncBase(cfg.endpoint)}/api/sync/meta`, {
      headers: {
        "X-Sync-Token": cfg.token,
        "X-Client-Id": clientId,
        "X-Device-Id": deviceId,
      },
    }, 15000);
    if (!res.ok) {
      return {
        ok: false,
        message:
          res.status === 401
            ? "同步 Token 不正确或未填写（401 Unauthorized）"
            : res.status === 429
              ? "同步请求过于频繁（HTTP 429），系统已自动降频，请稍候"
              : `连接失败（HTTP ${res.status}）`,
        remoteUpdatedAt: null,
        localLastRemoteTime: localLastRemoteTime || null,
        localLastSyncTime: localLastSyncTime || null,
      };
    }
    const data = (await res.json()) as {
      updatedAt?: string | null;
      clientId?: string | null;
      deviceId?: string | null;
    };
    return {
      ok: true,
      remoteUpdatedAt: data.updatedAt ?? null,
      remoteClientId: data.clientId ?? null,
      remoteDeviceId: data.deviceId ?? null,
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

/** 检查推送冲突（检测云端是否存在其他设备上传的更新快照，具备 Fast-Forward 智能自愈） */
export async function checkPushConflict(): Promise<PushConflictCheck> {
  const meta = await getSyncMetaInfo();
  if (!meta.ok || !meta.remoteUpdatedAt) {
    return {
      hasConflict: false,
      remoteUpdatedAt: null,
      localLastSync: meta.localLastSyncTime,
    };
  }

  const [myClientId, myDeviceId] = await Promise.all([getClientId(), getDeviceId()]);

  // 1. 核心防自撞保护：若云端 clientId 或 deviceId 与当前设备一致，100% 确定是自身先前提交
  if (
    (meta.remoteClientId && meta.remoteClientId === myClientId) ||
    (meta.remoteDeviceId && meta.remoteDeviceId === myDeviceId)
  ) {
    await db.setSetting("sync_last_remote_time", meta.remoteUpdatedAt);
    return {
      hasConflict: false,
      remoteUpdatedAt: meta.remoteUpdatedAt,
      localLastSync: meta.localLastSyncTime,
    };
  }

  // 2. 旧版桌面端快照（desktop-win32）自愈：
  // 若云端快照是旧版桌面端标记（未存具体 deviceId），且当前是桌面端：
  // 若本地在云端快照时间点（remoteUpdatedAt）之后没有新的复习记录，直接自愈
  if (isTauri() && (meta.remoteDeviceId === "desktop-win32" || !meta.remoteDeviceId)) {
    const hasReviewsAfterRemote = await db.hasReviewsSince(meta.remoteUpdatedAt);
    if (!hasReviewsAfterRemote) {
      await db.setSetting("sync_last_remote_time", meta.remoteUpdatedAt);
      return {
        hasConflict: false,
        remoteUpdatedAt: meta.remoteUpdatedAt,
        localLastSync: meta.localLastSyncTime,
      };
    }
  }

  const remoteTime = new Date(meta.remoteUpdatedAt).getTime();

  // 如果本地有记录上次同步时的远端时间
  if (meta.localLastRemoteTime) {
    const localRemoteTime = new Date(meta.localLastRemoteTime).getTime();
    if (remoteTime > localRemoteTime) {
      // 3. 智能 Fast-Forward 探测（解决上传超时脱节或旧版本推进后的死锁假冲突）：
      // 当 remoteTime > localRemoteTime 时，不盲目报错冲突，而是探测云端快照是否属于本机的历史祖先节点
      try {
        const cfg = await getSyncConfig();
        const probeRes = await safeHttpFetch(
          `${syncBase(cfg.endpoint)}/api/sync/snapshot`,
          {
            headers: {
              "X-Sync-Token": cfg.token,
              "X-Client-Id": myClientId,
              "X-Device-Id": myDeviceId,
            },
          },
          120000
        );

        if (probeRes.ok) {
          const remoteData = (await probeRes.json()) as any;
          // 3.1 若快照内包含 clientId 且与本机一致
          if (remoteData?.clientId === myClientId) {
            await db.setSetting("sync_last_remote_time", meta.remoteUpdatedAt);
            return {
              hasConflict: false,
              remoteUpdatedAt: meta.remoteUpdatedAt,
              localLastSync: meta.localLastSyncTime,
            };
          }
          // 3.2 Fast-Forward 线性延续校验：
          const remoteLogs = Array.isArray(remoteData?.reviewLogs) ? remoteData.reviewLogs : [];
          const remoteCards = Array.isArray(remoteData?.cards) ? remoteData.cards : [];
          const remoteLatestReview = remoteLogs[remoteLogs.length - 1]?.reviewed_at;

          const localCardCount = await db.getTotalCardCount();
          let isFastForward = false;
          if (!remoteLatestReview && localCardCount >= remoteCards.length) {
            isFastForward = true;
          } else if (remoteLatestReview && localCardCount >= remoteCards.length) {
            const hasRemoteLatestInLocal = await db.hasReviewsSince(
              new Date(new Date(remoteLatestReview).getTime() - 1000).toISOString()
            );
            const localLatestReview = await db.getLatestReviewTime();
            if (
              hasRemoteLatestInLocal &&
              localLatestReview &&
              new Date(localLatestReview).getTime() >= new Date(remoteLatestReview).getTime()
            ) {
              isFastForward = true;
            }
          }

          if (isFastForward) {
            // 云端数据是本地的祖先节点，本地是 Fast-Forward 超集，安全自愈并放行！
            await db.setSetting("sync_last_remote_time", meta.remoteUpdatedAt);
            return {
              hasConflict: false,
              remoteUpdatedAt: meta.remoteUpdatedAt,
              localLastSync: meta.localLastSyncTime,
            };
          }
        }
      } catch {
        // 网络探针失败则走常规流程
      }

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

/** 上传当前完整备份到云端（带冲突拦截与状态更新，放宽至 120 秒超时） */
export async function pushSnapshot(options?: { force?: boolean }): Promise<SyncResult> {
  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    return { ok: false, message: "请先填写同步地址和 Token" };
  }

  let check: PushConflictCheck | null = null;
  // 若未强制，先检查冲突
  if (!options?.force) {
    check = await checkPushConflict();
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
    const [clientId, deviceId] = await Promise.all([getClientId(), getDeviceId()]);
    const data = await buildBackup({ clientId });
    // 过滤设备本地独立配置、AI 配置与各服务接口密钥，绝不上传到云端快照
    data.settings = (data.settings ?? []).filter((s) => !isPreservedDeviceSetting(s.key));
    const body = JSON.stringify(data);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Sync-Token": cfg.token,
      "X-Client-Id": clientId,
      "X-Device-Id": deviceId,
    };
    if (options?.force) {
      headers["X-Force"] = "true";
    } else if (check?.remoteUpdatedAt) {
      headers["X-Expected-Updated-At"] = check.remoteUpdatedAt;
    }

    const res = await safeHttpFetch(
      `${syncBase(cfg.endpoint)}/api/sync/snapshot`,
      {
        method: "PUT",
        headers,
        body,
      },
      120000 // 120 秒大体积快照专项超时
    );
    if (res.status === 409) {
      let errData: { message?: string; remoteUpdatedAt?: string | null; remoteDeviceId?: string | null } = {};
      try {
        errData = (await res.json()) as typeof errData;
      } catch {}
      return {
        ok: false,
        conflict: true,
        remoteUpdatedAt: errData.remoteUpdatedAt ?? check?.remoteUpdatedAt ?? null,
        localLastSync: check?.localLastSync ?? null,
        message: errData.message ?? "云端检测到更新的快照，若继续将覆盖云端数据，请确认。",
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        message: "同步过于频繁（HTTP 429），系统已自动降频，请稍候片刻",
      };
    }
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

    useSyncStore.getState().setSynced(updatedAt, "快照已成功同步上传至云端");

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

export interface PullSnapshotOptions {
  preserveSettings?: boolean;
}

/** 从云端下载完整备份并覆盖本地数据（带安全快照保护与向下兼容清洗，放宽至 120 秒超时） */
export async function pullSnapshot(options?: PullSnapshotOptions): Promise<SyncResult> {
  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    return { ok: false, message: "请先填写同步地址和 Token" };
  }
  try {
    const [clientId, deviceId] = await Promise.all([getClientId(), getDeviceId()]);
    const res = await safeHttpFetch(
      `${syncBase(cfg.endpoint)}/api/sync/snapshot`,
      {
        headers: {
          "X-Sync-Token": cfg.token,
          "X-Client-Id": clientId,
          "X-Device-Id": deviceId,
        },
      },
      120000 // 120 秒大体积快照专项超时
    );
    if (res.status === 404) {
      return { ok: false, message: "云端暂无快照" };
    }
    if (res.status === 429) {
      return { ok: false, message: "请求过于频繁（HTTP 429），系统已自动降频，请稍候片刻" };
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

    // 执行恢复（内部自动生成覆盖前的本地安全快照与数据清洗，安全保留本地连接凭据与同步时间戳，同步业务配置）
    const restoreRes = await restoreBackupData(rawData, {
      reason: "pre_sync",
      preserveSettings: options?.preserveSettings ?? false,
    });
    if (!restoreRes.ok) {
      return { ok: false, message: restoreRes.message };
    }

    const updatedAt = remoteHeaderTime ?? (rawData as { exportedAt?: string }).exportedAt ?? new Date().toISOString();
    await Promise.all([
      db.setSetting("sync_last_remote_time", updatedAt),
      db.setSetting("sync_last_local_time", new Date().toISOString()),
    ]);

    useSyncStore.getState().setSynced(
      updatedAt,
      `云端快照下载恢复成功（${restoreRes.decks} 词库 / ${restoreRes.cards} 卡片）`
    );

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

/** 获取是否开启自动同步学习进度（默认开启） */
export async function getAutoSyncEnabled(): Promise<boolean> {
  const v = await db.getSetting("sync_auto_enabled");
  return v !== "0";
}

/** 设置是否开启自动同步学习进度 */
export async function saveAutoSyncEnabled(enabled: boolean): Promise<void> {
  await db.setSetting("sync_auto_enabled", enabled ? "1" : "0");
}

export interface AutoPullResult {
  synced: boolean;
  message?: string;
  decks?: number;
  cards?: number;
  error?: string;
}

/**
 * 启动时静默检查并自动拉取云端新学习进度
 * - 只有当云端快照明确比本地记录更新时才自动拉取
 * - 严格保留本地独立业务与界面设置，绝不盲目覆盖本地配置
 * - 若本地在上次同步后有新增做题记录，暂停自动覆盖并提示冲突，避免丢失本地进度
 */
export async function autoPullIfRemoteNewer(): Promise<AutoPullResult> {
  const autoEnabled = await getAutoSyncEnabled();
  if (!autoEnabled) return { synced: false };

  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    useSyncStore.getState().setIsConfigured(false);
    return { synced: false };
  }
  useSyncStore.getState().setIsConfigured(true);

  try {
    const meta = await getSyncMetaInfo();
    if (!meta.ok || !meta.remoteUpdatedAt) return { synced: false };

    const [myClientId, myDeviceId] = await Promise.all([getClientId(), getDeviceId()]);
    const isSelfSnapshot =
      (meta.remoteClientId && meta.remoteClientId === myClientId) ||
      (meta.remoteDeviceId && meta.remoteDeviceId === myDeviceId) ||
      (isTauri() &&
        (meta.remoteDeviceId === "desktop-win32" || !meta.remoteDeviceId) &&
        !(await db.hasReviewsSince(meta.remoteUpdatedAt)));

    if (isSelfSnapshot) {
      // 云端最新快照是由本客户端推送或无新进度差，本地已是最新，无需重复拉取
      await db.setSetting("sync_last_remote_time", meta.remoteUpdatedAt);
      useSyncStore.getState().setSynced(meta.localLastSyncTime || meta.remoteUpdatedAt, "学习进度已是最新");
      return { synced: false };
    }

    const remoteTime = new Date(meta.remoteUpdatedAt).getTime();
    if (meta.localLastRemoteTime) {
      const localRemoteTime = new Date(meta.localLastRemoteTime).getTime();
      if (remoteTime <= localRemoteTime) {
        // 本地已是最新
        useSyncStore.getState().setSynced(meta.localLastSyncTime || meta.remoteUpdatedAt, "学习进度已是最新");
        return { synced: false };
      }
    } else {
      // 本地无上次远端时间，若本地已有卡片，不强制静默覆盖，交由用户手动确认
      const localCount = await db.getTotalCardCount();
      if (localCount > 0) {
        useSyncStore.getState().setConflict("云端检测到历史快照，请在设置页完成首次同步确认");
        return { synced: false };
      }
    }

    // 冲突安全检查：检查本地自上次同步以来是否有新的复习记录，避免覆盖本地未上传的做题进度
    const lastSyncTime = meta.localLastSyncTime || meta.localLastRemoteTime;
    if (lastSyncTime) {
      const hasLocalReviews = await db.hasReviewsSince(lastSyncTime);
      if (hasLocalReviews) {
        useSyncStore.getState().setConflict("本地有未同步的学习记录，云端亦有更新，已暂停自动覆盖，请在设置中查看");
        return { synced: false };
      }
    }

    useSyncStore.getState().setSyncing("检测到云端有新进度，正在自动拉取...");
    // 自动拉取时严格保留本地设置（preserveSettings: true），仅同步词库卡片与算法状态
    const res = await pullSnapshot({ preserveSettings: true });
    if (res.ok) {
      useSyncStore.getState().setSynced(res.updatedAt || new Date().toISOString(), "已自动拉取云端最新学习进度");
      return {
        synced: true,
        message: res.message,
        decks: res.decks,
        cards: res.cards,
      };
    }
    useSyncStore.getState().setError(res.message);
    return { synced: false, error: res.message };
  } catch (e) {
    useSyncStore.getState().setError(String(e));
    return { synced: false, error: String(e) };
  }
}

let settingsSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** 设置项变更防抖同步到云端（2.5 秒防抖） */
export function triggerSettingsSyncDebounced(delayMs = 2500): void {
  if (settingsSyncTimer) clearTimeout(settingsSyncTimer);
  settingsSyncTimer = setTimeout(() => {
    settingsSyncTimer = null;
    void autoPushIfConfigured().catch(() => {});
  }, delayMs);
}

/** 监听数据库全局设置变更并自动触发云同步钩子 */
export function initSyncHooks(): () => void {
  return db.onSettingChange((key) => {
    // 忽略无需同步的设备私有凭据与同步自身元数据
    if (!isPreservedDeviceSetting(key) && !key.startsWith("sync_")) {
      triggerSettingsSyncDebounced();
    }
  });
}

let inFlightPushPromise: Promise<SyncResult> | null = null;
let pendingPushQueued = false;
let lastPushCompletedAt = 0;
const MIN_PUSH_INTERVAL_MS = 15000; // 冷却间隔 15 秒，避免背题期间连续上传 7MB 大包导致网络塞车

/**
 * 学习完成或离开学习时自动静默推送到云端
 * - 单飞互斥队列（Single-Flight Mutex）：并发调用自动合并，绝不并发打架碰撞
 * - 智能冷却排队：若距离上次推送未满冷却期，排队防抖延迟推送
 * - 尾随重推（Trailing Push）：执行期间产生的任何新变更在完成后自动重推一次，保证最新进度零丢失
 * - 若云端有其他设备提交的更新快照，则暂缓推送，避免冲刷其他设备数据
 */
export async function autoPushIfConfigured(): Promise<SyncResult> {
  const autoEnabled = await getAutoSyncEnabled();
  if (!autoEnabled) return { ok: false, message: "自动同步已关闭" };

  const cfg = await getSyncConfig();
  if (!cfg.endpoint || !cfg.token) {
    useSyncStore.getState().setIsConfigured(false);
    return { ok: false, message: "未配置同步服务" };
  }
  useSyncStore.getState().setIsConfigured(true);

  if (inFlightPushPromise) {
    // 已有正在进行的推送，标记待重推，复用当前 promise
    pendingPushQueued = true;
    return inFlightPushPromise;
  }

  // 冷却保护：如果距离上一次全量上传成功未满冷却间隔，则排队延迟执行
  const now = Date.now();
  const timeSinceLast = now - lastPushCompletedAt;
  if (lastPushCompletedAt > 0 && timeSinceLast < MIN_PUSH_INTERVAL_MS) {
    if (!pendingPushQueued) {
      pendingPushQueued = true;
      const delay = MIN_PUSH_INTERVAL_MS - timeSinceLast;
      setTimeout(() => {
        pendingPushQueued = false;
        void autoPushIfConfigured().catch(() => {});
      }, delay);
    }
    return { ok: true, message: "推送已排队（冷却中）" };
  }

  const runPush = async (): Promise<SyncResult> => {
    useSyncStore.getState().setSyncing("正在自动同步学习进度到云端...");

    // 确保本地脏数据落盘后再生成快照
    try {
      await db.flush();
    } catch {}

    const res = await pushSnapshot({ force: false });
    lastPushCompletedAt = Date.now();
    if (res.ok) {
      useSyncStore.getState().setSynced(res.updatedAt || new Date().toISOString(), "学习进度已成功上传至云端");
    } else if (res.conflict) {
      useSyncStore.getState().setConflict(res.message);
    } else {
      useSyncStore.getState().setError(res.message);
    }
    return res;
  };

  inFlightPushPromise = (async () => {
    try {
      return await runPush();
    } finally {
      inFlightPushPromise = null;
      if (pendingPushQueued) {
        pendingPushQueued = false;
        // 延迟 600ms 触发尾随推送，避免高频无缝紧密重连
        setTimeout(() => {
          void autoPushIfConfigured().catch(() => {});
        }, 600);
      }
    }
  })();

  return inFlightPushPromise;
}
