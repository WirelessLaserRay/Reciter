import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Newspaper } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbStore } from "@/stores/useDbStore";
import { db } from "@/lib/db";
import {
  getVocabStandard,
  getArticleTranslateEngine,
  saveArticleTranslateEngine,
  type VocabStandard,
  type ArticleTranslateEngine,
} from "@/lib/vocab";
import {
  getCustomRssSources,
  getArticleMaxLength,
  saveCustomRssSources,
  type CustomRssSource,
} from "@/lib/news";
import { getSyncConfig } from "@/lib/sync";
import { getDeepLCorsProxy } from "@/lib/dictionary";
import { getAIConfig } from "@/lib/ai-client";

const ARTICLE_TRANSLATE_ENGINE_OPTIONS: {
  value: ArticleTranslateEngine;
  label: string;
  tag: string;
  desc: string;
}[] = [
  {
    value: "ai",
    label: "AI 语义大模型",
    tag: "段落通顺",
    desc: "结合上下文整篇翻译，保留原文段落结构与修辞语气",
  },
  {
    value: "deepl",
    label: "DeepL 专业引擎",
    tag: "精准对照",
    desc: "专业机器翻译服务（需在下方配置有效 DeepL Key）",
  },
  {
    value: "fallback",
    label: "公共免费接口",
    tag: "分段兜底",
    desc: "MyMemory / 公共网络翻译分句兜底，开箱即用",
  },
];

interface ReadingTabProps {
  onSaved?: () => void;
}

