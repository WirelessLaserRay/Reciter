import Database from "@tauri-apps/plugin-sql";
import type { SQLBackend } from "./backend";

function buildTauriParamsSafe(sql: string, params: unknown[]): [string, unknown[]] {
  if (params.length === 0) return [sql, params];
  let counter = 1;
  const newSql = sql.replace(/\?/g, () => "$" + (counter++));
  return [newSql, params];
}

/** Windows/Tauri 后端：tauri-plugin-sql（原有行为，修复 ? 占位符） */
export class TauriBackend implements SQLBackend {
  readonly kind = "tauri" as const;
  private db: Database | null = null;

  async init(): Promise<void> {
    this.db = await Database.load("sqlite:reciter.db");
    // 减少并发写入时的 “database is locked”
    await this.db.execute("PRAGMA busy_timeout = 5000");
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.db) throw new Error("backend not initialized");
    const [s, p] = buildTauriParamsSafe(sql, params);
    await this.db.execute(s, p as never[]);
  }

  async select<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    if (!this.db) throw new Error("backend not initialized");
    const [s, p] = buildTauriParamsSafe(sql, params);
    return this.db.select<T>(s, p as never[]);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // tauri-plugin-sql 使用连接池，跨 execute 调用显式 BEGIN/COMMIT 容易导致
    // “database is locked”。这里直接顺序执行回调，避免锁问题。
    return fn();
  }
}
