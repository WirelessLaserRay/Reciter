import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  History,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDbStore } from "@/stores/useDbStore";
import { useDeckStore } from "@/stores/useDeckStore";
import { initSyncStore } from "@/stores/useSyncStore";
import { db } from "@/lib/db";
import {
  exportToJSON,
  importFromJSON,
  readBackupFile,
  getSafetyBackupInfo,
  restoreBackupData,
  type BackupData,
  type SafetyBackupMeta,
} from "@/lib/backup";
import {
  getSyncConfig,
  saveSyncConfig,
  testSyncConnection,
  pushSnapshot,
  pullSnapshot,
  getSyncMetaInfo,
  undoSyncRestore,
  getAutoSyncEnabled,
  saveAutoSyncEnabled,
  type SyncMetaInfo,
} from "@/lib/sync";

interface DataTabProps {
  onSaved?: () => void;
}

export default function DataTab({ onSaved }: DataTabProps) {
  const dbReady = useDbStore((s) => s.ready);
  const { refresh: refreshDecks } = useDeckStore();

  const [syncEndpoint, setSyncEndpoint] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncTesting, setSyncTesting] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMetaInfo | null>(null);
  const [safetyInfo, setSafetyInfo] = useState<SafetyBackupMeta | null>(null);

  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{
    remoteUpdatedAt: string | null;
    localLastSync: string | null;
  } | null>(null);
  const [pullConfirmOpen, setPullConfirmOpen] = useState(false);

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [backupPreview, setBackupPreview] = useState<{ decks: number; cards: number; reviews: number } | null>(null);
  const [pendingBackupData, setPendingBackupData] = useState<BackupData | null>(null);

  const [dangerTarget, setDangerTarget] = useState<"progress" | "stats" | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);

  const refreshSyncStatus = async () => {
    try {
      const [meta, safety] = await Promise.all([
        getSyncMetaInfo(),
        getSafetyBackupInfo(),
      ]);
      setSyncMeta(meta);
      setSafetyInfo(safety);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [syncCfg, autoSync] = await Promise.all([
        getSyncConfig(),
        getAutoSyncEnabled(),
      ]);
      setSyncEndpoint(syncCfg.endpoint);
      setSyncToken(syncCfg.token);
      setAutoSyncEnabled(autoSync);
      await refreshSyncStatus();
    })().catch(() => {});
  }, [dbReady]);

  const handleSaveSync = async () => {
    await saveSyncConfig(syncEndpoint, syncToken);
    await initSyncStore();
    setSyncMsg({ ok: true, text: "同步设置已保存" });
    await refreshSyncStatus();
    onSaved?.();
  };

  const handleTestSync = async () => {
    setSyncTesting(true);
    setSyncMsg(null);
    const r = await testSyncConnection();
    setSyncTesting(false);
    setSyncMsg({ ok: r.ok, text: r.message });
    await refreshSyncStatus();
  };

  const handlePushSync = async (force = false) => {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const r = await pushSnapshot({ force });
      if (r.conflict) {
        setConflictInfo({
          remoteUpdatedAt: r.remoteUpdatedAt ?? null,
          localLastSync: r.localLastSync ?? null,
        });
        setConflictDialogOpen(true);
        return;
      }
      setSyncMsg({ ok: r.ok, text: r.message });
      await refreshSyncStatus();
    } finally {
      setSyncBusy(false);
    }
  };

  const handleConfirmForcePush = async () => {
    setConflictDialogOpen(false);
    setConflictInfo(null);
    await handlePushSync(true);
  };

  const handleCancelConflict = () => {
    setConflictDialogOpen(false);
    setConflictInfo(null);
    setSyncMsg({ ok: false, text: "已取消上传，云端数据保持不变" });
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    if (!dbReady) return;
    await saveAutoSyncEnabled(enabled);
    await initSyncStore();
    onSaved?.();
  };

  const handlePullSyncClick = () => {
    setPullConfirmOpen(true);
  };

  const confirmPullSync = async () => {
    setPullConfirmOpen(false);
    setSyncBusy(true);
    setSyncMsg(null);
    const r = await pullSnapshot();
    setSyncBusy(false);
    setSyncMsg({ ok: r.ok, text: r.message });
    await refreshDecks();
    await refreshSyncStatus();
  };

  const handleUndoRestore = async () => {
    setSyncBusy(true);
    setSyncMsg(null);
    const r = await undoSyncRestore();
    setSyncBusy(false);
    setSyncMsg({ ok: r.ok, text: r.message });
    await refreshDecks();
    await refreshSyncStatus();
  };

  const handleExport = async () => {
    setBackupBusy(true);
    const r = await exportToJSON();
    setBackupBusy(false);
    setBackupMsg({ ok: r.ok, text: r.message });
  };

  const handleImport = async () => {
    try {
      const data = await readBackupFile();
      if (!data) return;
      setPendingBackupData(data);
      setBackupPreview({
        decks: data.decks.length,
        cards: data.cards.length,
        reviews: data.reviewLogs?.length ?? 0,
      });
      setConfirmImportOpen(true);
    } catch (e) {
      setBackupMsg({ ok: false, text: String(e) });
    }
  };

  const confirmImport = async () => {
    setConfirmImportOpen(false);
    setBackupBusy(true);
    const r = pendingBackupData
      ? await restoreBackupData(pendingBackupData, { reason: "pre_restore" })
      : await importFromJSON();
    setPendingBackupData(null);
    setBackupPreview(null);
    setBackupBusy(false);
    setBackupMsg({ ok: r.ok, text: r.message });
    await refreshDecks();
    await refreshSyncStatus();
  };

  const confirmDangerReset = async () => {
    if (!dangerTarget) return;
    setDangerBusy(true);
    try {
      if (dangerTarget === "progress") {
        await db.resetLearningProgress();
        setBackupMsg({ ok: true, text: "已重置学习进度：卡片保留，FSRS 状态、复习记录与统计数据已清空。" });
      } else {
        await db.resetStatistics();
        setBackupMsg({ ok: true, text: "已重置统计数据：复习记录与学习日报已清空，记忆进度保留。" });
      }
    } catch (e) {
      setBackupMsg({ ok: false, text: String(e) });
    } finally {
      setDangerBusy(false);
      setDangerTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 跨端快照同步 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            跨端快照同步 (Cloudflare)
          </CardTitle>
          <CardDescription>
            通过 Cloudflare Worker + KV 快照上传/下载，实现 Windows 桌面与 PWA 跨端同步（AI 接口与密钥各端独立）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sync-endpoint">同步地址（Worker URL）</Label>
            <Input
              id="sync-endpoint"
              value={syncEndpoint}
              onChange={(e) => setSyncEndpoint(e.target.value)}
              placeholder="https://your-worker.example.workers.dev"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sync-token">同步访问 Token</Label>
            <Input
              id="sync-token"
              type="password"
              value={syncToken}
              onChange={(e) => setSyncToken(e.target.value)}
              placeholder="与 Worker 环境变量 SYNC_TOKEN 一致"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync" className="text-sm font-medium">自动同步学习进度</Label>
              <p className="text-xs text-muted-foreground">
                打开应用时自动拉取云端新进度，学完后自动上传（同步词库、学习进度与备考规划；AI 配置与接口设置各端独立）
              </p>
            </div>
            <Switch
              id="auto-sync"
              checked={autoSyncEnabled}
              onCheckedChange={handleAutoSyncToggle}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleSaveSync}>
              保存设置
            </Button>
            <Button variant="outline" size="sm" onClick={handleTestSync} disabled={syncTesting || syncBusy}>
              {syncTesting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              测试连接
            </Button>
            <Button size="sm" onClick={() => handlePushSync(false)} disabled={syncBusy || syncTesting}>
              {syncBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              上传快照到云端
            </Button>
            <Button variant="secondary" size="sm" onClick={handlePullSyncClick} disabled={syncBusy || syncTesting}>
              {syncBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              从云端下载快照
            </Button>
          </div>
          {syncMsg && (
            <p className={syncMsg.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
              {syncMsg.ok ? <CheckCircle2 className="mr-1 inline size-3.5" /> : <XCircle className="mr-1 inline size-3.5" />}
              {syncMsg.text}
            </p>
          )}
          {safetyInfo && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <History className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  存在覆盖前本地安全快照（{new Date(safetyInfo.savedAt).toLocaleString()} · {safetyInfo.deckCount} 词库 / {safetyInfo.cardCount} 卡片）
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-amber-300 text-xs hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
                onClick={handleUndoRestore}
                disabled={syncBusy}
              >
                撤销上次覆盖恢复
              </Button>
            </div>
          )}
          {syncMeta && (
            <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                云端最新快照：
                <span className="font-medium text-foreground ml-1">
                  {syncMeta.remoteUpdatedAt ? new Date(syncMeta.remoteUpdatedAt).toLocaleString() : "暂无快照"}
                </span>
              </div>
              <div>
                本机上次同步：
                <span className="font-medium text-foreground ml-1">
                  {syncMeta.localLastSyncTime ? new Date(syncMeta.localLastSyncTime).toLocaleString() : "尚未记录"}
                </span>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <Database className="mt-0.5 size-3.5 shrink-0" />
            <div className="space-y-1">
              <p><b>纯净学习进度同步</b>：跨端仅同步词库、卡片 FSRS 算法状态与复习记录，各端本地设置（AI 密钥、偏好配置、主题）保持独立，绝不会被云端覆盖冲刷。</p>
              <p><b>安全防线已启用</b>：上传前自动检测多端冲突；下载或覆盖恢复前会自动生成本地安全快照，随时可一键撤销回退。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 本地数据备份与恢复 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-4 text-primary" />
            本地数据备份与恢复
          </CardTitle>
          <CardDescription>全量导出为 JSON 离线文件（词库/卡片/记忆状态/复习记录/设置/日报），随时完整恢复</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleExport} disabled={backupBusy}>
              {backupBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              导出全量备份 (JSON)
            </Button>
            <Button variant="outline" onClick={handleImport} disabled={backupBusy}>
              {backupBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              从文件恢复
            </Button>
          </div>
          {backupMsg && (
            <p className={backupMsg.ok ? "text-xs text-green-600" : "text-xs text-red-600"}>
              {backupMsg.ok ? <CheckCircle2 className="mr-1 inline size-3.5" /> : <XCircle className="mr-1 inline size-3.5" />}
              {backupMsg.text}
            </p>
          )}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <Database className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <p>备份文件包含本地全部数据；跨设备即时同步建议使用上方「跨端同步」。</p>
              <p>从备份恢复会覆盖现有数据，请在恢复前确认。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 危险区 */}
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            危险区 (Danger Zone)
          </CardTitle>
          <CardDescription>以下重置操作无法撤回，执行前建议先导出本地备份</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/20 bg-background p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">重置学习进度</p>
              <p className="text-xs text-muted-foreground">
                保留全部词库与卡片，清空 FSRS 记忆状态、复习记录与学习统计（卡片全部回归「未学习」状态）
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setDangerTarget("progress")}>
              重置进度
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/20 bg-background p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">重置统计数据</p>
              <p className="text-xs text-muted-foreground">
                清空复习记录与学习日报，但保留当前 FSRS 记忆进度（图表归零，已学卡片不会变回未学）
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setDangerTarget("stats")}>
              重置统计
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 危险区确认对话框 */}
      <Dialog open={dangerTarget !== null} onOpenChange={(open) => !open && !dangerBusy && setDangerTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              {dangerTarget === "progress" ? "重置学习进度" : "重置统计数据"}
            </DialogTitle>
            <DialogDescription>
              {dangerTarget === "progress"
                ? "将清空全部卡片的 FSRS 记忆状态、复习记录与学习统计，词库和卡片本身会保留。此操作不可撤销！"
                : "将清空复习记录与学习统计，当前记忆进度保留。此操作不可撤销！"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDangerTarget(null)} disabled={dangerBusy}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDangerReset} disabled={dangerBusy}>
              {dangerBusy ? <Loader2 className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入恢复确认 */}
      <ConfirmDialog
        open={confirmImportOpen}
        onOpenChange={setConfirmImportOpen}
        title="导入恢复"
        description={
          backupPreview
            ? `备份内容：${backupPreview.decks} 词库 / ${backupPreview.cards} 卡片 / ${backupPreview.reviews} 复习记录。导入将清空现有数据并恢复为备份内容。系统会在覆盖前自动生成本地安全快照，随时可一键撤销。确定继续？`
            : "导入将清空现有数据并恢复为备份内容。系统会在覆盖前自动生成本地安全快照，随时可一键撤销。确定继续？"
        }
        destructive
        confirmLabel="确认导入"
        cancelLabel="取消"
        onConfirm={confirmImport}
        onCancel={() => setConfirmImportOpen(false)}
      />

      {/* 推送冲突确认弹窗 */}
      <ConfirmDialog
        open={conflictDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelConflict();
        }}
        title="云端检测到更新的快照"
        busy={syncBusy}
        description={
          conflictInfo ? (
            <div className="space-y-2 text-xs">
              <p>检测到其他设备在此期间已向云端提交了新进度：</p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>云端快照时间：<b className="text-foreground">{conflictInfo.remoteUpdatedAt ? new Date(conflictInfo.remoteUpdatedAt).toLocaleString() : "未知"}</b></li>
                <li>本机记录同步：<b className="text-foreground">{conflictInfo.localLastSync ? new Date(conflictInfo.localLastSync).toLocaleString() : "尚未记录"}</b></li>
              </ul>
              <p className="text-destructive font-medium pt-1">
                若强制上传，云端上的新进度将被当前设备的本地数据完全覆盖！是否继续？
              </p>
            </div>
          ) : "云端检测到更新的快照，若继续将覆盖云端数据，是否继续？"
        }
        destructive
        confirmLabel="强制覆盖云端"
        cancelLabel="取消"
        onConfirm={handleConfirmForcePush}
        onCancel={handleCancelConflict}
      />

      {/* 拉取下载覆盖确认弹窗 */}
      <ConfirmDialog
        open={pullConfirmOpen}
        onOpenChange={setPullConfirmOpen}
        title="下载云端快照并覆盖本地"
        description="从云端下载快照将更新本地数据。系统会在覆盖前自动为当前本地数据创建一份安全快照，如果误操作可随时在设置页一键撤销回滚。确定开始下载？"
        confirmLabel="确认下载覆盖"
        cancelLabel="取消"
        onConfirm={confirmPullSync}
        onCancel={() => setPullConfirmOpen(false)}
      />
    </div>
  );
}
