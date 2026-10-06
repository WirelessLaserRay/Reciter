import { isTauri } from "@/lib/env";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { APP_VERSION } from "@/lib/backup";

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

const httpFetch = isTauri() ? tauriFetch : (...args: Parameters<typeof fetch>) => fetch(...args);

/**
 * 语义化版本号对比
 * 返回 1 表示 v1 > v2，-1 表示 v1 < v2，0 表示相等
 */
export function compareSemver(v1: string, v2: string): number {
  const normalize = (v: string) =>
    v
      .replace(/^v/i, "")
      .trim()
      .split(/[-+]/)[0]
      .split(".")
      .map((part) => parseInt(part, 10) || 0);

  const p1 = normalize(v1);
  const p2 = normalize(v2);
  const maxLen = Math.max(p1.length, p2.length, 3);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * 检查 GitHub Releases 最新版本与当前版本差异
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = APP_VERSION;
  const timeoutSignal = AbortSignal.timeout(10000);

  const res = await httpFetch(
    "https://api.github.com/repos/WirelessLaserRay/Reciter/releases/latest",
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Reciter-App",
      },
      signal: timeoutSignal,
    }
  );

  if (!res.ok) {
    throw new Error(`检查更新服务器响应异常 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    assets?: Array<{
      name: string;
      browser_download_url: string;
      size: number;
    }>;
  };

  const latestTag = (data.tag_name || "").trim();
  const latestVersion = latestTag.replace(/^v/i, "").trim() || currentVersion;
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

  const assets: ReleaseAsset[] = Array.isArray(data.assets)
    ? data.assets.map((a) => ({
        name: a.name,
        downloadUrl: a.browser_download_url,
        size: a.size,
      }))
    : [];

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    releaseName: data.name || latestTag || `Reciter v${latestVersion}`,
    releaseNotes: data.body || "暂无发布日志说明。",
    releaseUrl:
      data.html_url || "https://github.com/WirelessLaserRay/Reciter/releases",
    publishedAt: data.published_at || "",
    assets,
  };
}
