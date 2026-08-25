import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Loader2,
  Newspaper,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { fetchNewsList, fetchArticleContent, type NewsItem } from "@/lib/news";
import {
  generateArticleQuestions,
  recognizeNewWords,
  explainWord,
  type ArticleQuestion,
  type NewWord,
  type WordExplanation,
} from "@/lib/vocab";

const SOURCES = [
  { value: "chinadaily", label: "China Daily" },
  { value: "cnn", label: "CNN" },
  { value: "reuters", label: "Reuters" },
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
  const [source, setSource] = useState("chinadaily");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [content, setContent] = useState("");
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState("");

  const [questions, setQuestions] = useState<ArticleQuestion[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [showAnswers, setShowAnswers] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [questionError, setQuestionError] = useState("");

  const [newWords, setNewWords] = useState<NewWord[] | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [wordError, setWordError] = useState("");
  const [explanation, setExplanation] = useState<WordExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);

  const [favorites, setFavorites] = useState<FavoriteArticle[]>(() => loadFavorites());
  const [importingWords, setImportingWords] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const loadList = useCallback(async (src: string) => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetchNewsList(src, 8);
      setItems(res.items);
    } catch (e) {
      setListError(String(e));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(source);
  }, [source, loadList]);

  const openArticle = async (item: NewsItem) => {
    setSelected(item);
    setContent("");
    setArticleError("");
    setQuestions(null);
    setAnswers([]);
    setShowAnswers(false);
    setNewWords(null);
    setExplanation(null);
    setArticleLoading(true);
    try {
      const res = await fetchArticleContent(item.link);
      setContent(res.content);
    } catch (e) {
      setArticleError(String(e));
    } finally {
      setArticleLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!content) return;
    setGenerating(true);
    setQuestionError("");
    try {
      const qs = await generateArticleQuestions(content, 3);
      setQuestions(qs);
      setAnswers(qs.map(() => ""));
      setShowAnswers(false);
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
      const words = await recognizeNewWords(content, 12);
      setNewWords(words);
    } catch (e) {
      setWordError(String(e));
    } finally {
      setRecognizing(false);
    }
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
      await db.upsertCard({
        deckId,
        front: w.word,
        back: `${w.pos} ${w.meaning}`,
        sourceType: "manual",
        tags: ["每日一文"],
      });
    }
    return deckName;
  };

  const importWordsToDeck = async () => {
    if (!newWords || newWords.length === 0) return;
    setImportingWords(true);
    setImportMsg("");
    try {
      const deckName = await addWordsToDeck(newWords);
      setImportMsg(`已导入 ${newWords.length} 个生词到「${deckName}」`);
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
            返回主页
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">每日一文</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="size-5 text-primary" />
            每日一文
          </CardTitle>
          <CardDescription>从主流英文媒体获取热点文章，AI 出题 + 生词识别</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {listLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {favorites.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">我的收藏</p>
              <div className="space-y-1">
                {favorites.map((f) => (
                  <div key={f.link} className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="min-w-0 truncate text-left hover:underline"
                      onClick={() => openArticle(f as NewsItem)}
                    >
                      {f.title}
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => removeFavorite(f.link)}>
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {listError && <p className="text-xs text-red-600">{listError}</p>}
          {!listLoading && items.length === 0 && !listError && (
            <p className="text-sm text-muted-foreground">暂无文章，请尝试切换来源或稍后刷新。</p>
          )}
          <div className="grid gap-2">
            {items.map((it) => (
              <Button
                key={it.link}
                variant="outline"
                className="h-auto w-full justify-start px-4 py-3 text-left"
                onClick={() => openArticle(it)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{it.source}</Badge>
                    <span>{it.pubDate}</span>
                    {it.description && <span className="truncate">{it.description}</span>}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* 文章主体 */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-xl leading-snug">{selected.title}</CardTitle>
                <Button
                  variant={isFavorite ? "secondary" : "outline"}
                  size="sm"
                  className="shrink-0"
                  onClick={toggleFavorite}
                >
                  {isFavorite ? "已收藏" : "收藏"}
                </Button>
              </div>
              <CardDescription>
                {selected.source} · {selected.pubDate}
                <a
                  className="ml-2 inline-flex items-center gap-1 text-xs underline"
                  href={selected.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  原文 <ExternalLink className="size-3" />
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {articleLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在抓取文章…
                </div>
              )}
              {articleError && <p className="text-sm text-red-600">{articleError}</p>}
              {content && (
                <div className="space-y-4">
                  <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
                    {content}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button onClick={handleGenerateQuestions} disabled={generating || !content}>
                      {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      AI 出题
                    </Button>
                    <Button variant="outline" onClick={handleRecognizeWords} disabled={recognizing || !content}>
                      {recognizing ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
                      识别生词
                    </Button>
                  </div>

                  {questionError && <p className="text-xs text-red-600">{questionError}</p>}

                  {questions && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <Sparkles className="size-4 text-purple-500" />
                        阅读理解题
                      </h3>
                      {questions.map((q, i) => (
                        <div key={i} className="space-y-2">
                          <p className="text-sm font-medium">
                            {i + 1}. {q.question}
                          </p>
                          <Textarea
                            value={answers[i] ?? ""}
                            onChange={(e) =>
                              setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))
                            }
                            placeholder="输入你的答案…"
                            rows={2}
                          />
                          {showAnswers && (
                            <p className="text-xs text-green-600">
                              参考答案：{q.answer}
                            </p>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setShowAnswers((v) => !v)}
                        >
                          {showAnswers ? "隐藏参考答案" : "查看参考答案"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 生词侧栏 */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI 生词</CardTitle>
                <CardDescription>按当前词汇标准识别</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {wordError && <p className="text-xs text-red-600">{wordError}</p>}
                {!newWords && (
                  <p className="text-xs text-muted-foreground">
                    点击「识别生词」从当前文章中提取生词。
                  </p>
                )}
                {newWords && (
                  <div className="space-y-2">
                    {newWords.map((w) => (
                      <button
                        key={w.word}
                        type="button"
                        className="flex w-full items-start justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                        onClick={() => handleExplainWord(w.word)}
                      >
                        <span className="font-medium">{w.word}</span>
                        <span className="text-xs text-muted-foreground">
                          {w.pos} {w.meaning}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {newWords && newWords.length > 0 && (
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
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
