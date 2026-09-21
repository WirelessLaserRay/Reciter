import { Link } from "react-router-dom";
import { Quote, RotateCcw, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DailyQuote } from "@/lib/daily-quotes";

interface DashboardQuoteArticleProps {
  quote: DailyQuote;
  quoteRefreshing: boolean;
  onRefreshQuote: () => void;
}

export default function DashboardQuoteArticle({
  quote,
  quoteRefreshing,
  onRefreshQuote,
}: DashboardQuoteArticleProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 每日一句 */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Quote className="size-4 text-primary" />
            每日一句
            <span className="text-[10px] font-normal text-muted-foreground">
              {quote.source === "zenquotes"
                ? "ZenQuotes"
                : quote.source === "quotable"
                  ? "Quotable"
                  : "本地"}
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onRefreshQuote}
            disabled={quoteRefreshing}
          >
            <RotateCcw
              className={cn("size-3.5 mr-1", quoteRefreshing && "animate-spin")}
            />
            换一句
          </Button>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center py-2">
          <p className="text-sm font-medium italic leading-relaxed text-foreground">
            “{quote.text}”
          </p>
          {quote.translation && (
            <p className="mt-1.5 text-xs text-muted-foreground leading-normal">
              {quote.translation}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground text-right">
            — {quote.author}
          </p>
        </CardContent>
      </Card>

      {/* 每日一文 */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Newspaper className="size-4 text-primary" />
            每日一文
          </CardTitle>
          <CardDescription className="text-xs">
            精选外媒新闻源，支持 AI 出题与生词拆解
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            沉浸式精读，双语对照与生词一键加入词库
          </p>
          <Button size="sm" asChild className="shrink-0 text-xs h-8">
            <Link to="/daily-article">
              <Newspaper className="size-3.5 mr-1" />
              去阅读
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
