import Database from "@tauri-apps/plugin-sql";
import type { SQLBackend } from "./backend";

/** Windows/Tauri 后端：tauri-plugin-sql（原有行为，完全不变） */
export class TauriBackend implements SQLBackend {
  readonly kind = "tauri" as const;
  private db: Database | null = null;

  async init(): Promise<void> {
    this.db = await Database.load("sqlite:reciter.db");
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.db) throw new Error("backend not initialized");
    await this.db.execute(sql, params as never[]);
  }

  async select<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    if (!this.db) throw new Error("backend not initialized");
    return this.db.select<T>(sql, params as never[]);
  }
}
