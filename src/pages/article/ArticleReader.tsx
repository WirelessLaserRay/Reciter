import {
  BookOpen,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
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
import { openExternalLink } from "@/lib/native-ui";
import { cn } from "@/lib/utils";
import type { ArticleChannel, NewsItem } from "@/lib/news";
import type { ArticleTranslateEngine } from "@/lib/vocab";
import type { TranslationMode } from "./types";

interface ArticleReaderProps {
  selected: NewsItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCloseArticle: () => void;
  archiveUrls: { archiveToday: string; wayback: string } | null;
  articleChannel: ArticleChannel;
  onArticleChannelChange: (channel: ArticleChannel) => void;
  activeChannelLabel: string;
  articleLoading: boolean;
  onReloadArticle: () => void;
  articleError: string;
  isPaywallDetected: boolean;
  articleTruncated: boolean;
  content: string;
  translation: string;
  translationMode: TranslationMode;
  onTranslationModeChange: (mode: TranslationMode) => void;
  clickOverrides: Map<number, boolean>;
  hoveredParagraph: number | null;
  onParagraphClick: (index: number) => void;
  onParagraphMouseEnter: (index: number) => void;
  onParagraphMouseLeave: (index: number) => void;
  translating: boolean;
  onTranslateArticle: (force: boolean) => void;
  translateEngine: ArticleTranslateEngine;
  onEngineChange: (engine: ArticleTranslateEngine) => void;
}

export function ArticleReader({
  selected,
  isFavorite,
  onToggleFavorite,
  onCloseArticle,
  archiveUrls,
  articleChannel,
  onArticleChannelChange,
  activeChannelLabel,
  articleLoading,
  onReloadArticle,
  articleError,
  isPaywallDetected,
  articleTruncated,
  content,
  translation,
  translationMode,
  onTranslationModeChange,
  clickOverrides,
  hoveredParagraph,
  onParagraphClick,
  onParagraphMouseEnter,
  onParagraphMouseLeave,
  translating,
  onTranslateArticle,
  translateEngine,
  onEngineChange,
}: ArticleReaderProps) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl leading-snug">{selected.title}</CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={isFavorite ? "secondary" : "outline"}
              size="sm"
              onClick={onToggleFavorite}
            >
              {isFavorite ? "已收藏" : "收藏"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCloseArticle}
              className="text-muted-foreground hover:text-foreground"
              title="关闭当前文章并清空生词队列"
            >
              关闭文章
            </Button>
          </div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
          <span>{selected.source} · {selected.pubDate}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs underline text-primary hover:opacity-80 cursor-pointer"
            onClick={() =>
              openExternalLink(selected.link, {
                title: selected.title,
                preferMode: "webview",
              })
            }
          >
            原文 <ExternalLink className="size-3" />
          </button>
          {archiveUrls && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() =>
                  openExternalLink(archiveUrls.archiveToday, {
                    title: `Archive.today - ${selected.title}`,
                    preferMode: "webview",
                  })
                }
                title="在 Archive.today 公共快照库中查看"
              >
                Archive 快照 <ExternalLink className="size-3" />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() =>
                  openExternalLink(archiveUrls.wayback, {
                    title: `Wayback Machine - ${selected.title}`,
                    preferMode: "webview",
                  })
                }
                title="在 Wayback Machine 历史档案馆中查看"
              >
                Wayback 快照 <ExternalLink className="size-3" />
              </button>
            </>
          )}
        </CardDescription>

        {/* 通道切换与重试控制栏 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">解析通道:</span>
            <Select
              value={articleChannel}
              onValueChange={(v) => onArticleChannelChange(v as ArticleChannel)}
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
            onClick={onReloadArticle}
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
                onClick={() => onArticleChannelChange("jina")}
              >
                尝试 Jina Reader
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onArticleChannelChange("archive_today")}
              >
                尝试 Archive.today 快照
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onArticleChannelChange("wayback")}
              >
                尝试 Wayback Machine
              </Button>
              {archiveUrls && (
                <button
                  type="button"
                  onClick={() =>
                    openExternalLink(archiveUrls.archiveToday, {
                      title: `Archive.today - ${selected.title}`,
                      preferMode: "webview",
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border bg-background hover:bg-accent text-foreground cursor-pointer"
                >
                  外部 Archive 打开 <ExternalLink className="size-3" />
                </button>
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
                onClick={() => onArticleChannelChange("archive_today")}
              >
                切换到 Archive.today 获取全文
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onArticleChannelChange("wayback")}
              >
                切换到 Wayback 快照
              </Button>
              {archiveUrls && (
                <button
                  type="button"
                  onClick={() =>
                    openExternalLink(archiveUrls.archiveToday, {
                      title: `Archive.today - ${selected.title}`,
                      preferMode: "webview",
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-amber-300 dark:border-amber-800 bg-background hover:bg-accent text-foreground cursor-pointer"
                >
                  外部快照查看 <ExternalLink className="size-3" />
                </button>
              )}
            </div>
          </div>
        )}
        {articleTruncated && !isPaywallDetected && (
          <p className="text-xs text-amber-600">文章过长，已截断显示前 30000 字符。</p>
        )}
        {content && (
          <div className="space-y-4">
            {translationMode !== "off" && translation ? (() => {
              const en = content.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
              const zh = translation.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
              const len = Math.max(en.length, zh.length);
              return (
                <div className="space-y-4">
                  {Array.from({ length: len }, (_, i) => {
                    const override = clickOverrides.get(i);
                    const isVisible = override !== undefined ? override : hoveredParagraph === i;
                    const isPinned = override === true;

                    return (
                      <div key={i} className="grid min-w-0 gap-3 border-b pb-3 lg:grid-cols-2">
                        {/* 英文原文 */}
                        <div className="min-w-0 p-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90 select-text">
                          {en[i] || ""}
                        </div>

                        {/* 译文 */}
                        {translationMode === "all" ? (
                          <div className="min-w-0 p-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90 select-text">
                            {zh[i] || ""}
                          </div>
                        ) : (
                          <div
                            onClick={() => onParagraphClick(i)}
                            onMouseEnter={() => onParagraphMouseEnter(i)}
                            onMouseLeave={() => onParagraphMouseLeave(i)}
                            className={cn(
                              "group relative min-w-0 h-full rounded-md p-2 transition-all cursor-pointer select-text border border-dashed",
                              isPinned
                                ? "bg-muted/50 border-primary/40 shadow-2xs"
                                : isVisible
                                  ? "bg-muted/30 border-border/80"
                                  : "border-border/60 hover:border-primary/50 hover:bg-muted/20"
                            )}
                            title={isVisible ? "点击隐藏此段译文" : "点击固定显示译文，或悬停直接查看"}
                          >
                            <div
                              className={cn(
                                "absolute inset-0 flex items-center justify-center p-2 transition-opacity duration-150 pointer-events-none",
                                isVisible ? "opacity-0" : "opacity-100"
                              )}
                            >
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-background/90 text-muted-foreground border shadow-2xs">
                                <Eye className="size-3.5 text-muted-foreground/70" />
                                悬停或点击查看译文
                              </span>
                            </div>

                            <div
                              className={cn(
                                "whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90 transition-opacity duration-150",
                                isVisible ? "opacity-100" : "opacity-0"
                              )}
                            >
                              {zh[i] || ""}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
                {content}
              </div>
            )}

            <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {!translation ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTranslateArticle(false)}
                    disabled={translating}
                  >
                    {translating ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Sparkles className="size-3.5 mr-1.5" />
                    )}
                    {translating ? "正在翻译…" : "全文翻译"}
                  </Button>
                ) : (
                  <>
                    <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs shadow-2xs">
                      <Button
                        variant={translationMode === "all" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs rounded-md"
                        onClick={() => onTranslationModeChange("all")}
                      >
                        <Eye className="size-3.5 mr-1" />
                        显示全部译文
                      </Button>
                      <Button
                        variant={translationMode === "hover" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs rounded-md"
                        onClick={() => onTranslationModeChange("hover")}
                      >
                        <EyeOff className="size-3.5 mr-1" />
                        隐藏译文
                      </Button>
                      <Button
                        variant={translationMode === "off" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs rounded-md"
                        onClick={() => onTranslationModeChange("off")}
                      >
                        <BookOpen className="size-3.5 mr-1" />
                        显示原文
                      </Button>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => onTranslateArticle(true)}
                      disabled={translating}
                      title="强制重新调用引擎翻译全文并更新缓存"
                    >
                      {translating ? (
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      ) : (
                        <RefreshCw className="size-3.5 mr-1.5" />
                      )}
                      {translating ? "正在重新翻译…" : "重新翻译"}
                    </Button>
                  </>
                )}

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0">翻译引擎：</span>
                  <Select
                    value={translateEngine}
                    onValueChange={(v) => onEngineChange(v as ArticleTranslateEngine)}
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
              </div>

              {translation && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>
                    当前引擎：
                    {translateEngine === "deepl"
                      ? "DeepL 专业翻译"
                      : translateEngine === "fallback"
                        ? "公共接口"
                        : "AI 大模型"}
                  </span>
                  <span className="text-muted-foreground/40">|</span>
                  <span>已缓存</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
