import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  ExternalLink,
  Eye,
  Globe,
  GraduationCap,
  Layers,
  Link as LinkIcon,
  Loader2,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HUB_DECKS,
  OPEN_PLATFORMS,
  importHubDeck,
  importFromCustomUrl,
  type HubCategory,
  type HubDeckMeta,
  type OpenPlatformResource,
} from "@/lib/deck-hub";
import { openExternalLink, showNativeAlert } from "@/lib/native-ui";
import { useDeckStore } from "@/stores/useDeckStore";
import { cn } from "@/lib/utils";

const CATEGORIES: { key: HubCategory; label: string }[] = [
  { key: "all", label: "全部资源" },
  { key: "anki_hub", label: "Anki 记忆库" },
  { key: "exam", label: "考研与升学" },
  { key: "study_abroad", label: "出国留学" },
  { key: "general", label: "权威通用" },
  { key: "major", label: "专业行业" },
];

export default function DeckHub() {
  const navigate = useNavigate();
  const existingDecks = useDeckStore((s) => s.decks);

  const [activeCategory, setActiveCategory] = useState<HubCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewDeck, setPreviewDeck] = useState<HubDeckMeta | null>(null);

  // 开放平台生态折叠区
  const [showPlatforms, setShowPlatforms] = useState(true);

  // 自定义直链导入对话框
  const [showCustomUrlDialog, setShowCustomUrlDialog] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [customDeckName, setCustomDeckName] = useState("");
  const [customImporting, setCustomImporting] = useState(false);
  const [customProgress, setCustomProgress] = useState("");

  // 记录每个词库的导入中状态与导入成功结果
  const [importingId, setImportingId] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [importSuccess, setImportSuccess] = useState<{
    [deckId: string]: { deckId: number; name: string; count: number };
  }>({});

  // 筛选词库
  const filteredDecks = useMemo(() => {
    return HUB_DECKS.filter((deck) => {
      // 分类过滤
      if (activeCategory !== "all" && deck.category !== activeCategory) {
        return false;
      }
      // 搜索过滤
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = deck.name.toLowerCase().includes(q);
        const matchDesc = deck.description.toLowerCase().includes(q);
        const matchTags = deck.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchTags) return false;
      }
      return true;
    });
  }, [activeCategory, searchQuery]);

  // 检查是否已导入过该名称的词库
  const isAlreadyImported = (name: string) => {
    return existingDecks.some((d) => d.name.trim() === name.trim());
  };

  // 执行下载/导入官方/精选词库
  const handleImport = async (meta: HubDeckMeta) => {
    setImportingId(meta.id);
    setProgressMsg("准备获取词库数据...");
    try {
      const res = await importHubDeck(meta, (msg) => setProgressMsg(msg));
      setImportSuccess((prev) => ({ ...prev, [meta.id]: res }));
      await showNativeAlert(
        `词库【${res.name}】已成功导入！\n\n共写入 ${res.count.toLocaleString()} 张卡片，已就绪可随时开始学习。`,
        { title: "词库导入成功", kind: "info" }
      );
    } catch (err) {
      await showNativeAlert(
        `导入词库【${meta.name}】失败。\n\n原因: ${(err as Error).message}`,
        { title: "词库导入失败", kind: "error" }
      );
    } finally {
      setImportingId(null);
      setProgressMsg("");
    }
  };

  // 执行自定义链接导入
  const handleCustomImport = async () => {
    if (!customUrl.trim()) return;
    setCustomImporting(true);
    setCustomProgress("正在连接资源地址...");
    try {
      const res = await importFromCustomUrl(customUrl, customDeckName, (msg) =>
        setCustomProgress(msg)
      );
      setShowCustomUrlDialog(false);
      setCustomUrl("");
      setCustomDeckName("");
      await showNativeAlert(
        `网络词库【${res.name}】导入成功！\n\n共写入 ${res.count.toLocaleString()} 张卡片。`,
        { title: "网络导入成功", kind: "info" }
      );
      navigate(`/decks/${res.deckId}`);
    } catch (err) {
      await showNativeAlert(
        `网络导入失败。\n\n原因: ${(err as Error).message}`,
        { title: "网络导入失败", kind: "error" }
      );
    } finally {
      setCustomImporting(false);
      setCustomProgress("");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* 顶部 Header 与操作区 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">词库广场</h1>
            <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
              开放生态与记忆库
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            同步接入主流开放词典仓库与 Anki 记忆库生态，内置考研与四六级全量词库，支持一键秒下、全量解析入库。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full md:w-56">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索词库、考试或标签..."
              className="pl-8 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 whitespace-nowrap text-xs"
            onClick={() => setShowCustomUrlDialog(true)}
          >
            <LinkIcon className="size-3.5" />
            网络链接导入
          </Button>
          <Link to="/import">
            <Button variant="secondary" size="sm" className="h-9 whitespace-nowrap text-xs">
              本地文件导入
            </Button>
          </Link>
        </div>
      </div>

      {/* 开放词库平台与 Anki 广场生态导航横幅 */}
      <div className="rounded-xl border bg-card/60 p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              开放词库平台与 Anki 记忆库生态
            </h2>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              (兼容 .apkg 原生牌组与开源结构化 JSON 词典)
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground gap-1 hover:text-foreground"
            onClick={() => setShowPlatforms(!showPlatforms)}
          >
            <span>{showPlatforms ? "收起平台" : "展开平台"}</span>
            {showPlatforms ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>

        {showPlatforms && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
            {OPEN_PLATFORMS.map((platform: OpenPlatformResource) => (
              <div
                key={platform.id}
                className="flex flex-col justify-between rounded-lg border bg-background/50 p-3 text-xs transition-colors hover:border-primary/40"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                      {platform.category}
                    </Badge>
                    <button
                      type="button"
                      title="在系统默认浏览器中打开"
                      onClick={() => openExternalLink(platform.url, { title: platform.title })}
                      className="text-muted-foreground hover:text-primary transition-colors cursor-pointer p-0.5"
                    >
                      <ExternalLink className="size-3" />
                    </button>
                  </div>
                  <div
                    onClick={() => openExternalLink(platform.url, { title: platform.title })}
                    className="font-semibold text-foreground text-xs hover:text-primary cursor-pointer transition-colors"
                  >
                    {platform.title}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {platform.description}
                  </p>
                </div>
                <div className="mt-2.5 pt-2 border-t flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {platform.guide.slice(0, 16)}...
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2 py-0 text-primary gap-1 hover:border-primary/50"
                    onClick={() => openExternalLink(platform.url, { title: platform.title })}
                  >
                    <ExternalLink className="size-3" />
                    访问网站
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分类切换 Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.key}
            variant={activeCategory === cat.key ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveCategory(cat.key)}
            className="rounded-full text-xs h-8"
          >
            {cat.key === "anki_hub" && <Layers className="mr-1 size-3.5" />}
            {cat.label}
          </Button>
        ))}
      </div>

      {/* 词库卡片列表 Grid */}
      {filteredDecks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <BookOpen className="size-10 opacity-40 mb-2" />
          <p className="text-sm">未找到与「{searchQuery}」相关的词库资源</p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("all");
            }}
          >
            清除搜索条件
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDecks.map((deck) => {
            const alreadyIn = isAlreadyImported(deck.name);
            const isImporting = importingId === deck.id;
            const successInfo = importSuccess[deck.id];

            return (
              <Card
                key={deck.id}
                className={cn(
                  "flex flex-col justify-between transition-all hover:border-primary/50 hover:shadow-sm",
                  deck.format === "apkg" && "border-indigo-500/30 bg-indigo-50/5",
                  alreadyIn && "bg-muted/10 border-muted-foreground/20"
                )}
              >
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {deck.categoryLabel}
                      </Badge>
                      {deck.format === "apkg" ? (
                        <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] px-1.5 py-0">
                          Anki APKG
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                          JSON 词典
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: deck.difficulty }).map((_, i) => (
                        <Star key={i} className="size-3 fill-current" />
                      ))}
                    </div>
                  </div>

                  <div>
                    <CardTitle className="text-base font-semibold leading-snug">
                      {deck.name}
                    </CardTitle>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {deck.wordCount.toLocaleString()} 词
                      </span>
                      <span>·</span>
                      <span>{deck.source}</span>
                      {deck.builtin && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            内置离线秒开
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <CardDescription className="line-clamp-2 text-xs leading-relaxed">
                    {deck.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 pb-3">
                  <div className="flex flex-wrap gap-1">
                    {deck.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-background/50 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* 样例词快速预览芯片 */}
                  {deck.sampleWords && deck.sampleWords.length > 0 && (
                    <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">样例词：</span>
                      {deck.sampleWords.slice(0, 3).map((w, idx) => (
                        <span key={w.front}>
                          {idx > 0 && "、"}
                          <span className="font-mono text-foreground/80">{w.front}</span>
                          {w.back && <span className="opacity-70"> ({w.back.slice(0, 8)})</span>}
                        </span>
                      ))}
                      {deck.sampleWords.length > 3 && " 等"}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-between border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setPreviewDeck(deck)}
                  >
                    <Eye className="mr-1.5 size-3.5" />
                    词条样例
                  </Button>

                  {successInfo ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 gap-1 text-xs"
                        onClick={() => navigate("/study")}
                      >
                        <GraduationCap className="size-3.5" />
                        立即学习
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => navigate(`/decks/${successInfo.deckId}`)}
                      >
                        查看 ({successInfo.count}词)
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant={alreadyIn ? "outline" : "default"}
                      disabled={isImporting}
                      className="h-8 gap-1 text-xs"
                      onClick={() => handleImport(deck)}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span className="max-w-[140px] truncate">{progressMsg || "写入中..."}</span>
                        </>
                      ) : alreadyIn ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                          <span>再次导入副本</span>
                        </>
                      ) : (
                        <>
                          <Download className="size-3.5" />
                          <span>一键下载导入</span>
                        </>
                      )}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* 词条样例预览弹窗 */}
      <Dialog open={!!previewDeck} onOpenChange={(open) => !open && setPreviewDeck(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              {previewDeck?.name}
            </DialogTitle>
            <DialogDescription>
              {previewDeck?.categoryLabel} · 共 {previewDeck?.wordCount.toLocaleString()} 词 · {previewDeck?.source}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {previewDeck?.description}
            </p>

            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>词条预览样例：</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                导入后将包含全部 {previewDeck?.wordCount.toLocaleString()} 完整词条
              </span>
            </div>
            <ScrollArea className="h-72 rounded-md border p-3">
              <div className="space-y-3">
                {previewDeck?.sampleWords.map((card, idx) => (
                  <div key={card.front} className="border-b pb-2.5 last:border-b-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-medium text-sm text-foreground">
                        <span className="mr-2 text-xs text-muted-foreground">{idx + 1}.</span>
                        {card.front}
                      </div>
                      {card.phonetic && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {card.phonetic}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {card.pos && (
                        <span className="mr-1.5 font-semibold text-primary">{card.pos}</span>
                      )}
                      {card.back}
                    </div>
                    {card.example && (
                      <div className="mt-1.5 rounded bg-muted/50 p-2 text-xs text-muted-foreground/90">
                        <p className="font-medium text-foreground/80">{card.example}</p>
                        {card.example_cn && (
                          <p className="mt-0.5 text-muted-foreground">{card.example_cn}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setPreviewDeck(null)}>
              关闭
            </Button>
            {previewDeck && (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={importingId === previewDeck.id}
                onClick={() => {
                  const target = previewDeck;
                  setPreviewDeck(null);
                  handleImport(target);
                }}
              >
                <Download className="size-4" />
                立即导入全部 {previewDeck.wordCount.toLocaleString()} 词
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 自定义在线链接导入对话框 */}
      <Dialog open={showCustomUrlDialog} onOpenChange={setShowCustomUrlDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="size-5 text-primary" />
              导入任意在线词库或 Anki 牌组
            </DialogTitle>
            <DialogDescription>
              支持输入任意公开可访问的 .apkg（Anki 牌组）或标准 .json 词典直链地址，系统将自动拉取并解析入库。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                网络资源直链 (URL)
              </label>
              <Input
                placeholder="https://.../deck.apkg 或 https://.../words.json"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={customImporting}
              />
              <p className="text-[11px] text-muted-foreground">
                支持 GitHub raw 链接、jsDelivr CDN、AnkiWeb 分享包直链等。
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                词库名称（可选，留空则自动提取）
              </label>
              <Input
                placeholder="例如：我的自定义网络词库"
                value={customDeckName}
                onChange={(e) => setCustomDeckName(e.target.value)}
                disabled={customImporting}
              />
            </div>

            {customImporting && (
              <div className="flex items-center gap-2 rounded-md bg-muted/60 p-3 text-xs text-primary">
                <Loader2 className="size-4 animate-spin" />
                <span>{customProgress || "正在处理中..."}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={customImporting}
              onClick={() => setShowCustomUrlDialog(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={!customUrl.trim() || customImporting}
              className="gap-1.5"
              onClick={handleCustomImport}
            >
              {customImporting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>导入中...</span>
                </>
              ) : (
                <>
                  <Download className="size-3.5" />
                  <span>开始下载并导入</span>
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
