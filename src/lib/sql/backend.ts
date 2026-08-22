/** SQL 存储后端接口：Tauri(plugin-sql) 与 Web(sql.js) 双实现 */
export interface SQLBackend {
  readonly kind: "tauri" | "sqljs";
  init(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  /** 查询；T 为完整结果类型（调用方传 Deck[] 等） */
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
  /** 在单个事务中执行回调；异常自动回滚 */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
