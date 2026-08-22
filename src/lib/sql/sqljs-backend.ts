import initSqlJs, { Database as SqlJsDatabase, type SqlJsStatic } from "sql.js";
import { get, set } from "idb-keyval";
import type { SQLBackend } from "./backend";

const DB_KEY = "reciter-sqljs-db";

type Factory = () => Promise<SqlJsStatic>;

/** wasm 已复制到 public/sql-wasm.wasm（相对路径在 web 部署与本地服务下均可用） */
const defaultFactory: Factory = () =>
  initSqlJs({ locateFile: () => "sql-wasm.wasm" });

/** sql.js 不接受 undefined 绑定值，统一归一化为 null（≈ SQLite NULL 语义） */
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : p));
}

/**
 * Web 后端：sql.js（WASM SQLite）跑完全相同的 SQL，
 * 每次写入后 debounce 导出数据库二进制保存到 IndexedDB（离线持久化）。
 */
export class SqlJsBackend implements SQLBackend {
  readonly kind = "sqljs" as const;
  private db: SqlJsDatabase | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private factory: Factory = defaultFactory) {}

  async init(): Promise<void> {
    const SQL = await this.factory();
    let saved: Uint8Array | null = null;
    try {
      saved = (await get<Uint8Array>(DB_KEY).catch(() => undefined)) ?? null;
    } catch {
      saved = null; // 非浏览器环境（node 测试）无 IndexedDB
    }
    this.db = saved && saved.length > 0 ? new SQL.Database(saved) : new SQL.Database();
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.db) throw new Error("backend not initialized");
    if (params.length > 0) {
      // 单条带参语句
      this.db.run(sql, normalizeParams(params) as never[]);
    } else {
      // 无参 SQL（含迁移等多语句）用 exec 全部执行
      this.db.exec(sql);
    }
    this.scheduleSave();
  }

  async select<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    if (!this.db) throw new Error("backend not initialized");
    const stmt = this.db.prepare(sql);
    try {
      if (params.length > 0) stmt.bind(normalizeParams(params) as never[]);
      const rows: unknown[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows as T;
    } finally {
      stmt.free();
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.db) throw new Error("backend not initialized");
    this.db.run("BEGIN");
    try {
      const result = await fn();
      this.db.run("COMMIT");
      this.scheduleSave();
      return result;
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  /** 写入后 300ms 去重保存到 IndexedDB */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (!this.db) return;
      const bytes = this.db.export();
      try {
        set(DB_KEY, bytes).catch(() => {});
      } catch {
        // 非浏览器环境无 IndexedDB
      }
    }, 300);
  }


  /** 当前数据库二进制快照（原子导入回滚用） */
  exportSnapshot(): Uint8Array | null {
    if (!this.db) return null;
    return this.db.export();
  }

  /** 从快照恢复（丢弃当前内存状态并覆盖 IndexedDB） */
  async restoreSnapshot(bytes: Uint8Array): Promise<void> {
    if (!this.db) throw new Error("backend not initialized");
    this.db.close();
    const SQL = await this.factory();
    this.db = new SQL.Database(bytes);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await set(DB_KEY, bytes).catch(() => {});
    } catch {
      // 非浏览器环境
    }
  }

  /** 取消待保存（供快照回滚前调用） */
  cancelPendingSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /** 立即保存（供测试/退出前调用） */
  async flush(): Promise<void> {
    if (!this.db) return;
    const bytes = this.db.export();
    try {
      await set(DB_KEY, bytes).catch(() => {});
    } catch {
      // 非浏览器环境无 IndexedDB
    }
  }
}
