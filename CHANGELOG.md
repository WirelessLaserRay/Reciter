# Changelog

本项目所有重要改动均记录在此文件中，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本 Semantic Versioning](https://semver.org/lang/zh-CN/)。

分类约定：
- **Added** 新增功能
- **Changed** 变更既有功能
- **Deprecated** 即将废弃
- **Removed** 移除功能
- **Fixed** 缺陷修复
- **Security** 安全修复
- **Infrastructure** 工程/环境/工具链（非用户可见但影响开发）

---

## [Unreleased]

### Planned
- **Phase 2 · 本地数据库与数据导入**
  - 集成 `tauri-plugin-sql`（SQLite，WAL 模式），建立 6 表 Schema（decks/cards/card_states/review_logs/settings/daily_stats）
  - Deck/Card CRUD + `(deck_id, front)` UNIQUE upsert（重导入保留复习进度）
  - Markdown 导入解析（remark AST + 正则后处理 `==高亮==`），导入预览/冲突检测 UI
  - CSV / JSON 导入支持
- **Phase 3 · FSRS-5 记忆算法**（ts-fsrs 集成、学习队列、四档评分）
- **Phase 4 · AI 智能复习**（DeepSeek/Ollama 双通道、完形/语境测试、判分申诉）
- **Phase 5 · 统计与打磨**（图表/热力图、JSON 导出 + WebDAV、翻转动画、主题打磨）

---

## [0.1.0] - 2026-08-14

> **里程碑**：Phase 1 完成 —— 桌面应用可运行，路由骨架与暗色主题就绪。

### Added

- **项目脚手架**：Tauri 2（2.11.4）+ React 18.3 + TypeScript 5.8 + Vite 7 项目初始化
- **UI 体系**：Tailwind CSS v4（`@tailwindcss/vite` 插件，无 tailwind.config.js）+ shadcn/ui（radix-nova 预设，Geist 字体），15 个基础组件（button/card/badge/tabs/input/textarea/label/switch/select/slider/dialog/separator/scroll-area/tooltip/dropdown-menu）
- **路由骨架**：HashRouter 7 条路由——今日学习（Dashboard）、词库列表、词库详情（`/decks/:id`）、学习、导入、统计、设置，`*` 兜底重定向
- **布局组件**：`Sidebar`（品牌区 + 5 项导航 + 版本区）、`Header`（页标题 + 主题切换）、`MainLayout`（侧边栏 + 主内容区）
- **暗色/亮色主题**：shadcn class 策略双主题 CSS 变量，`useThemeStore`（Zustand + persist 持久化到 localStorage `reciter-theme`），`<html>` 上切换 `.dark`，Header 一键切换
- **页面骨架**：
  - Dashboard：今日日期、4 张统计卡（待复习/新卡/词库数/记忆保持率）、快捷操作
  - 词库列表：新建词库表单（预留 CRUD 接口）
  - 学习：3D 翻转卡片预览（perspective + backface-visibility）、四档评分按钮布局
  - 导入：拖拽区占位 + Markdown/CSV 格式规则说明
  - 统计：占位卡片
  - 设置：外观（可用的主题切换）/ 学习偏好 / AI 配置 三 Tab
- **类型骨架**：`src/types/index.ts` 与 PLAN.md 数据库 Schema 对齐（Deck/Card/CardState/ReviewLog/DailyStats/AppSettings/StudyCard）
- **工程文档**：README 完善（架构图/数据库摘要/环境安装/命令/路由/设计约定）

### Fixed

- **Vite 开发端口 EACCES**：模板默认端口 1420 落在 Windows Hyper-V/WSL 保留端口区间（`netsh int ipv4 show excludedportrange` 显示 14102-14201 被排除），绑定失败报 `EACCES: permission denied`。已将 vite 端口改为 **14210**、HMR 14211，并同步 `tauri.conf.json` 的 `devUrl`
- **Vite 绑定地址**：开发服务器固定绑定 `127.0.0.1`（host 回退），避免 localhost 解析到 `::1` 时行为不一致
- **TS 编译错误**：清理模板遗留的未使用导入（`CardHeader`）以通过 `noUnusedLocals` 严格检查

### Infrastructure

- **安装 Rust 工具链**：rustup stable（rustc/cargo 1.97.1，minimal profile），路径 `C:\Users\ukcwx\.cargo`
- **安装 MSVC C++ Build Tools**：VS2022 BuildTools（MSVC 14.44.35207 + Windows 11 SDK 10.0.26100，`link.exe` 就绪），路径 `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`；经用户确认后以 UAC 提权静默安装
- **预热 cargo crate 缓存**：`cargo fetch` 预下载全部依赖源码，首次 `tauri dev` 编译仅耗时 1m12s
- **调试沙箱网络问题**：定位 pwsh 沙箱内代理（127.0.0.1:7890）TLS 失效问题，安装流程改经直连网络执行
- **`.install/` 目录**：集中存放环境安装脚本与日志（已加入 .gitignore）

### Verified

- ✅ `npm run build`：tsc 严格检查 + vite 生产构建通过
- ✅ `npm run tauri dev`：355 个 crate 编译成功，窗口启动（`Finished dev profile in 1m 12s`）
- ✅ 桌面窗口标题 "Reciter"，进程 Responding
- ✅ Vite dev server（127.0.0.1:14210）正常响应
