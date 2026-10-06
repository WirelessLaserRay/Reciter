import { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Github,
  Heart,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { openExternalLink } from "@/lib/native-ui";
import { checkForUpdates, type UpdateInfo } from "@/lib/updater";
import { APP_VERSION } from "@/lib/backup";

export default function About() {
  const brandIconSrc = import.meta.env.BASE_URL + "icon.png";

  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateError(null);
    try {
      const res = await checkForUpdates();
      setUpdateInfo(res);
      const now = new Date();
      setLastCheckedTime(
        `${now.getHours().toString().padStart(2, "0")}:${now
          .getMinutes()
          .toString()
          .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
      );
    } catch (err) {
      setUpdateError((err as Error).message || "检查更新超时或失败");
    } finally {
      setChecking(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 顶部标题 */}
      <div>
        <h2 className="text-2xl font-bold">关于</h2>
        <p className="text-sm text-muted-foreground">软件版本、更新检测与项目说明</p>
      </div>

      {/* 软件概览卡片 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src={brandIconSrc}
                alt="Reciter Logo"
                className="size-14 rounded-xl border border-border/70 object-contain shadow-2xs bg-background p-1"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold tracking-tight">Reciter</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    v{APP_VERSION}
                  </Badge>
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-[10px] px-1.5 py-0 border-primary/20">
                    Release
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-normal">
                  基于认知神经科学与 FSRS-5 算法的本地优先英语闪卡记忆利器
                </p>
                <div className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                  <span>作者：</span>
                  <button
                    type="button"
                    onClick={() => openExternalLink("https://github.com/WirelessLaserRay")}
                    className="font-medium text-foreground hover:text-primary transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>WirelessLaserRay</span>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="secondary" className="text-[11px] font-normal">
                MIT License
              </Badge>
              <Badge variant="secondary" className="text-[11px] font-normal">
                Local-First SQLite
              </Badge>
              <Badge variant="secondary" className="text-[11px] font-normal">
                跨端云同步
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 软件更新卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className={`size-4 text-primary ${checking ? "animate-spin" : ""}`} />
                <span>软件更新</span>
              </CardTitle>
              <CardDescription>
                通过 GitHub Releases 检查并获取最新版本安装包
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={updateInfo?.hasUpdate ? "default" : "outline"}
              disabled={checking}
              onClick={handleCheckUpdate}
              className="gap-1.5 text-xs h-8"
            >
              {checking ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>检测中…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  <span>{updateInfo ? "重新检查" : "检查更新"}</span>
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {checking && (
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>正在连接 GitHub 检测最新版本发布信息…</span>
            </div>
          )}

          {!checking && updateError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span className="font-medium">未能连接到更新服务器</span>
              </div>
              <p className="text-[11px] opacity-90">{updateError}</p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() =>
                  openExternalLink("https://github.com/WirelessLaserRay/Reciter/releases")
                }
              >
                <ExternalLink className="size-3 mr-1" />
                前往 GitHub Releases 网页查看
              </Button>
            </div>
          )}

          {!checking && !updateError && updateInfo && (
            <>
              {updateInfo.hasUpdate ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span className="text-sm font-semibold text-primary">
                        发现新版本：v{updateInfo.latestVersion}
                      </span>
                    </div>
                    {updateInfo.publishedAt && (
                      <span className="text-xs text-muted-foreground">
                        发布于 {new Date(updateInfo.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {updateInfo.releaseNotes && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-foreground">更新日志：</span>
                      <ScrollArea className="h-32 rounded-md border border-border/60 bg-background/80 p-3 text-xs text-muted-foreground font-sans whitespace-pre-wrap leading-relaxed">
                        {updateInfo.releaseNotes}
                      </ScrollArea>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => openExternalLink(updateInfo.releaseUrl)}
                      className="gap-1.5 text-xs h-8 shadow-xs"
                    >
                      <ExternalLink className="size-3.5" />
                      前往发布页下载完整版
                    </Button>
                    {updateInfo.assets
                      .filter((a) => a.name.endsWith(".exe") || a.name.endsWith(".msi"))
                      .map((asset) => (
                        <Button
                          key={asset.name}
                          size="sm"
                          variant="outline"
                          onClick={() => openExternalLink(asset.downloadUrl)}
                          className="gap-1.5 text-xs h-8"
                        >
                          <Zap className="size-3 text-primary" />
                          {asset.name.endsWith(".exe") ? "Windows 安装包 (.exe)" : "MSI 安装包"}
                          {asset.size > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              ({formatFileSize(asset.size)})
                            </span>
                          )}
                        </Button>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>当前已是最新版本 (v{updateInfo.currentVersion})，无需更新。</span>
                  </div>
                  {lastCheckedTime && (
                    <span className="text-[10px] text-muted-foreground">
                      上次检查 {lastCheckedTime}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {!checking && !updateError && !updateInfo && (
            <p className="text-xs text-muted-foreground">
              当前版本为 <strong>v{APP_VERSION}</strong>。点击上方「检查更新」按钮可查询最新发布动态。
            </p>
          )}
        </CardContent>
      </Card>

      {/* 开源致谢与链接卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="size-4 text-rose-500 fill-current" />
            <span>开源致谢与社区</span>
          </CardTitle>
          <CardDescription>
            Reciter 为开源项目，由衷致谢开源社区与先驱贡献
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            致谢项目包括：Anki 记忆闪卡体系、open-spaced-repetition (FSRS-5 算法规范)、Qwerty Learner 词库矩阵、Skywind ECDICT、COCA 语料库、Tauri 桌面运行时、sql.js 及 React 生态。
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => openExternalLink("https://github.com/WirelessLaserRay/Reciter")}
            >
              <Github className="size-3.5" />
              <span>GitHub 源码仓库</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => openExternalLink("https://github.com/WirelessLaserRay/Reciter/issues")}
            >
              <BookOpen className="size-3.5" />
              <span>问题反馈与建议</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
