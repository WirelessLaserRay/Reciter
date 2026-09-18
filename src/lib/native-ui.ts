import { isTauri } from "@/lib/env";
import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";

export interface OpenUrlOptions {
  title?: string;
  preferMode?: string;
}

/**
 * 在系统默认浏览器中直接打开外部网页链接：
 * - 在 Tauri 桌面端：直接调用系统默认浏览器（Chrome / Edge 等）唤起，避免 Webview 引起的卡顿或冻结。
 * - 在 Web/PWA 端：以新标签页安全打开。
 */
export async function openExternalLink(url: string, _options?: OpenUrlOptions): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isTauri()) {
    try {
      await invoke("open_external_url", { url: trimmed });
      return;
    } catch (err) {
      console.warn("调用系统默认浏览器失败，使用 window.open 兜底:", err);
    }
  }

  // Web/PWA 或降级兜底
  window.open(trimmed, "_blank", "noopener,noreferrer");
}

/**
 * 弹出平台原生对话框（Windows 原生 MessageBox / Tauri 原生系统提示框）：
 * 彻底替换浏览器自带的阻塞式 alert()。
 */
export async function showNativeAlert(
  content: string,
  options?: {
    title?: string;
    kind?: "info" | "warning" | "error";
  }
): Promise<void> {
  const title = options?.title || "Reciter 提示";
  const kind = options?.kind || "info";

  if (isTauri()) {
    try {
      await message(content, {
        title,
        kind,
      });
      return;
    } catch (err) {
      console.warn("调用 Tauri 原生对话框异常:", err);
    }
  }

  // Web 端优雅提示兜底
  window.alert(`${title}\n\n${content}`);
}
