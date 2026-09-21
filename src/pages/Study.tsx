import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useStudyStore } from "@/stores/useStudyStore";
import { useDeckStore } from "@/stores/useDeckStore";
import { saveLastAiTestAt } from "@/lib/study-prefs";
import { getTodayOrchestratedPlan } from "@/lib/exam-planner";
import QuizSession from "@/components/quiz/QuizSession";
import { DeckPicker, StudySession, TagScopeDialog } from "./study-flow";

export default function Study() {
  const { deckId, loading, error, loadQueue, loadOrchestratedQueue } = useStudyStore();
  const [quizDeck, setQuizDeck] = useState<{
    id: number;
    name: string;
    tag?: string;
    ai?: boolean;
    smart?: boolean;
  } | null>(null);
  const [scopeDeck, setScopeDeck] = useState<{ id: number; name: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const quizParam = searchParams.get("quiz");
  const deckParam = searchParams.get("deck");
  const tagParam = searchParams.get("tag");
  const aiParam = searchParams.get("ai");
  const smartParam = searchParams.get("smart");
  const recordParam = searchParams.get("record");

  // 直接学习入口：/study?deck=<deckId> 或 /study?deck=<deckId>&tag=<tag>
  useEffect(() => {
    if (!deckParam) return;
    const id = parseInt(deckParam, 10);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      const store = useDeckStore.getState();
      if (!store.decks.some((d) => d.id === id)) await store.refresh();
      if (cancelled) return;
      const d = useDeckStore.getState().decks.find((x) => x.id === id);
      if (d) {
        if (tagParam) {
          useStudyStore.getState().reset();
          await loadQueue(d.id, tagParam);
        } else {
          setScopeDeck({ id: d.id, name: d.name });
        }
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deckParam, tagParam, loadQueue]);

  // 测试入口：/study?quiz=<deckId>（词库详情页）；/study?quiz=<deckId>&tag=<tag>（标签巩固测试）
  useEffect(() => {
    if (!quizParam) return;
    const id = parseInt(quizParam, 10);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      const store = useDeckStore.getState();
      if (!store.decks.some((d) => d.id === id)) await store.refresh();
      if (cancelled) return;
      const d = useDeckStore.getState().decks.find((x) => x.id === id);
      if (d) {
        setQuizDeck({
          id: d.id,
          name: d.name,
          tag: tagParam ?? undefined,
          ai: aiParam === "1",
          smart: smartParam === "1",
        });
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quizParam, tagParam, aiParam, smartParam]);

  if (quizDeck) {
    return (
      <QuizSession
        deckId={quizDeck.id}
        deckName={quizDeck.name}
        presetTag={quizDeck.tag}
        defaultUseAI={quizDeck.ai ?? false}
        smart={quizDeck.smart ?? false}
        onTestComplete={() => {
          if (recordParam === "1") void saveLastAiTestAt(Date.now());
        }}
        onExit={() => {
          const taggedQuiz = !!quizDeck.tag;
          setQuizDeck(null);
          setSearchParams({}, { replace: true });
          if (taggedQuiz) useStudyStore.getState().reset();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        加载学习队列…
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (deckId === null) {
    return (
      <>
        <DeckPicker
          onStartStudy={(id: number, tag?: string, keyOnly?: boolean) => {
            useStudyStore.getState().reset();
            loadQueue(id, tag, keyOnly);
          }}
          onOpenScope={(d: { id: number; name: string }) => setScopeDeck(d)}
          onStartOrchestrated={async () => {
            const decks = useDeckStore.getState().decks;
            const plan = await getTodayOrchestratedPlan(decks).catch(() => null);
            if (!plan) return;
            useStudyStore.getState().reset();
            await loadOrchestratedQueue({
              deckIds: plan.deckIds,
              ignoredTags: plan.ignoredTags,
              targetNew: plan.targetNew,
              targetReview: plan.targetReview,
              title: `${plan.examTitle} · 今日任务`,
            });
          }}
        />

        {/* 学习范围设置轻量弹窗 */}
        <TagScopeDialog
          deck={scopeDeck}
          open={scopeDeck !== null}
          onOpenChange={(open: boolean) => {
            if (!open) setScopeDeck(null);
          }}
          onStart={(tag?: string, keyOnly?: boolean) => {
            if (!scopeDeck) return;
            const targetId = scopeDeck.id;
            setScopeDeck(null);
            useStudyStore.getState().reset();
            loadQueue(targetId, tag, keyOnly);
          }}
        />
      </>
    );
  }

  return (
    <StudySession
      onStartTagQuiz={(targetDeckId: number, tag: string) => {
        setSearchParams({ quiz: String(targetDeckId), tag }, { replace: true });
      }}
    />
  );
}
