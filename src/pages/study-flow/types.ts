export interface SessionStats {
  reviewed: number;
  newDone: number;
  again: number;
  hard: number;
  weakWords: string[];
}

export interface TagScopeDialogProps {
  deck: { id: number; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (tag?: string, keyOnly?: boolean) => void;
}
