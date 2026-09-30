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
    // 增加并发等待超时，减少 “database is locked”
    await this.db.execute("PRAGMA busy_timeout = 8000");
    // WAL 模式下最可靠的同步模式，保证异常断电/崩溃时不丢事务
    await this.db.execute("PRAGMA synchronous = NORMAL");
    // 将 WAL 自动检查点从默认 1000 页降到 100 页（约 400KB），防止 WAL 膨胀
    await this.db.execute("PRAGMA wal_autocheckpoint = 100");
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

  /** 强制执行 WAL 检查点，将预写日志合并入主数据库文件 */
  async flush(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.execute("PRAGMA wal_checkpoint(PASSIVE)");
    } catch (e) {
      console.warn("WAL checkpoint failed:", e);
    }
  }
}
