import { create } from "zustand";
import { db } from "@/lib/db";
import { getSyncConfig } from "@/lib/sync";

export type SyncStateStatus = "idle" | "syncing" | "synced" | "conflict" | "error";

export interface SyncStoreState {
  status: SyncStateStatus;
  message: string | null;
  lastSyncTime: string | null;
  isConfigured: boolean;
  setSyncing: (msg?: string) => void;
  setSynced: (time: string, msg?: string) => void;
  setConflict: (msg: string) => void;
  setError: (msg: string) => void;
  setIdle: (msg?: string | null) => void;
  setIsConfigured: (cfg: boolean) => void;
}

export const useSyncStore = create<SyncStoreState>((set) => ({
  status: "idle",
  message: null,
  lastSyncTime: null,
  isConfigured: false,
  setSyncing: (msg = "正在同步...") => set({ status: "syncing", message: msg }),
  setSynced: (time, msg = "已同步至云端") =>
    set({ status: "synced", lastSyncTime: time, message: msg }),
  setConflict: (msg) => set({ status: "conflict", message: msg }),
  setError: (msg) => set({ status: "error", message: msg }),
  setIdle: (msg = null) => set({ status: "idle", message: msg }),
  setIsConfigured: (cfg) => set({ isConfigured: cfg }),
}));

/** 初始化同步状态：拉取本地配置与最近一次同步时间戳 */
export async function initSyncStore(): Promise<void> {
  try {
    const [cfg, lastLocalTime] = await Promise.all([
      getSyncConfig(),
      db.getSetting("sync_last_local_time"),
    ]);
    const configured = Boolean(cfg.endpoint && cfg.token);
    useSyncStore.setState({
      isConfigured: configured,
      lastSyncTime: lastLocalTime || null,
      status: configured ? (lastLocalTime ? "synced" : "idle") : "idle",
    });
  } catch {
    // 忽略异常
  }
}
