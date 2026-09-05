import { createStore, get, set, clear, entries } from "idb-keyval";
import type { DictionaryResult } from "./dictionary";

/** 专用于例句与翻译的持久化缓存 Store */
const cacheStore =
  typeof window !== "undefined" && window.indexedDB
    ? createStore("reciter_cache_db", "dict_examples_store")
    : undefined;

export interface CachedExampleEntry {
  result: DictionaryResult;
  updatedAt: number;
}

/**
 * 获取指定单词的持久化例句缓存
 */
export async function getCachedExample(word: string): Promise<DictionaryResult | null> {
  const key = word.trim().toLowerCase();
  if (!key || !cacheStore) return null;
  try {
    const entry = await get<CachedExampleEntry>(key, cacheStore);
    if (entry && entry.result && Array.isArray(entry.result.examples) && entry.result.examples.length > 0) {
      return entry.result;
    }
  } catch (err) {
    console.warn("读取例句缓存失败:", err);
  }
  return null;
}

/**
 * 写入单词的持久化例句缓存（仅写入有效例句的结果）
 */
export async function setCachedExample(word: string, result: DictionaryResult): Promise<void> {
  const key = word.trim().toLowerCase();
  if (!key || !cacheStore) return;
  if (!result || !result.examples || result.examples.length === 0) return;
  try {
    const entry: CachedExampleEntry = {
      result,
      updatedAt: Date.now(),
    };
    await set(key, entry, cacheStore);
  } catch (err) {
    console.warn("写入例句缓存失败:", err);
  }
}

/**
 * 获取持久化例句缓存统计信息：条数与占用大小（字节估算）
 */
export async function getExampleCacheStats(): Promise<{ count: number; sizeBytes: number }> {
  if (!cacheStore) return { count: 0, sizeBytes: 0 };
  try {
    const allEntries = await entries<string, CachedExampleEntry>(cacheStore);
    let totalSize = 0;
    for (const [k, v] of allEntries) {
      totalSize += (k.length + JSON.stringify(v).length) * 2;
    }
    return {
      count: allEntries.length,
      sizeBytes: totalSize,
    };
  } catch (err) {
    console.warn("获取例句缓存统计失败:", err);
    return { count: 0, sizeBytes: 0 };
  }
}

/**
 * 清空所有例句持久化缓存
 */
export async function clearAllExampleCache(): Promise<void> {
  if (!cacheStore) return;
  try {
    await clear(cacheStore);
  } catch (err) {
    console.warn("清空例句缓存失败:", err);
  }
}

/**
 * 格式化字节大小为可读字符串（B / KB / MB）
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
