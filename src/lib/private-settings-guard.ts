import { db } from "@/lib/db";
import { isPreservedDeviceSetting } from "@/lib/backup";

export const PRIVATE_SETTINGS_MIRROR_KEY = "reciter_device_private_settings_mirror";

const memoryFallback = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryFallback.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
  } catch {}
  memoryFallback.set(key, value);
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  memoryFallback.delete(key);
}

/**
 * 获取本地私有设置的离线镜像（存放于 localStorage，非浏览器环境降级到内存）
 */
export function getPrivateSettingsMirror(): Record<string, string> {
  try {
    const raw = getStorageItem(PRIVATE_SETTINGS_MIRROR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 更新单个私有设置到离线安全镜像（仅在非空时记录更新，防止误删抹除兜底）
 */
export function syncSettingToPrivateMirror(key: string, value: string): void {
  if (!isPreservedDeviceSetting(key) || !value || !value.trim()) return;
  try {
    const mirror = getPrivateSettingsMirror();
    mirror[key] = value;
    setStorageItem(PRIVATE_SETTINGS_MIRROR_KEY, JSON.stringify(mirror));
  } catch (e) {
    console.warn("无法更新私有设置离线镜像:", e);
  }
}

/**
 * 清空离线镜像（测试/重置用）
 */
export function clearPrivateSettingsMirror(): void {
  removeStorageItem(PRIVATE_SETTINGS_MIRROR_KEY);
  memoryFallback.clear();
}

/**
 * 启动时自动检查与自愈保护：
 * 1. 若 SQLite 中缺失某项私有设置（如 ai_api_key、ai_base_url 等），而离线镜像中存在，自动自愈写回 SQLite！
 * 2. 若 SQLite 中有私有设置，而离线镜像尚未同步，自动更新离线镜像。
 */
export async function selfHealPrivateSettings(targetDb?: any): Promise<{ healedCount: number; mirroredCount: number }> {
  let healedCount = 0;
  let mirroredCount = 0;

  try {
    const database = targetDb ?? db;
    const mirror = getPrivateSettingsMirror();
    const dbSettings: { key: string; value: string }[] = await database.getAllSettings();
    const dbMap = new Map<string, string>();
    for (const s of dbSettings) {
      if (typeof s.key === "string" && typeof s.value === "string") {
        dbMap.set(s.key, s.value);
      }
    }

    // 1. 自愈写回：镜像中有值但 SQLite 中缺失或为空
    for (const [key, mirrorVal] of Object.entries(mirror)) {
      if (!isPreservedDeviceSetting(key) || !mirrorVal) continue;
      const dbVal = dbMap.get(key);
      if (!dbVal || !dbVal.trim()) {
        await database.restoreSetting(key, mirrorVal);
        dbMap.set(key, mirrorVal);
        healedCount++;
        console.info(`[SelfHealing] 自动从离线镜像自愈恢复私有配置: ${key}`);
      }
    }

    // 2. 镜像补全：SQLite 中有值但镜像中缺失
    let mirrorUpdated = false;
    for (const [key, dbVal] of dbMap.entries()) {
      if (!isPreservedDeviceSetting(key) || !dbVal || !dbVal.trim()) continue;
      if (mirror[key] !== dbVal) {
        mirror[key] = dbVal;
        mirrorUpdated = true;
        mirroredCount++;
      }
    }

    if (mirrorUpdated) {
      setStorageItem(PRIVATE_SETTINGS_MIRROR_KEY, JSON.stringify(mirror));
    }
  } catch (e) {
    console.warn("自愈私有配置检查异常:", e);
  }

  return { healedCount, mirroredCount };
}
