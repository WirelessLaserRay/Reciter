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

function areDecksEqual(a: Deck[], b: Deck[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const da = a[i];
    const db = b[i];
    if (
      da.id !== db.id ||
      da.name !== db.name ||
      da.new_cards_per_day !== db.new_cards_per_day ||
      da.folder !== db.folder
    ) {
      return false;
    }
  }
  return true;
}

function areCountsEqual(a: Record<number, number>, b: Record<number, number>): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[Number(k)] !== b[Number(k)]) return false;
  }
  return true;
}

export const useDeckStore = create<DeckStore>((set, get) => ({
  decks: [],
  cardCounts: {},
  loading: false,
  error: null,
  refresh: async () => {
    const current = get();
    if (current.decks.length === 0) {
      set({ loading: true, error: null });
    }
    try {
      const [decks, cardCounts] = await Promise.all([db.getDecks(), db.getDeckCardCounts()]);
      const decksSame = areDecksEqual(current.decks, decks);
      const countsSame = areCountsEqual(current.cardCounts, cardCounts);
      if (!decksSame || !countsSame || current.loading) {
        set({
          decks: decksSame ? current.decks : decks,
          cardCounts: countsSame ? current.cardCounts : cardCounts,
          loading: false,
          error: null,
        });
      }
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },
}));

