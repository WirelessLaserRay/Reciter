import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/db";
import { getAIConfig } from "@/lib/ai-client";
import { cn } from "@/lib/utils";
import {
  fetchNewsList,
  fetchCustomNews,
  fetchArticleContent,
  getWorkerBaseUrl,
  getCustomRssSources,
  type CustomRssSource,
  type NewsItem,
  type NewsTopic,
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

interface BuiltInSource {
  value: string;
  label: string;
  topics: NewsTopic[];
}

const BUILT_IN_SOURCES: BuiltInSource[] = [
  {
    value: "cgtn",
    label: "CGTN",
    topics: [
      { id: "world", label: "World", url: "https://www.cgtn.com/subscribe/rss/section/world.xml" },
      { id: "opinion", label: "Opinion", url: "https://www.cgtn.com/subscribe/rss/section/opinion.xml" },
      { id: "tech-sci", label: "Tech/Sci", url: "https://www.cgtn.com/subscribe/rss/section/tech-sci.xml" },
      { id: "culture", label: "Culture", url: "https://www.cgtn.com/subscribe/rss/section/culture.xml" },
    ],
  },
  {
    value: "cnn",
    label: "CNN",
    topics: [{ id: "edition", label: "Edition", url: "http://rss.cnn.com/rss/edition.rss" }],
  },
  {
    value: "guardian",
    label: "The Guardian",
    topics: [
      { id: "world", label: "World", url: "https://www.theguardian.com/world/rss" },
      { id: "technology", label: "Technology", url: "https://www.theguardian.com/technology/rss" },
      { id: "environment", label: "Environment", url: "https://www.theguardian.com/environment/rss" },
    ],
  },
  {
    value: "npr",
    label: "NPR",
    topics: [
      { id: "top-stories", label: "Top Stories", url: "https://feeds.npr.org/1001/rss.xml" },
      { id: "science", label: "Science", url: "https://feeds.npr.org/1007/rss.xml" },
    ],
  },
  {
    value: "bbc",
    label: "BBC",
    topics: [
      { id: "world", label: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
      { id: "science", label: "Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
      { id: "technology", label: "Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    ],
  },
];

interface FavoriteArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description?: string;
  savedAt: string;
}

const FAVORITES_KEY = "reciter-favorite-articles";

/** 去掉 AI 返回选项里可能自带的前缀字母（A. / B) / C、等），避免重复显示 ABCD */
function cleanOption(opt: string): string {
  return opt.replace(/^[A-Da-d]\s*[.)、:：]\s*/, "").trim();
}

function loadFavorites(): FavoriteArticle[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as FavoriteArticle[];
  } catch {
    return [];
  }
}

function saveFavorites(list: FavoriteArticle[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

export default function DailyArticle() {
  const [source, setSource] = useState("cgtn");
  const [topic, setTopic] = useState("");
  const [customSources] = useState<CustomRssSource[]>(() => getCustomRssSources());
  const [items, setItems] = useState<NewsItem[]>([]);
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [content, setContent] = useState("");
  const [articleTruncated, setArticleTruncated] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState("");
  const [articleChannel, setArticleChannel] = useState<ArticleChannel>("auto");
  const [activeChannelLabel, setActiveChannelLabel] = useState<string>("");
  const [isPaywallDetected, setIsPaywallDetected] = useState(false);
  const [archiveUrls, setArchiveUrls] = useState<{ archiveToday: string; wayback: string } | null>(null);

  const [questions, setQuestions] = useState<ArticleQuestion[] | null>(null);

  const [generating, setGenerating] = useState(false);
  const [questionError, setQuestionError] = useState("");

  const [newWords, setNewWords] = useState<NewWord[] | null>(null);
  const [manualWords, setManualWords] = useState<NewWord[]>([]);
  const [manualWordInput, setManualWordInput] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [wordError, setWordError] = useState("");
  const [explanation, setExplanation] = useState<WordExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);

  const [favorites, setFavorites] = useState<FavoriteArticle[]>(() => loadFavorites());
  const [showFavorites, setShowFavorites] = useState(false);
  const [importingWords, setImportingWords] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const [sidebarTab, setSidebarTab] = useState<"words" | "quiz">("words");
  const [selectedOptions, setSelectedOptions] = useState<(number | null)[]>([]);
  const [showQuizAnswers, setShowQuizAnswers] = useState(false);
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translateEngine, setTranslateEngine] = useState<ArticleTranslateEngine>("ai");
  const [workerOk, setWorkerOk] = useState(false);
  const [aiOk, setAiOk] = useState(false);
  const [vocabLabel, setVocabLabel] = useState("考研");

  const loadList = useCallback(async (src: string, selectedTopic?: string) => {
    setListLoading(true);
    setListError("");
    try {
      if (src.startsWith("custom:")) {
        const custom = customSources.find((c) => c.id === src.slice("custom:".length));
        if (!custom) throw new Error("自定义源不存在");
        const urls = selectedTopic
          ? custom.topics.filter((t) => t.id === selectedTopic).map((t) => t.url)
          : custom.topics.map((t) => t.url);
        if (urls.length === 0) throw new Error("该主题无 RSS 链接");
        const res = await fetchCustomNews(custom.name, urls, 50);
        setItems(res.items);
        setPage(1);
      } else {
        const res = await fetchNewsList(src, selectedTopic || undefined, 50);
        setItems(res.items);
        setPage(1);
      }
    } catch (e) {
      setListError(String(e));
    } finally {
      setListLoading(false);
    }
  }, [customSources]);

  useEffect(() => {
    void loadList(source, topic);
  }, [source, topic, loadList]);

  // 加载每日一文所需设置状态
  useEffect(() => {
    (async () => {
      const base = await getWorkerBaseUrl().catch(() => "");
      setWorkerOk(!!base);
      const ai = await getAIConfig().catch(() => ({ enabled: false } as { enabled: boolean }));
      setAiOk(ai.enabled);
      const vs = await getVocabStandard().catch(() => "考研" as "考研");
      setVocabLabel(vs === "CET4" ? "四级" : vs === "CET6" ? "六级" : vs === "专业英语" ? "专业英语" : "考研");
      const eng = await getArticleTranslateEngine().catch(() => "ai" as const);
      setTranslateEngine(eng);
    })().catch(() => {});

    return () => {
      // 离开每日一文页面时自动清空生词添加队列
      setManualWords([]);
      setNewWords(null);
      setExplanation(null);
    };
  }, []);

  const closeArticle = () => {
    setSelected(null);
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
    setTranslation("");
  };

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
    setTranslation("");
    setArticleLoading(true);
    try {
      const res = await fetchArticleContent(item.link, channel);
      setContent(res.paragraphs.join("\n\n"));
      setArticleTruncated(res.isFullArticle === false && !res.isPaywallDetected);
      setIsPaywallDetected(!!res.isPaywallDetected);
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

  const [addingManualWord, setAddingManualWord] = useState(false);

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

      // 顺带呈现下方讲解面板供预览
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
      : [{ title: selected.title, link: selected.link, source: selected.source, pubDate: selected.pubDate, description: selected.description, savedAt: new Date().toISOString() }, ...favorites];
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
    return deckName;
  };

  const importWordsToDeck = async () => {
    if (allNewWords.length === 0) return;
    setImportingWords(true);
    setImportMsg("");
    try {
      const deckName = await addWordsToDeck(allNewWords);
      setImportMsg(`已导入 ${allNewWords.length} 个生词到「${deckName}」`);
    } catch (e) {
      setImportMsg(String(e));
    } finally {
      setImportingWords(false);
    }
  };

  const importSingleWord = async (w: NewWord) => {
    setImportingWords(true);
    setImportMsg("");
    try {
      const deckName = await addWordsToDeck([w]);
      setImportMsg(`已导入「${w.word}」到「${deckName}」`);
    } catch (e) {
      setImportMsg(String(e));
    } finally {
      setImportingWords(false);
    }
  };

  const handleEngineChange = async (eng: ArticleTranslateEngine) => {
    setTranslateEngine(eng);
    await saveArticleTranslateEngine(eng);
  };

  const handleTranslateArticle = async () => {
    if (!content) return;
    setTranslating(true);
    setWordError("");
    try {
      const t = await translateArticle(content, translateEngine);
      setTranslation(t);
    } catch (e) {
      setWordError(String(e));
    } finally {
      setTranslating(false);
    }
  };

  const allSources = [
    ...BUILT_IN_SOURCES.map((s) => ({ value: s.value, label: s.label })),
    ...customSources.map((c) => ({ value: `custom:${c.id}`, label: c.name })),
  ];
  const currentBuiltIn = BUILT_IN_SOURCES.find((s) => s.value === source);
  const currentCustom = customSources.find((c) => `custom:${c.id}` === source);
  const currentTopics = source.startsWith("custom:")
    ? currentCustom?.topics ?? []
    : currentBuiltIn?.topics ?? [];

  const allNewWords = [...(newWords ?? []), ...manualWords];

  const pageSize = 10;
  const timeOf = (s: string) => {
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const sortedItems = [...items].sort((a, b) =>
    sortOrder === "desc" ? timeOf(b.pubDate) - timeOf(a.pubDate) : timeOf(a.pubDate) - timeOf(b.pubDate)
  );
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const pageItems = sortedItems.slice((page - 1) * pageSize, page * pageSize);

  const handleSourceChange = (v: string) => {
    setSource(v);
    setTopic("");
    closeArticle();
  };

  const handleTopicChange = (v: string) => {
    setTopic(v);
    closeArticle();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">每日一文</h2>
          <p className="text-sm text-muted-foreground">CGTN / CNN / Guardian / NPR / BBC + 自定义 RSS</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
            返回主页
          </Link>
        </Button>
      </div>

      <Card className={(!workerOk || !aiOk) ? "border-amber-500/40" : ""}>
        <CardHeader>
          <CardTitle className="text-base">每日一文所需设置</CardTitle>
          <CardDescription>以下配置影响文章获取、AI 出题、生词识别与全文翻译</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={workerOk ? "secondary" : "destructive"}>
            Worker 地址：{workerOk ? "已配置" : "未配置"}
          </Badge>
          <Badge variant={aiOk ? "secondary" : "destructive"}>
            AI 接口：{aiOk ? "已配置" : "未配置"}
          </Badge>
          <Badge variant="secondary">词汇标准：{vocabLabel}</Badge>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings">去设置</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="size-5 text-primary" />
            每日一文
          </CardTitle>
          <CardDescription>CGTN / CNN / Guardian / NPR / BBC + 自定义 RSS，AI 出题 + 生词识别</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={source} onValueChange={handleSourceChange}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="选择新闻源">
                  {allSources.find((s) => s.value === source)?.label ?? "选择新闻源"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-56 max-h-72">
                {allSources.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="py-2">
                    <span className="font-medium text-sm">{s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentTopics.length > 1 && (
              <Select value={topic} onValueChange={handleTopicChange}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="全部主题">
                    {currentTopics.find((t) => t.id === topic)?.label || "全部主题"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="w-48 max-h-64">
                  <SelectItem value="" className="py-2">
                    <span className="font-medium text-sm">全部主题</span>
                  </SelectItem>
                  {currentTopics.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="py-2">
                      <span className="text-sm">{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              variant={showFavorites ? "secondary" : "outline"}
              onClick={() => setShowFavorites((v) => !v)}
            >
              收藏夹
            </Button>
            {listLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {showFavorites ? (
            <div className="space-y-2">
              {favorites.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无收藏文章。</p>
              ) : (
                favorites.map((f) => (
                  <div
                    key={f.link}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:underline text-foreground"
                      onClick={() => openArticle(f as NewsItem)}
                      title={f.title}
                    >
                      {f.title}
                    </button>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => removeFavorite(f.link)}>
                      移除
                    </Button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {listError && <p className="text-xs text-red-600">{listError}</p>}
              {!listLoading && items.length === 0 && !listError && (
                <p className="text-sm text-muted-foreground">暂无文章，请尝试切换来源或稍后刷新。</p>
              )}
              {items.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">共 {sortedItems.length} 条</span>
                  <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "desc" | "asc")}>
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue placeholder="排序方式">
                        {sortOrder === "desc" ? "最新优先" : "最早优先"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-32">
                      <SelectItem value="desc" className="py-1.5 text-xs">
                        最新优先
                      </SelectItem>
                      <SelectItem value="asc" className="py-1.5 text-xs">
                        最早优先
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                {pageItems.map((it) => (
                  <Button
                    key={it.link}
                    variant="outline"
                    className="group h-auto w-full min-w-0 justify-start px-4 py-3 text-left whitespace-normal overflow-hidden hover:bg-accent/60"
                    onClick={() => openArticle(it)}
                  >
                    <div className="w-full min-w-0 overflow-hidden space-y-1">
                      <div className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors" title={it.title}>
                        {it.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="shrink-0">{it.source}</Badge>
                        <span className="shrink-0">{it.pubDate}</span>
                      </div>
                      {it.description && (
                        <p className="w-full truncate text-xs text-muted-foreground/80 leading-normal" title={it.description}>
                          {it.description}
                        </p>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    上一页
                  </Button>
                  <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    下一页
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
          {/* 文章主体 */}
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-xl leading-snug">{selected.title}</CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant={isFavorite ? "secondary" : "outline"}
                    size="sm"
                    onClick={toggleFavorite}
                  >
                    {isFavorite ? "已收藏" : "收藏"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeArticle}
                    className="text-muted-foreground hover:text-foreground"
                    title="关闭当前文章并清空生词队列"
                  >
                    关闭文章
                  </Button>
                </div>
              </div>
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
                <span>{selected.source} · {selected.pubDate}</span>
                <a
                  className="inline-flex items-center gap-1 text-xs underline text-primary hover:opacity-80"
                  href={selected.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  原文 <ExternalLink className="size-3" />
                </a>
                {archiveUrls && (
                  <>
                    <a
                      className="inline-flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground"
                      href={archiveUrls.archiveToday}
                      target="_blank"
                      rel="noreferrer"
                      title="在 Archive.today 公共快照库中查看"
                    >
                      Archive 快照 <ExternalLink className="size-3" />
                    </a>
                    <a
                      className="inline-flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground"
                      href={archiveUrls.wayback}
                      target="_blank"
                      rel="noreferrer"
                      title="在 Wayback Machine 历史档案馆中查看"
                    >
                      Wayback 快照 <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
              </CardDescription>

              {/* 通道切换与重试控制栏 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">解析通道:</span>
                  <Select
                    value={articleChannel}
                    onValueChange={(v) => {
                      const next = v as ArticleChannel;
                      setArticleChannel(next);
                      void openArticle(selected, next);
                    }}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue placeholder="选择解析通道" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto" className="text-xs">自动级联优化</SelectItem>
                      <SelectItem value="direct" className="text-xs">原站直连</SelectItem>
                      <SelectItem value="jina" className="text-xs">Jina Reader</SelectItem>
                      <SelectItem value="archive_today" className="text-xs">Archive.today 快照</SelectItem>
                      <SelectItem value="wayback" className="text-xs">Wayback 历史存档</SelectItem>
                    </SelectContent>
                  </Select>
                  {activeChannelLabel && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      当前: {activeChannelLabel}
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void openArticle(selected, articleChannel)}
                  disabled={articleLoading}
                >
                  <RefreshCw className={cn("size-3 mr-1", articleLoading && "animate-spin")} />
                  重新解析
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {articleLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在通过 {articleChannel === "auto" ? "多网关自动级联" : activeChannelLabel || articleChannel} 抓取文章…
                </div>
              )}
              {articleError && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20 p-3 text-sm space-y-2">
                  <p className="text-red-700 dark:text-red-400 font-medium">文章解析遇到问题：{articleError}</p>
                  <p className="text-xs text-muted-foreground">
                    该文章可能由于源站反爬严格或付费墙限制导致当前通道解析失败。您可以尝试切换解析通道或通过公共快照直达：
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void openArticle(selected, "jina")}
                    >
                      尝试 Jina Reader
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void openArticle(selected, "archive_today")}
                    >
                      尝试 Archive.today 快照
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void openArticle(selected, "wayback")}
                    >
                      尝试 Wayback Machine
                    </Button>
                    {archiveUrls && (
                      <a
                        href={archiveUrls.archiveToday}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border bg-background hover:bg-accent text-foreground"
                      >
                        外部 Archive 打开 <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
              {isPaywallDetected && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium text-sm">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>检测到该文章可能存在付费墙或全文截断</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    当前内容可能仅包含导语或受限预览。建议尝试切换至 Archive.today 或 Wayback 快照通道重新获取未受限全文：
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-900 dark:text-amber-200"
                      onClick={() => void openArticle(selected, "archive_today")}
                    >
                      切换到 Archive.today 获取全文
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void openArticle(selected, "wayback")}
                    >
                      切换到 Wayback 快照
                    </Button>
                    {archiveUrls && (
                      <a
                        href={archiveUrls.archiveToday}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-amber-300 dark:border-amber-800 bg-background hover:bg-accent text-foreground"
                      >
                        外部快照浏览器查看 <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
              {articleTruncated && !isPaywallDetected && (
                <p className="text-xs text-amber-600">文章过长，已截断显示前 30000 字符。</p>
              )}
              {content && (
                <div className="space-y-4">
                  {translation ? (() => {
                    const en = content.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
                    const zh = translation.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
                    const len = Math.max(en.length, zh.length);
                    return (
                      <div className="space-y-4">
                        {Array.from({ length: len }, (_, i) => (
                          <div key={i} className="grid min-w-0 gap-2 border-b pb-3 lg:grid-cols-2">
                            <div className="min-w-0 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90">
                              {en[i] || ""}
                            </div>
                            <div className="min-w-0 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90">
                              {zh[i] || ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })() : (
                    <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
                      {content}
                    </div>
                  )}
                  <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTranslateArticle}
                        disabled={translating}
                      >
                        {translating ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Sparkles className="size-3.5 mr-1.5" />}
                        {translating ? "正在翻译…" : translation ? "重新翻译" : "全文翻译"}
                      </Button>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="shrink-0">翻译引擎：</span>
                        <Select
                          value={translateEngine}
                          onValueChange={(v) => void handleEngineChange(v as ArticleTranslateEngine)}
                          disabled={translating}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue placeholder="翻译引擎">
                              {translateEngine === "ai"
                                ? "AI 大模型"
                                : translateEngine === "deepl"
                                  ? "DeepL 翻译"
                                  : "公共接口兜底"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="w-40">
                            <SelectItem value="ai" className="py-1.5 text-xs">
                              AI 大模型
                            </SelectItem>
                            <SelectItem value="deepl" className="py-1.5 text-xs">
                              DeepL 翻译
                            </SelectItem>
                            <SelectItem value="fallback" className="py-1.5 text-xs">
                              公共接口兜底
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {translation && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setTranslation("")}
                        >
                          隐藏译文
                        </Button>
                      )}
                    </div>

                    {translation && (
                      <span className="text-[11px] text-muted-foreground">
                        当前引擎：{translateEngine === "deepl" ? "DeepL 专业翻译" : translateEngine === "fallback" ? "公共接口" : "AI 大模型"}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 学习工具侧栏（随页面滚动固定在右上，且内部支持独立滚轮滑动） */}
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
                      onClick={handleRecognizeWords}
                      disabled={recognizing || !content}
                    >
                      {recognizing ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
                      识别生词
                    </Button>
                    <div className="flex gap-2">
                      <Input
                        value={manualWordInput}
                        onChange={(e) => setManualWordInput(e.target.value)}
                        placeholder="手动添加生词（自动写入释义）"
                        disabled={addingManualWord}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAddManualWord();
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => void handleAddManualWord()}
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
                            onClick={handleClearAllWords}
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
                                onClick={() => handleExplainWord(w.word)}
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
                                  handleRemoveWord(w.word);
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
                        onClick={importWordsToDeck}
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
                            importSingleWord({
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
                ) : (
                  <>
                    {questionError && <p className="text-xs text-red-600">{questionError}</p>}
                    {!questions && (
                      <p className="text-xs text-muted-foreground">
                        点击「AI 出题」生成阅读理解选择题。
                      </p>
                    )}
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleGenerateQuestions}
                      disabled={generating || !content}
                    >
                      {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      AI 出题
                    </Button>

                    {questions &&
                      questions.map((q, i) => (
                        <div key={i} className="space-y-2 rounded-md border p-3">
                          <p className="text-sm font-medium">
                            {i + 1}. {q.question}
                          </p>
                          <div className="grid gap-1.5">
                            {q.options.map((opt, oi) => {
                              const isSelected = selectedOptions[i] === oi;
                              const isCorrect = q.answer.trim().toUpperCase() === "ABCD"[oi];
                              return (
                                <Button
                                  key={oi}
                                  size="sm"
                                  variant="outline"
                                  className={cn(
                                    "h-auto min-h-9 w-full justify-start whitespace-normal break-words px-3 py-2 text-left leading-relaxed transition-all",
                                    showQuizAnswers
                                      ? isCorrect
                                        ? "border-emerald-600 bg-emerald-600 text-white font-medium hover:bg-emerald-600 shadow-sm"
                                        : isSelected
                                        ? "border-destructive bg-destructive text-destructive-foreground font-medium hover:bg-destructive shadow-sm"
                                        : "opacity-60 hover:opacity-100"
                                      : isSelected
                                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-md ring-2 ring-primary/30 hover:bg-primary/95"
                                      : "hover:bg-accent/70 text-foreground"
                                  )}
                                  onClick={() =>
                                    setSelectedOptions((prev) =>
                                      prev.map((v, idx) => (idx === i ? oi : v))
                                    )
                                  }
                                >
                                  {String.fromCharCode(65 + oi)}. {cleanOption(opt)}
                                </Button>
                              );
                            })}
                          </div>
                          {showQuizAnswers && (
                            <div className="space-y-1 text-xs">
                              <p className="text-green-600 font-medium">
                                答案：{q.answer}. {cleanOption(q.options["ABCD".indexOf(q.answer.toUpperCase())] ?? q.answer)}
                              </p>
                              <p className="text-muted-foreground">解析：{q.explanation}</p>
                            </div>
                          )}
                        </div>
                      ))}

                    {questions && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => setShowQuizAnswers((v) => !v)}
                      >
                        {showQuizAnswers ? "隐藏答案解析" : "查看答案解析"}
                      </Button>
                    )}

                  </>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
