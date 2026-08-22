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
    if (!this.db) throw new Error("backend not initialized");
    await this.db.execute("BEGIN");
    try {
      const result = await fn();
      await this.db.execute("COMMIT");
      return result;
    } catch (e) {
      await this.db.execute("ROLLBACK").catch(() => {});
      throw e;
    }
  }
}