export default function ReadingTab({ onSaved }: ReadingTabProps) {
  const dbReady = useDbStore((s) => s.ready);

  const [vocabStandard, setVocabStandard] = useState<VocabStandard>("考研");
  const [syncEndpoint, setSyncEndpoint] = useState("");
  const [deeplCorsProxy, setDeeplCorsProxy] = useState("");
  const [aiBaseURL, setAiBaseURL] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [articleMaxLength, setArticleMaxLength] = useState(30000);
  const [articleTranslateEngine, setArticleTranslateEngine] = useState<ArticleTranslateEngine>("ai");

  const [customRssSources, setCustomRssSources] = useState<CustomRssSource[]>([]);
  const [newRssName, setNewRssName] = useState("");
  const [newRssText, setNewRssText] = useState("");
  const [rssMsg, setRssMsg] = useState("");

  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [vs, aml, eng, rssList, syncCfg, dcp, aiCfg] = await Promise.all([
        getVocabStandard(),
        getArticleMaxLength(),
        getArticleTranslateEngine().catch(() => "ai" as const),
        getCustomRssSources(),
        getSyncConfig(),
        getDeepLCorsProxy(),
        getAIConfig(),
      ]);
      setVocabStandard(vs);
      setArticleMaxLength(aml);
      setArticleTranslateEngine(eng);
      setCustomRssSources(rssList);
      setSyncEndpoint(syncCfg.endpoint);
      setDeeplCorsProxy(dcp);
      setAiBaseURL(aiCfg.baseURL);
      setAiModel(aiCfg.model);
    })().catch(() => {});
  }, [dbReady]);

  const handleArticleMaxLengthChange = async (v: number) => {
    const n = Math.min(100000, Math.max(1000, v || 30000));
    setArticleMaxLength(n);
    if (!dbReady) return;
    await db.setSetting("article_max_length", String(n));
    onSaved?.();
  };

  const handleArticleEngineChange = async (eng: ArticleTranslateEngine) => {
    setArticleTranslateEngine(eng);
    if (!dbReady) return;
    await saveArticleTranslateEngine(eng);
    onSaved?.();
  };

  const handleAddCustomRss = () => {
    const name = newRssName.trim();
    if (!name) {
      setRssMsg("请填写来源名称");
      return;
    }
    const lines = newRssText.split("\n").map((s) => s.trim()).filter(Boolean);
    const topics: CustomRssSource["topics"] = [];
    for (const line of lines) {
      const sep = line.lastIndexOf("|");
      if (sep <= 0 || sep === line.length - 1) {
        setRssMsg(`无效行（应为：主题名|URL）：${line}`);
        return;
      }
      const label = line.slice(0, sep).trim();
      const url = line.slice(sep + 1).trim();
      if (!/^https?:\/\//i.test(url)) {
        setRssMsg(`无效 URL：${url}`);
        return;
      }
      topics.push({ id: "t" + topics.length + "-" + Date.now().toString(36), label, url });
    }
    if (topics.length === 0) {
      setRssMsg("请至少填写一个主题链接");
      return;
    }
    const id = "custom-" + Date.now().toString(36);
    const next = [...customRssSources, { id, name, topics }];
    setCustomRssSources(next);
    saveCustomRssSources(next);
    setNewRssName("");
    setNewRssText("");
    setRssMsg(`已添加自定义 RSS 源「${name}」`);
  };

  const handleDeleteCustomRss = (id: string) => {
    const next = customRssSources.filter((c) => c.id !== id);
    setCustomRssSources(next);
    saveCustomRssSources(next);
    setRssMsg("已删除自定义 RSS 源");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="size-4 text-primary" />
            每日一文服务与设置
          </CardTitle>
          <CardDescription>每日外刊精读抓取、生词讲解与正文展示配置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={syncEndpoint.trim() || deeplCorsProxy.trim() ? "secondary" : "destructive"}>
              Worker 代理：{syncEndpoint.trim() || deeplCorsProxy.trim() ? "已配置" : "未配置"}
            </Badge>
            <Badge variant={aiBaseURL.trim() && aiModel.trim() ? "secondary" : "destructive"}>
              AI 助读出题：{aiBaseURL.trim() && aiModel.trim() ? "已配置" : "未配置"}
            </Badge>
            <Badge variant="secondary">
              词汇基准：{vocabStandard === "CET4" ? "四级" : vocabStandard === "CET6" ? "六级" : vocabStandard === "考研" ? "考研英语" : "专业英语"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            文章抓取与全文解析依赖 Cloudflare Worker 代理；生词识别与 AI 出题使用已配置的 AI 模型。
          </p>
          <div className="flex items-center gap-2 pt-2">
            <Label htmlFor="article-max-length" className="shrink-0">文章截断字符数</Label>
            <Input
              id="article-max-length"
              type="number"
              className="w-36"
              min={1000}
              max={100000}
              value={articleMaxLength}
              onChange={(e) => handleArticleMaxLengthChange(parseInt(e.target.value, 10) || 0)}
            />
            <span className="text-sm text-muted-foreground">字符</span>
          </div>
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="article-translate-engine">默认全文翻译引擎</Label>
            <Select
              value={articleTranslateEngine}
              onValueChange={(v) => void handleArticleEngineChange(v as ArticleTranslateEngine)}
            >
              <SelectTrigger id="article-translate-engine" className="w-full sm:w-80">
                <SelectValue>
                  {(() => {
                    const cur = ARTICLE_TRANSLATE_ENGINE_OPTIONS.find((o) => o.value === articleTranslateEngine) ?? ARTICLE_TRANSLATE_ENGINE_OPTIONS[0];
                    return (
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-medium text-foreground">{cur.label}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary font-normal">
                          {cur.tag}
                        </span>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-full sm:w-80">
                {ARTICLE_TRANSLATE_ENGINE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="py-2 px-2.5">
                    <div className="flex flex-col gap-0.5 text-left w-full pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{opt.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded border border-primary/20 bg-primary/10 text-primary font-normal">
                          {opt.tag}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground leading-snug whitespace-normal break-words">
                        {opt.desc}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              每日一文点击「全文翻译」时默认调用的引擎；在阅读界面亦可随时切换或重新翻译
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/daily-article">前往「每日一文」</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" />
            自定义 RSS 订阅源
          </CardTitle>
          <CardDescription>导入私有 RSS 订阅源；可为同一媒体配置多个分类频道</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="custom-rss-name">来源媒体名称</Label>
            <Input
              id="custom-rss-name"
              value={newRssName}
              onChange={(e) => setNewRssName(e.target.value)}
              placeholder="例如：The Verge / 经济学人"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-rss-links">主题链接（每行一个：分类名|URL）</Label>
            <Textarea
              id="custom-rss-links"
              value={newRssText}
              onChange={(e) => setNewRssText(e.target.value)}
              rows={4}
              placeholder={"World|https://example.com/world.xml\nTech|https://example.com/tech.xml"}
            />
          </div>
          <Button size="sm" onClick={handleAddCustomRss}>
            添加自定义源
          </Button>
          {rssMsg && <p className="text-xs text-muted-foreground">{rssMsg}</p>}
          {customRssSources.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">已订阅的自定义源</Label>
              {customRssSources.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.topics.map((t) => t.label).join(" / ")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteCustomRss(c.id)}>
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
