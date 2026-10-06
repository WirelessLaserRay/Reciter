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
      <DialogContent className="w-full max-w-[calc(100%-1rem)] sm:max-w-4xl p-0 gap-0 overflow-hidden border-border/70 shadow-2xl bg-background h-[92vh] sm:h-[85vh] sm:max-h-[760px] sm:min-h-[520px] flex flex-col rounded-xl sm:rounded-2xl">
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
