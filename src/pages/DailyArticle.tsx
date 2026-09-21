import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-client";
import {
  fetchNewsList,
  fetchCustomNews,
  fetchArticleContent,
  getWorkerBaseUrl,
  getCustomRssSources,
  type CustomRssSource,
  type NewsItem,
  type ArticleChannel,
} from "@/lib/news";
import {
  generateArticleQuestions,
  recognizeNewWords,
  explainWord,
  translateArticle,
  getArticleTranslateEngine,
  saveArticleTranslateEngine,
  type ArticleTranslateEngine,
  getVocabStandard,
  fetchWordDefinition,
  type ArticleQuestion,
  type NewWord,
  type WordExplanation,
} from "@/lib/vocab";
import {
  BUILT_IN_SOURCES,
  loadFavorites,
  saveFavorites,
  translationSessionCache,
  type FavoriteArticle,
  type TranslationMode,
} from "./article";
import { ArticleFeedList } from "./article/ArticleFeedList";
import { ArticleReader } from "./article/ArticleReader";
import { ArticleWordSidebar } from "./article/ArticleWordSidebar";
import { ArticleQuizSection } from "./article/ArticleQuizSection";

export default function DailyArticle() {
  const [source, setSource] = useState("cgtn");
  const [topic, setTopic] = useState("");
  const [customSources] = useState<CustomRssSource[]>(() => getCustomRssSources());
  const [items, setItems] = useState<NewsItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [content, setContent] = useState("");
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState("");
  const [articleTruncated, setArticleTruncated] = useState(false);
  const [isPaywallDetected, setIsPaywallDetected] = useState(false);
  const [activeChannelLabel, setActiveChannelLabel] = useState("");
  const [archiveUrls, setArchiveUrls] = useState<{ archiveToday: string; wayback: string } | null>(null);
  const [articleChannel, setArticleChannel] = useState<ArticleChannel>("auto");

  // 全文翻译与双语对照状态
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translationMode, setTranslationMode] = useState<TranslationMode>("off");
  const [translateEngine, setTranslateEngine] = useState<ArticleTranslateEngine>("deepl");
  const [hoveredParagraph, setHoveredParagraph] = useState<number | null>(null);
  const [clickOverrides, setClickOverrides] = useState<Map<number, boolean>>(new Map());

  // 侧边栏工具：生词与测验
  const [sidebarTab, setSidebarTab] = useState<"words" | "quiz">("words");
  const [questions, setQuestions] = useState<ArticleQuestion[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<(number | null)[]>([]);
  const [showQuizAnswers, setShowQuizAnswers] = useState(false);

  const [newWords, setNewWords] = useState<NewWord[] | null>(null);
  const [manualWords, setManualWords] = useState<NewWord[]>([]);
  const [manualWordInput, setManualWordInput] = useState("");
  const [addingManualWord, setAddingManualWord] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [wordError, setWordError] = useState("");
  const [importingWords, setImportingWords] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<WordExplanation | null>(null);

  const [favorites, setFavorites] = useState<FavoriteArticle[]>(() => loadFavorites());
  const [showFavorites, setShowFavorites] = useState(false);

  const [workerOk, setWorkerOk] = useState(false);
  const [aiOk, setAiOk] = useState(false);
  const [vocabLabel, setVocabLabel] = useState("未配置");

  // 加载环境与引擎配置
  useEffect(() => {
    (async () => {
      const url = await getWorkerBaseUrl();
      setWorkerOk(Boolean(url));
      const ai = await getAIConfig().catch(() => ({ enabled: false } as { enabled: boolean }));
      setAiOk(ai.enabled);
      const vs = await getVocabStandard().catch(() => "考研" as const);
      setVocabLabel(vs === "CET4" ? "四级" : vs === "CET6" ? "六级" : vs === "专业英语" ? "专业英语" : "考研");
      const eng = await getArticleTranslateEngine().catch(() => "ai" as const);
      setTranslateEngine(eng);
    })().catch(() => {});
  }, []);

  const allSources = [
    ...BUILT_IN_SOURCES.map((s) => ({ value: s.value, label: s.label })),
    ...customSources.map((c) => ({ value: `custom:${c.id}`, label: c.name })),
  ];

  const currentBuiltIn = BUILT_IN_SOURCES.find((s) => s.value === source);
  const currentCustom = customSources.find((c) => `custom:${c.id}` === source);
  const currentTopics = source.startsWith("custom:")
    ? currentCustom?.topics ?? []
    : currentBuiltIn?.topics ?? [];

  const handleSourceChange = (newSource: string) => {
    setSource(newSource);
    const sObj = newSource.startsWith("custom:")
      ? customSources.find((c) => `custom:${c.id}` === newSource)
      : BUILT_IN_SOURCES.find((s) => s.value === newSource);
    const topics = sObj?.topics ?? [];
    setTopic(topics.length > 0 ? topics[0].id : "");
  };

  const handleTopicChange = (newTopic: string) => {
    setTopic(newTopic);
  };

  const loadNews = useCallback(async () => {
    setListLoading(true);
    setListError("");
    setPage(1);
    try {
      if (source.startsWith("custom:")) {
        const id = source.slice(7);
        const custom = customSources.find((c) => c.id === id);
        if (!custom) throw new Error("自定义源不存在");
        const urls = topic
          ? custom.topics.filter((t) => t.id === topic).map((t) => t.url)
          : custom.topics.map((t) => t.url);
        if (urls.length === 0) throw new Error("该主题无 RSS 链接");
        const res = await fetchCustomNews(custom.name, urls, 50);
        setItems(res.items);
      } else {
        const res = await fetchNewsList(source, topic || undefined, 50);
        setItems(res.items);
      }
    } catch (e) {
      setListError(String(e));
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [source, topic, customSources]);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const openArticle = async (item: NewsItem, channel: ArticleChannel = "auto") => {
    setSelected(item);
    setArticleChannel(channel);
    setContent("");
    setArticleTruncated(false);
    setArticleError("");
    setIsPaywallDetected(false);
    setQuestions(null);
    setNewWords(null);
    setManualWords([]);
    setManualWordInput("");
    setExplanation(null);
    setWordError("");
    setImportMsg("");
    setSidebarTab("words");
    setSelectedOptions([]);
    setClickOverrides(new Map());
    setHoveredParagraph(null);

    const cached = translationSessionCache.get(item.link);
    if (cached) {
      setTranslation(cached);
      setTranslationMode("all");
    } else {
      setTranslation("");
      setTranslationMode("off");
    }

    setArticleLoading(true);
    try {
      const res = await fetchArticleContent(item.link, channel);
      setContent(res.paragraphs.join("\n\n"));
      setArticleTruncated(res.isFullArticle === false && !res.isPaywallDetected);
      setIsPaywallDetected(Boolean(res.isPaywallDetected));
      setActiveChannelLabel(
        res.channelLabel ||
          (res.channel === "direct"
            ? "直连抓取"
            : res.channel === "jina"
            ? "Jina Reader"
            : res.channel === "archive_today"
            ? "Archive.today"
            : res.channel === "wayback"
            ? "Wayback 历史存档"
            : "自动优化")
      );
      if (res.archiveUrls) {
        setArchiveUrls(res.archiveUrls);
      }
    } catch (e) {
      setArticleError(String(e));
      setArchiveUrls({
        archiveToday: `https://archive.ph/newest/${encodeURIComponent(item.link)}`,
        wayback: `https://web.archive.org/web/${item.link}`,
      });
    } finally {
      setArticleLoading(false);
    }
  };

  const closeArticle = () => {
    setSelected(null);
    setContent("");
    setQuestions(null);
    setNewWords(null);
    setManualWords([]);
    setManualWordInput("");
    setExplanation(null);
    setWordError("");
    setImportMsg("");
    setTranslation("");
    setTranslationMode("off");
    setClickOverrides(new Map());
    setHoveredParagraph(null);
  };

  const handleGenerateQuestions = async () => {
    if (!content) return;
    setGenerating(true);
    setQuestionError("");
    try {
      const qs = await generateArticleQuestions(content);
      setQuestions(qs);
      setSelectedOptions(qs.map(() => null));
      setShowQuizAnswers(false);
    } catch (e) {
      setQuestionError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleRecognizeWords = async () => {
    if (!content) return;
    setRecognizing(true);
    setWordError("");
    try {
      const words = await recognizeNewWords(content);
      setNewWords(words);
    } catch (e) {
      setWordError(String(e));
    } finally {
      setRecognizing(false);
    }
  };

  const handleAddManualWord = async () => {
    const word = manualWordInput.trim();
    if (!word || addingManualWord) return;
    const exists =
      manualWords.some((w) => w.word.toLowerCase() === word.toLowerCase()) ||
      (newWords ?? []).some((w) => w.word.toLowerCase() === word.toLowerCase());
    if (exists) {
      setManualWordInput("");
      setWordError(`生词「${word}」已在列表中`);
      return;
    }
    setAddingManualWord(true);
    setWordError("");
    setImportMsg("");
    try {
      const def = await fetchWordDefinition(word);
      const newWordItem: NewWord = {
        word,
        pos: def.pos,
        meaning: def.meaning,
        example: def.example,
        exampleCn: def.exampleCn,
      };
      setManualWords((prev) => [...prev, newWordItem]);
      setManualWordInput("");

      if (def.meaning || def.example) {
        setExplanation({
          word,
          pos: def.pos,
          meaning: def.meaning,
          example: def.example || "",
          exampleCn: def.exampleCn || "",
        });
      }
    } catch {
      setManualWords((prev) => [...prev, { word, pos: "", meaning: "" }]);
      setManualWordInput("");
    } finally {
      setAddingManualWord(false);
    }
  };

  const handleRemoveWord = (wordToRemove: string) => {
    const target = wordToRemove.trim().toLowerCase();
    setNewWords((prev) => (prev ? prev.filter((w) => w.word.toLowerCase() !== target) : null));
    setManualWords((prev) => prev.filter((w) => w.word.toLowerCase() !== target));
    if (explanation && explanation.word.toLowerCase() === target) {
      setExplanation(null);
    }
    setWordError("");
  };

  const handleClearAllWords = () => {
    setNewWords([]);
    setManualWords([]);
    setExplanation(null);
    setWordError("");
    setImportMsg("已清空生词列表");
  };

  const handleExplainWord = async (word: string) => {
    setExplaining(true);
    setExplanation(null);
    try {
      const exp = await explainWord(word);
      setExplanation(exp);
    } catch (e) {
      setWordError(String(e));
    } finally {
      setExplaining(false);
    }
  };

  const isFavorite = selected ? favorites.some((f) => f.link === selected.link) : false;

  const toggleFavorite = () => {
    if (!selected) return;
    const exists = favorites.some((f) => f.link === selected.link);
    const next = exists
      ? favorites.filter((f) => f.link !== selected.link)
      : [
          {
            title: selected.title,
            link: selected.link,
            source: selected.source,
            pubDate: selected.pubDate,
            description: selected.description,
            savedAt: new Date().toISOString(),
          },
          ...favorites,
        ];
    setFavorites(next);
    saveFavorites(next);
  };

  const removeFavorite = (link: string) => {
    const next = favorites.filter((f) => f.link !== link);
    setFavorites(next);
    saveFavorites(next);
  };

  const addWordsToDeck = async (words: NewWord[]) => {
    const deckName = "每日一文生词";
    let deckId = await db.getDeckIdByName(deckName);
    if (!deckId) deckId = await db.createDeck(deckName, "每日一文阅读生词");
    for (const w of words) {
      const back = `${w.pos ? w.pos + " " : ""}${w.meaning}`.trim();
      await db.upsertCard({
        deckId,
        front: w.word,
        back: back || w.word,
        meaningPrimary: w.meaning || back,
        sourceType: "manual",
        tags: ["每日一文"],
      });
    }
    return deckId;
  };

  const allNewWords = [...manualWords, ...(newWords ?? [])];

  const importWordsToDeck = async () => {
    if (allNewWords.length === 0) return;
    setImportingWords(true);
    setImportMsg("");
    try {
      await addWordsToDeck(allNewWords);
      setImportMsg(`成功将 ${allNewWords.length} 个生词导入到「每日一文生词」词库！`);
    } catch (e) {
      setImportMsg(`导入失败: ${String(e)}`);
    } finally {
      setImportingWords(false);
    }
  };

  const importSingleWord = async (word: NewWord) => {
    setImportingWords(true);
    setImportMsg("");
    try {
      await addWordsToDeck([word]);
      setImportMsg(`已加入「${word.word}」到「每日一文生词」词库`);
    } catch (e) {
      setImportMsg(`导入失败: ${String(e)}`);
    } finally {
      setImportingWords(false);
    }
  };

  const handleTranslateArticle = async (force = false) => {
    if (!content || translating) return;
    if (!force && selected && translationSessionCache.has(selected.link)) {
      setTranslation(translationSessionCache.get(selected.link)!);
      setTranslationMode("all");
      return;
    }
    setTranslating(true);
    try {
      const zh = await translateArticle(content, translateEngine);
      setTranslation(zh);
      setTranslationMode("all");
      if (selected) {
        translationSessionCache.set(selected.link, zh);
      }
    } catch (e) {
      setArticleError(`翻译失败: ${String(e)}`);
    } finally {
      setTranslating(false);
    }
  };

  const handleEngineChange = async (engine: ArticleTranslateEngine) => {
    setTranslateEngine(engine);
    await saveArticleTranslateEngine(engine);
  };

  const handleParagraphClick = (idx: number) => {
    setClickOverrides((prev) => {
      const next = new Map(prev);
      const current = next.get(idx);
      if (current === true) {
        next.set(idx, false);
      } else {
        next.set(idx, true);
      }
      return next;
    });
  };

  const handleParagraphMouseEnter = (idx: number) => {
    if (clickOverrides.get(idx) === undefined) {
      setHoveredParagraph(idx);
    }
  };

  const handleParagraphMouseLeave = (idx: number) => {
    if (hoveredParagraph === idx) {
      setHoveredParagraph(null);
    }
  };

  const sortedItems = [...items].sort((a, b) => {
    const timeA = new Date(a.pubDate).getTime();
    const timeB = new Date(b.pubDate).getTime();
    return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
  });

  const pageSize = 15;
  const totalPages = Math.ceil(sortedItems.length / pageSize);
  const pageItems = sortedItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
            返回主页
          </Link>
        </Button>
      </div>

      {!selected ? (
        <ArticleFeedList
          workerOk={workerOk}
          aiOk={aiOk}
          vocabLabel={vocabLabel}
          source={source}
          topic={topic}
          allSources={allSources}
          currentTopics={currentTopics}
          onSourceChange={handleSourceChange}
          onTopicChange={handleTopicChange}
          showFavorites={showFavorites}
          onToggleShowFavorites={() => setShowFavorites((v) => !v)}
          favorites={favorites}
          onRemoveFavorite={removeFavorite}
          listLoading={listLoading}
          listError={listError}
          items={items}
          sortedItems={sortedItems}
          pageItems={pageItems}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onOpenArticle={(item) => void openArticle(item)}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
          <ArticleReader
            selected={selected}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onCloseArticle={closeArticle}
            archiveUrls={archiveUrls}
            articleChannel={articleChannel}
            onArticleChannelChange={(ch) => void openArticle(selected, ch)}
            activeChannelLabel={activeChannelLabel}
            articleLoading={articleLoading}
            onReloadArticle={() => void openArticle(selected, articleChannel)}
            articleError={articleError}
            isPaywallDetected={isPaywallDetected}
            articleTruncated={articleTruncated}
            content={content}
            translation={translation}
            translationMode={translationMode}
            onTranslationModeChange={(m) => {
              setTranslationMode(m);
              setClickOverrides(new Map());
              setHoveredParagraph(null);
            }}
            clickOverrides={clickOverrides}
            hoveredParagraph={hoveredParagraph}
            onParagraphClick={handleParagraphClick}
            onParagraphMouseEnter={handleParagraphMouseEnter}
            onParagraphMouseLeave={handleParagraphMouseLeave}
            translating={translating}
            onTranslateArticle={handleTranslateArticle}
            translateEngine={translateEngine}
            onEngineChange={(eng) => void handleEngineChange(eng)}
          />

          {/* 学习工具侧栏 */}
          <aside className="space-y-4 lg:sticky lg:top-0 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto pr-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">学习工具</CardTitle>
                <CardDescription>生词识别 / AI 选择题</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={sidebarTab === "words" ? "default" : "outline"}
                    onClick={() => setSidebarTab("words")}
                  >
                    生词
                  </Button>
                  <Button
                    size="sm"
                    variant={sidebarTab === "quiz" ? "default" : "outline"}
                    onClick={() => setSidebarTab("quiz")}
                  >
                    AI 出题
                  </Button>
                </div>

                {sidebarTab === "words" ? (
                  <ArticleWordSidebar
                    wordError={wordError}
                    allNewWords={allNewWords}
                    recognizing={recognizing}
                    content={content}
                    onRecognizeWords={() => void handleRecognizeWords()}
                    manualWordInput={manualWordInput}
                    onManualWordInputChange={setManualWordInput}
                    addingManualWord={addingManualWord}
                    onAddManualWord={() => void handleAddManualWord()}
                    onClearAllWords={handleClearAllWords}
                    onExplainWord={(w) => void handleExplainWord(w)}
                    onRemoveWord={handleRemoveWord}
                    importingWords={importingWords}
                    onImportWordsToDeck={() => void importWordsToDeck()}
                    importMsg={importMsg}
                    explaining={explaining}
                    explanation={explanation}
                    onImportSingleWord={(w) => void importSingleWord(w)}
                  />
                ) : (
                  <ArticleQuizSection
                    questionError={questionError}
                    questions={questions}
                    generating={generating}
                    content={content}
                    onGenerateQuestions={() => void handleGenerateQuestions()}
                    selectedOptions={selectedOptions}
                    onSelectOption={(qi, oi) =>
                      setSelectedOptions((prev) => prev.map((v, idx) => (idx === qi ? oi : v)))
                    }
                    showQuizAnswers={showQuizAnswers}
                    onToggleShowQuizAnswers={() => setShowQuizAnswers((v) => !v)}
                  />
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
