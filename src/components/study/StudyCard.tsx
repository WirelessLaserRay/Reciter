import { useEffect, useRef, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { speak, stopAudio } from "@/lib/tts";
import { STUDY_MODE_LABELS } from "@/lib/study-mode";
import { getAutoPronounceEnabled } from "@/lib/study-prefs";
import {
  ActiveRecallView,
  AiDrillView,
  ClassicFlipView,
  NewCardTeachView,
  QuickTestView,
  useIsMobile,
  type Distractor,
  type StudyCardProps,
} from "./card";

export type { Distractor, StudyCardProps };

/**
 * Phase 6C 多模式学习卡片：按 StudyModeConfig 分发到对应视图。
 * 父组件以 key={card_id} 渲染，卡片切换时各视图状态自动重置。
 */
export default function StudyCard(props: StudyCardProps) {
  const { config, row, onRateReadyChange } = props;
  const isMobile = useIsMobile();

  // 卡片切换卸载时复位父组件评分快捷键就绪状态，并立即打断正在播放的音频
  useEffect(() => {
    return () => {
      onRateReadyChange(false);
      stopAudio();
    };
  }, [onRateReadyChange]);

  // 学习单词时自动朗读单词（新卡教学、经典翻转、AI 深度攻克、桌面端主动回忆）
  // 移动端主动回忆正面为中文防剧透，已在揭示答案时自动朗读
  const spokenCardIdRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const cardId = row.card_id;
    if (spokenCardIdRef.current === cardId) {
      return;
    }

    const shouldSpeakOnMount =
      config.mode === "new_teach" ||
      config.mode === "classic" ||
      config.mode === "ai_drill" ||
      (config.mode === "recall" && !isMobile);

    if (shouldSpeakOnMount) {
      spokenCardIdRef.current = cardId;
      getAutoPronounceEnabled()
        .then((enabled) => {
          if (active && enabled) {
            speak(row.front);
          }
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [row.card_id, row.front, config.mode, isMobile]);

  let view: ReactNode;
  switch (config.mode) {
    case "new_teach":
      view = <NewCardTeachView {...props} />;
      break;
    case "recall":
      view = <ActiveRecallView {...props} />;
      break;
    case "quick_test":
      view = <QuickTestView {...props} />;
      break;
    case "ai_drill":
      view = <AiDrillView {...props} />;
      break;
    default:
      view = <ClassicFlipView {...props} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            config.mode === "ai_drill" && "border-amber-500/40 bg-amber-500/10 text-amber-600",
            config.mode === "new_teach" && "border-primary/30 bg-primary/5 text-primary"
          )}
        >
          {config.aiStrategy ? <Sparkles className="mr-1 inline size-2.5" /> : null}
          {STUDY_MODE_LABELS[config.mode]}
        </Badge>
      </div>
      {view}
    </div>
  );
}
