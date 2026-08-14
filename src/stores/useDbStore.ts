import { create } from "zustand";
import { db } from "@/lib/db";

interface DbState {
  ready: boolean;
  error: string | null;
  init: () => Promise<void>;
}

export const useDbStore = create<DbState>((set) => ({
  ready: false,
  error: null,
  init: async () => {
    try {
      await db.init();
      set({ ready: true, error: null });
    } catch (e) {
      console.error("数据库初始化失败:", e);
      set({ ready: false, error: String(e) });
    }
  },
}));
