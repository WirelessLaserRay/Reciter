import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauri } from "@/lib/env";
import "./index.css";

// PWA Service Worker（仅 Web 端注册；Tauri 内不注册避免干扰）
if (!isTauri()) {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
