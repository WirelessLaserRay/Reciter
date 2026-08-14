import { create } from "zustand";
import { db } from "@/lib/db";
import type { Deck } from "@/types";

interface DeckStore {
  decks: Deck[];
  cardCounts: Record<number, number>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useDeckStore = create<DeckStore>((set) => ({
  decks: [],
  cardCounts: {},
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [decks, cardCounts] = await Promise.all([db.getDecks(), db.getDeckCardCounts()]);
      set({ decks, cardCounts, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },
}));
