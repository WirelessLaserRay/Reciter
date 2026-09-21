import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import MarkdownContext from "../MarkdownContext";
import { DictionaryExample } from "../DictionaryExample";
import type { ModeViewProps } from "./types";
import {
  CardMetaBadges,
  MeaningBlock,
  RatingButtons,
  WordBlock,
} from "./shared";

/** AI 深度攻克（弱词） */
export function AiDrillView(props: ModeViewProps) {
  const { row, config, ratingMode, preview, busy, onRate, onRateReadyChange } = props;

  useEffect(() => {
    onRateReadyChange(!busy);
  }, [busy, onRateReadyChange]);

  return (
    <div className="space-y-4">
      <div className="flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-xl border border-amber-500/30 bg-card p-8">
        <CardMetaBadges row={row} />
        <WordBlock word={row.front} phonetic={props.phonetic ?? row.phonetic} />
        <MeaningBlock row={row} className="max-w-lg text-center text-xl" />
        {config.showMarkdown && (
          <div className="w-full max-w-lg">
            <MarkdownContext markdownContent={row.markdown_content} word={row.front} />
          </div>
        )}
        <DictionaryExample word={row.front} existingMarkdown={row.markdown_content} tags={row.tags} />
        <div className="flex max-w-lg items-start gap-2 rounded-md bg-amber-500/10 p-3 text-left text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            顽固词 · 用下方 AI 助手多轮攻克，或直接手动评分
          </p>
        </div>
      </div>
      <RatingButtons ratingMode={ratingMode} preview={preview} busy={busy} onRate={onRate} />
    </div>
  );
}
