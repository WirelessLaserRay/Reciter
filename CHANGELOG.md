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
- **Phase 3 · FSRS-5 记忆算法**（ts-fsrs 集成、学习队列、四档评分、due 调度）
- **Phase 4 · AI 智能复习**（DeepSeek/Ollama 双通道、完形/语境测试、判分申诉）
- **Phase 5 · 统计与打磨**（图表/热力图、JSON 导出 + WebDAV、翻转动画、主题打磨）

---

## [0.2.0] - 2026-08-14

> **里程碑**：Phase 2 完成 —— 本地 SQLite 数据库接入，Markdown/CSV/JSON 导入全流程可用。

### Added

- **SQLite 数据库**：集成 `tauri-plugin-sql`（v2.4.0，SQLite，WAL），Rust 侧迁移脚本 `src-tauri/migrations/001_init.sql` 建 6 表（decks/cards/card_states/review_logs/settings/daily_stats）+ 4 索引（deck_id/due/card_id/reviewed_at）
- **数据库封装 `src/lib/db.ts`**：ReciterDB 单例，Deck/Card CRUD、`(deck_id, front)` UNIQUE upsert（重导入保留复习进度）、card_states 自动初始化（FSRS-5 默认值）、ReviewLog/DailyStats/Settings KV
- **Markdown 解析器 `src/lib/markdown-parser.ts`**（unified + remark-parse + remark-gfm + unist-util-visit）：
  - 兼容 **templates 样式**（`templates/markdown/*.md`）：`#` 书名 → `##` 词库 → `###` 分组(tag) → `- **word n. 释义**` / `- plain n. 释义` 成卡，词性标签（n./vt./vi./adj./adv. 等组合）切分 front/back，缩进续行合并进释义，`> 引用块` 追加例句
  - 兼容 **PLAN 格式**：`- word: meaning` / `- word — meaning` / `- word：meaning`
  - 词组格式（无词性标签）按首个汉字切分；`==高亮==` 正则提取挖空素材；文件内重复 front 检测
- **CSV/JSON 解析器 `src/lib/importer.ts`**：CSV 表头识别（front/word/back/meaning/deck/tags 别名）、JSON 数组或 `{cards:[]}`，统一 `parseImportFile()` 入口按扩展名分发
- **导入页面**：拖拽/点击选择文件 → 解析预览表格（词库/单词/释义/标签/状态）、勾选跳过、全选、文件内重复与数据库冲突检测（新建/更新/重复徽标）、导入结果摘要（新建 X / 更新 Y / 跳过 Z / 涉及词库数）
- **词库列表页**：接入真实数据库（词库卡片、卡片数、每日新卡配额、创建/删除）
- **词库详情页**：卡片列表（搜索、标签、删除）、手动添加卡片、已学习/待复习计数
- **Dashboard**：显示真实词库数/卡片数
- **状态管理**：`useDeckStore`（词库+计数+刷新）、`useDbStore`（启动时初始化数据库 + 错误横幅）

### Fixed

- **词性切分正则失配**：POS 正则尾部 `\b` 在 "n." 后跟空格时无法形成词边界，导致全部词条按汉字切分（front 混入词性）；改为去除尾部边界，正确解析 `word n. 释义` / `vt./vi.` / `n./vt.` 等格式
- **TS 严格检查**：Card.tags 类型修正为 JSON 字符串（DB 原始值）、未使用导入/变量清理

### Infrastructure

- 依赖新增：`@tauri-apps/plugin-sql`、`unified`、`remark-parse`、`remark-gfm`、`unist-util-visit`、`@types/unist`
- Rust 新增：`tauri-plugin-sql`（features: sqlite），capabilities 增加 sql 权限
- 解析器冒烟测试（tsx）：templates 两个文件解析 24 张卡片，词库/标签/续行/重复检测全部正确
- 数据库验证（Python sqlite3）：6 表 + 4 索引创建成功；upsert 语义验证（新建/更新/状态初始化）；双模板文件导入 2 词库 13 卡

### Verified

- ✅ `npm run build`：tsc 严格检查 + vite 构建通过（1903 模块）
- ✅ `npm run tauri dev`：416 crates 编译 37.6s，窗口正常启动
- ✅ 数据库文件 `%APPDATA%\\com.reciter.app\\reciter.db` 迁移建表成功
- ✅ 端到端：解析 → 入库 → 跨文件冲突更新，重启后数据保留

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
