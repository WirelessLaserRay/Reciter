import { create } from "zustand";

interface SearchState {
  open: boolean;
  query: string;
  openSearch: (initialQuery?: string) => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  setQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  open: false,
  query: "",
  openSearch: (initialQuery?: string) =>
    set({
      open: true,
      query: initialQuery !== undefined ? initialQuery : "",
    }),
  closeSearch: () => set({ open: false }),
  toggleSearch: () => set((s) => ({ open: !s.open })),
  setQuery: (query: string) => set({ query }),
}));
