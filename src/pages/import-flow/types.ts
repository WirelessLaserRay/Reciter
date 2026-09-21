export interface PreviewRow {
  key: string;
  deckName: string;
  folder: string;
  front: string;
  back: string;
  phonetic: string;
  markdown: string;
  sourceType: "markdown" | "csv" | "json" | "manual" | "apkg";
  tags: string[];
  isKey: boolean;
  meaningPrimary: string;
  meaningSecondary: string;
  status: "new" | "exists" | "duplicate";
  checked: boolean;
}

export type Stage = "idle" | "preview" | "importing" | "done";

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  decks: number;
}

export interface DeckTargetOption {
  deckId: number | null;
  label: string;
  folder: string;
  name: string;
}

export interface DeckTarget {
  deckId: number | null;
  label: string;
  folder: string;
  name: string;
  options: DeckTargetOption[];
}

export const ACCEPT = ".md,.markdown,.csv,.json,.txt,.apkg";
