import { Link } from "react-router-dom";
import {
  Loader2,
  Newspaper,
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
import type { NewsItem, NewsTopic } from "@/lib/news";
import type { FavoriteArticle } from "./types";

interface ArticleFeedListProps {
  workerOk: boolean;
  aiOk: boolean;
  vocabLabel: string;
  source: string;
  topic: string;
  allSources: { value: string; label: string }[];
  currentTopics: NewsTopic[];
  onSourceChange: (val: string) => void;
  onTopicChange: (val: string) => void;
  showFavorites: boolean;
  onToggleShowFavorites: () => void;
  favorites: FavoriteArticle[];
  onRemoveFavorite: (link: string) => void;
  listLoading: boolean;
  listError: string;
  items: NewsItem[];
  sortedItems: NewsItem[];
  pageItems: NewsItem[];
  sortOrder: "desc" | "asc";
  onSortOrderChange: (val: "desc" | "asc") => void;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onOpenArticle: (item: NewsItem) => void;
}

export function ArticleFeedList({
  workerOk,
  aiOk,
  vocabLabel,
  source,
  topic,
  allSources,
  currentTopics,
  onSourceChange,
  onTopicChange,
  showFavorites,
  onToggleShowFavorites,
  favorites,
  onRemoveFavorite,
  listLoading,
  listError,
  items,
  sortedItems,
  pageItems,
  sortOrder,
  onSortOrderChange,
  page,
  totalPages,
  onPageChange,
  onOpenArticle,
}: ArticleFeedListProps) {
  return (
    <>
      <Card className={!workerOk || !aiOk ? "border-amber-500/40" : ""}>
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
            <Select value={source} onValueChange={onSourceChange}>
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
              <Select value={topic} onValueChange={onTopicChange}>
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
              onClick={onToggleShowFavorites}
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
                      onClick={() => onOpenArticle(f as NewsItem)}
                      title={f.title}
                    >
                      {f.title}
                    </button>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onRemoveFavorite(f.link)}>
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
                  <Select value={sortOrder} onValueChange={(v) => onSortOrderChange(v as "desc" | "asc")}>
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
                    onClick={() => onOpenArticle(it)}
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
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
                    上一页
                  </Button>
                  <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>
                    下一页
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
