import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSearchStore } from "@/stores/useSearchStore";
import GlobalCardSearchView from "./GlobalCardSearchView";

export default function GlobalCardSearchDialog() {
  const { open, query, closeSearch, setQuery } = useSearchStore();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeSearch()}>
      <DialogContent className="w-full max-w-4xl p-0 gap-0 overflow-hidden border-border/70 shadow-2xl bg-background max-h-[88vh] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>全词库卡片查找</DialogTitle>
        </DialogHeader>
        <GlobalCardSearchView
          initialQuery={query}
          query={query}
          onQueryChange={setQuery}
          onClose={closeSearch}
        />
      </DialogContent>
    </Dialog>
  );
}
