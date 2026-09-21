import { BookOpen, Loader2, Volume2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NewWord, WordExplanation } from "@/lib/vocab";

interface ArticleWordSidebarProps {
  wordError: string;
  allNewWords: NewWord[];
  recognizing: boolean;
  content: string;
  onRecognizeWords: () => void;
  manualWordInput: string;
  onManualWordInputChange: (val: string) => void;
  addingManualWord: boolean;
  onAddManualWord: () => void;
  onClearAllWords: () => void;
  onExplainWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
  importingWords: boolean;
  onImportWordsToDeck: () => void;
  importMsg: string;
  explaining: boolean;
  explanation: WordExplanation | null;
  onImportSingleWord: (word: NewWord) => void;
}

export function ArticleWordSidebar({
  wordError,
  allNewWords,
  recognizing,
  content,
  onRecognizeWords,
  manualWordInput,
  onManualWordInputChange,
  addingManualWord,
  onAddManualWord,
  onClearAllWords,
  onExplainWord,
  onRemoveWord,
  importingWords,
  onImportWordsToDeck,
  importMsg,
  explaining,
  explanation,
  onImportSingleWord,
}: ArticleWordSidebarProps) {
  return (
    <>
      {wordError && <p className="text-xs text-red-600">{wordError}</p>}
      {allNewWords.length === 0 && (
        <p className="text-xs text-muted-foreground">
          点击「识别生词」或手动添加，将生词收录到列表。
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onRecognizeWords}
        disabled={recognizing || !content}
      >
        {recognizing ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
        识别生词
      </Button>
      <div className="flex gap-2">
        <Input
          value={manualWordInput}
          onChange={(e) => onManualWordInputChange(e.target.value)}
          placeholder="手动添加生词（自动写入释义）"
          disabled={addingManualWord}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAddManualWord();
          }}
        />
        <Button
          size="sm"
          onClick={() => void onAddManualWord()}
          disabled={!manualWordInput.trim() || addingManualWord}
        >
          {addingManualWord ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
          {addingManualWord ? "查询中" : "添加"}
        </Button>
      </div>
      {allNewWords.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5 text-xs text-muted-foreground">
            <span>生词列表 ({allNewWords.length})</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
              onClick={onClearAllWords}
            >
              清空
            </Button>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {allNewWords.map((w, i) => (
              <div
                key={w.word + i}
                className="group flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/70"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left focus:outline-none"
                  onClick={() => onExplainWord(w.word)}
                  title={`点击查看讲解: ${w.word} - ${w.pos} ${w.meaning}`}
                >
                  <div className="flex items-baseline gap-1.5 min-w-0 truncate">
                    <span className="shrink-0 font-medium text-foreground">{w.word}</span>
                  </div>
                  <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
                    {w.pos} {w.meaning}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-40 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveWord(w.word);
                  }}
                  title="删去此生词"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {allNewWords.length > 0 && (
        <Button
          size="sm"
          className="w-full"
          onClick={onImportWordsToDeck}
          disabled={importingWords}
        >
          {importingWords ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
          导入生词到词库
        </Button>
      )}
      {importMsg && <p className="text-xs text-muted-foreground">{importMsg}</p>}
      {explaining && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          正在讲解…
        </p>
      )}
      {explanation && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            {explanation.word}
            <Badge variant="secondary">{explanation.pos}</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => {
                const u = new SpeechSynthesisUtterance(explanation.word);
                window.speechSynthesis.speak(u);
              }}
              title="发音"
            >
              <Volume2 className="size-3.5" />
            </Button>
          </p>
          <p>{explanation.meaning}</p>
          <p className="text-xs text-muted-foreground">例：{explanation.example}</p>
          <p className="text-xs text-muted-foreground">译：{explanation.exampleCn}</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={importingWords}
            onClick={() =>
              onImportSingleWord({
                word: explanation.word,
                pos: explanation.pos,
                meaning: explanation.meaning,
              })
            }
          >
            {importingWords ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
            加入词库
          </Button>
        </div>
      )}
    </>
  );
}
