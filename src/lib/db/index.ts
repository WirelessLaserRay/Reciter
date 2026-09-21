import type { SQLBackend } from "@/lib/sql/backend";
import { TauriBackend } from "@/lib/sql/tauri-backend";
import { SqlJsBackend } from "@/lib/sql/sqljs-backend";
import { isTauri } from "@/lib/env";
import { runMigrations } from "@/lib/migrations";
import { StatsRepository } from "./stats-repo";

export * from "./types";
export * from "./helpers";
export { BaseDB } from "./base";
export { SettingsRepository } from "./settings-repo";
export { DeckRepository } from "./deck-repo";
export { CardRepository } from "./card-repo";
export { StudyRepository } from "./study-repo";
export { StatsRepository } from "./stats-repo";

export class ReciterDB extends StatsRepository {
  private readyPromise: Promise<void> | null = null;

  /**
   * 加载数据库（幂等）：Tauri 环境用 tauri-plugin-sql；Web/PWA 用 sql.js（WASM SQLite + IndexedDB）。
   * 两种后端跑完全相同的 SQL，Windows 端行为与之前完全一致。
   */
  init(backend?: SQLBackend): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        const b: SQLBackend = backend ?? (isTauri() ? new TauriBackend() : new SqlJsBackend());
        await b.init();
        if (b.kind === "sqljs") {
          // Web 端无 Rust 迁移，手动执行镜像迁移（幂等）
          await runMigrations(b);
        }
        this.backend = b;
        // 自愈兜底：确保所有 cards 均有对应的初始 card_states，避免由于历史孤立卡片导致 JOIN 查空
        try {
          await this.backend.execute(
            "INSERT OR IGNORE INTO card_states (card_id) SELECT id FROM cards"
          );
        } catch {}
        // 回填历史卡片音标（从 front/markdown 解析，仅补空值）
        await this.backfillCardPhonetics();
      })();
    }
    return this.readyPromise;
  }

  /** 强制重新初始化（测试用） */
  async reinit(): Promise<void> {
    this.readyPromise = null;
    this.backend = null;
    await this.init();
  }

  /** 数据库二进制快照（原子导入回滚用；Tauri 端返回 null 表示无需回滚） */
  snapshot(): Uint8Array | null {
    if (this.backend?.kind === "sqljs") {
      return (this.backend as import("@/lib/sql/sqljs-backend").SqlJsBackend).exportSnapshot();
    }
    return null;
  }

  /** 从快照恢复 */
  async restoreSnapshot(bytes: Uint8Array): Promise<void> {
    if (this.backend?.kind === "sqljs") {
      await (this.backend as import("@/lib/sql/sqljs-backend").SqlJsBackend).restoreSnapshot(bytes);
    }
  }

  /** 立即持久化（sql.js 防抖保存的强刷；Tauri 端无操作） */
  async flush(): Promise<void> {
    if (this.backend?.kind === "sqljs") {
      await (this.backend as import("@/lib/sql/sqljs-backend").SqlJsBackend).flush();
    }
  }
}

/** 全局单例 */
export const db = new ReciterDB();
