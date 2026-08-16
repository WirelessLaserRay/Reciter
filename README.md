# Reciter

> 本地客制化英语学习与记忆客户端 · Local-first English Learning & Spaced Repetition Client
>
> [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

对标 Anki / MaiMemo 的开源英语学习工具，主打 **Markdown 自由导入** 与 **AI 智能复习**，数据全部保存在本地。

- 技术栈：**Tauri 2**（Rust 壳）+ **React 18** + **TypeScript** + **Vite 7**
- UI：**Tailwind CSS v4** + **shadcn/ui**（暗色/亮色双主题）
- 状态/路由：**Zustand 5** + **React Router 7**
- 记忆算法：**FSRS-5**（ts-fsrs）· 本地存储：**SQLite**（tauri-plugin-sql，WAL）
- AI 接入：**OpenAI 兼容双通道**（DeepSeek 云端 / Ollama 本地）

---

## ✨ 核心功能

| 功能 | 说明 | 状态 |
|---|---|---|
| 🗂️ 灵活数据导入 | Markdown（`## 标题` 分词库、`- word: meaning` 成卡、`> 引用块` 例句、`==高亮==` 挖空素材）/ CSV / JSON 批量导入，导入前预览、冲突检测 | Phase 2 |
| 🧠 科学记忆系统 | FSRS-5 间隔重复算法（ts-fsrs v5），目标记忆率可调（0.80~0.95），Learning/Review/Relearning 三态流转，评分按钮实时显示下一间隔，悬停查看四档含义 | ✅ Phase 3 |
| 📝 测试模式 | 填空（中译英）+ 选择（中译英/英译中）三种题型，英文单词选项优先使用形近词干扰项，掌握度评价回填 FSRS；支持 AI 出题 | ✅ Phase 3 / 0.14.0 |
| 🏷️ 词库管理 | 词库重命名、词条编辑（单词/释义/标签）、按标签分类学习与测试 | ✅ 0.6.0 |
| 🤖 AI 语境测试 | AI 深度复习（流式完形/语境题 + AI 判分 + 申诉）、测试模式 AI 出题；DeepSeek/Ollama/OpenAI 预设一键切换 | ✅ Phase 4 |
| 🧭 学习体验优化 | 一键续学/智能推荐、三档评分、主动回忆（10 秒柔和时限提示）、迷你小结、新卡/复习卡交错编排、Learning 卡优先 | ✅ 6A / 0.13.0 |
| 🤖 AI 学习助手 | AI 多轮对话面板（学习页右侧可折叠侧栏，同词内容会话缓存避免重复调用）、FSRS 自适应策略、JSON 结构化 Prompt、弱词本、AI 配置向导 | ✅ 6B / 0.12.0 |
| 🧬 统一学习流 | 按 FSRS 状态自适应切换：新卡教学（识别首测）→ 主动回忆 / 快速测试（秒答阈值可调，形近词干扰）/ AI 深度攻克 / 经典翻转；复习揭示原文语境与同族词；词库掌握度全景、标签集巩固测试；Leech 自动标记重点词 | ✅ 6C / 0.14.0 |
| 🎨 多主题外观 | 7 套完整主题（石墨黑/珍珠白/深海蓝/森林绿/星夜紫/暖阳橙/玫瑰红），侧栏平滑折叠动画与图标栏 | ✅ 0.14.0 |
| 📊 学习统计 | 复习量堆叠柱状图、记忆保留率折线图、未来 7 天预期复习量、365 天热力图（自定义 CSS Grid） | ✅ Phase 5 |
| 💾 本地优先 | 所有数据存本地 SQLite（6 表 + 迁移管理）；全量 JSON 导出/恢复（不包含 WebDAV 同步） | ✅ Phase 2 / Phase 5 |
| ⚖️ Easy Days 负载均衡 | 避免周末/特定日期复习堆积（对标 Anki 2025 新特性） | Planned（设置页占位） |

**差异化亮点**（主流竞品未实现）：Markdown 原生导入、AI 语境测试、记忆可检索度实时可视化（ts-fsrs `get_retrievability`）。

---

## 🏗️ 架构

```
┌────────────────────────────────────────────────────┐
│ Tauri 2 Shell (Rust, 薄壳)                          │
│  ├─ tauri-plugin-sql     → SQLite (本地词库+进度)   │
│  ├─ tauri-plugin-dialog  → 文件选择(Markdown/CSV)  │
│  └─ tauri-plugin-http    → AI API 请求 / WebDAV    │
├────────────────────────────────────────────────────┤
│ React 18 + TypeScript + Vite (前端)                 │
│  ├─ UI: Tailwind v4 + shadcn/ui (暗色主题)          │
│  ├─ 状态: Zustand；路由: React Router               │
│  ├─ 解析: remark AST + 正则后处理 → Card            │
│  ├─ SRS: ts-fsrs (FSRS-5 scheduler)                 │
│  ├─ 学习流: study-mode 五模式自适应 + StudyCard      │
│  └─ 图表: Recharts + 自定义 HeatmapGrid             │
└────────────────────────────────────────────────────┘
                    │
                    ▼
          SQLite 单文件 (reciter.db, WAL)
          ├─ decks / cards / card_states / review_logs / settings / daily_stats
          └─ 导出 → JSON → WebDAV (TgNAS) 备份
```

### 数据库 Schema 摘要（6 张表）

| 表 | 说明 | 关键字段 |
|---|---|---|
| `decks` | 词库 | name(UNIQUE), new_cards_per_day |
| `cards` | 卡片 | (deck_id, front) UNIQUE → 重导入 upsert 保留进度 |
| `card_states` | FSRS 记忆状态（与卡片 1:1） | state/stability/difficulty/due/desired_retention/algorithm_version |
| `review_logs` | 复习记录 | grade(1-4), source(review|quiz|ai_test), ai_question/ai_answer |
| `settings` | KV 设置 | key/value |
| `daily_stats` | 学习日报（统计 O(1) 查询） | new_count/review_count/again_count/retention_rate |

---

## 🛠️ 开发环境

### 前置依赖

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Node.js | >= 18（开发环境 22.17.1） | 前端构建 |
| npm | >= 10 | 包管理 |
| Rust | stable（开发环境 1.97.1） | Tauri 壳；rustup 安装，约 1.5GB 一次性成本 |
| MSVC Build Tools | VS2022 VCTools（14.44） | Windows 链接必需（`link.exe`） |
| WebView2 Runtime | Win11 自带 | Tauri WebView 运行时 |

### 首次安装（Windows）

```powershell
# 1. Rust 工具链（非管理员）
curl.exe -L -o %TEMP%\rustup-init.exe https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
%TEMP%\rustup-init.exe -y --profile minimal --default-toolchain stable

# 2. MSVC C++ Build Tools（需管理员 / UAC 授权）
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact ^
  --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

# 3. 项目依赖
cd <项目根目录>
npm install
```

> ⚠️ **端口说明**：Vite 开发端口使用 **14210**（非模板默认 1420）。1420 落在 Windows Hyper-V/WSL 保留端口区间（`netsh int ipv4 show excludedportrange` 可查），绑定会报 `EACCES`。

### 常用命令

| 命令 | 说明 |
|---|---|
| `npm install` | 安装前端依赖 |
| `npm run dev` | 仅前端开发（http://127.0.0.1:14210） |
| `npm run build` | 前端类型检查 + 生产构建（输出 `dist/`） |
| `npm run tauri dev` | 启动桌面应用（开发模式，热更新） |
| `npm run tauri build` | 打包桌面安装包 |
| `npx tauri icon <png>` | 重新生成应用图标 |

---

## 📁 项目结构

```
<项目根目录>
├── IDEA.md / PLAN.md / ANALYSIS.md   # 需求 / 方案 / 实施方案
├── CHANGELOG.md                      # 项目改动跟踪（Keep a Changelog）
├── README.md                         # 本文档
├── index.html                        # Vite 入口
├── vite.config.ts                    # Vite + Tailwind v4 + @/ 别名 + 端口 14210
├── components.json                   # shadcn/ui 配置
├── src/
│   ├── main.tsx / App.tsx            # React 入口 + 路由（HashRouter）
│   ├── index.css                     # Tailwind v4 + 双主题 CSS 变量
│   ├── components/
│   │   ├── ui/                       # shadcn/ui 组件（button/card/tabs/... 15 个）
│   │   ├── layout/                   # Sidebar / Header / MainLayout
│   │   ├── study/                    # StudyCard（五模式学习卡片）/ MarkdownContext（语境沉浸）
│   │   └── deck/                     # MasteryOverview（掌握度全景）
│   ├── pages/                        # Dashboard 词库 词库详情 学习 导入 统计 设置 弱词本
│   ├── stores/                       # Zustand store（theme/deck/db/study）
│   ├── lib/                          # db / fsrs / day / review / stats / stats-utils / backup / ai-* / ai-strategy / study-mode / study-prefs / recall-match / settings / markdown-parser / importer / utils
│   ├── components/stats/              # HeatmapGrid（自定义热力图）
│   ├── components/ai/                 # AI Chat Panel / 深度复习 / 配置向导
│   ├── components/quiz/               # 测试模式（QuizSession，高级入口）
│   └── types/                        # 全局类型（与数据库 Schema 对齐）
├── src-tauri/                        # Tauri 2 Rust 壳
│   ├── src/main.rs / lib.rs          # 入口 + Builder
│   ├── tauri.conf.json               # 窗口/构建/打包配置（devUrl 14210）
│   ├── Cargo.toml                    # tauri 2 + tauri-plugin-sql 依赖
│   ├── migrations/001_init.sql       # 数据库迁移（6 表）
│   ├── capabilities/default.json     # 权限声明
│   └── icons/                        # 应用图标（多尺寸）
├── templates/markdown/               # 导入格式模板示例（基础词/必考词）
└── .install/                         # 安装脚本与日志（gitignore）
```

### 路由一览

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | Dashboard | 今日任务概览 + 快捷操作 |
| `/decks` | 词库列表 | 新建/管理词库 |
| `/decks/:id` | 词库详情 | 卡片列表、掌握度全景 + 高级测试入口 |
| `/study` | 学习 | 统一学习流（新卡教学/主动回忆/快速测试/AI 攻克自适应，右侧 AI 助手侧栏）；`/study?quiz=<id>` 进入高级测试，`&tag=<tag>` 进入标签巩固测试 |
| `/import` | 导入 | Markdown/CSV/JSON 拖拽导入（预览 + 冲突检测） |
| `/stats` | 统计 | 图表与热力图（Phase 5） |
| `/weak-words` | 弱词本 | 弱词列表 + AI 攻克（Phase 6B），支持 `?deck=<id>` 筛选 |
| `/settings` | 设置 | 外观 / 学习偏好 / AI 配置 / 数据备份与危险区重置 |

---

## 🗺️ 路线图

| Phase | 内容 | 状态 |
|---|---|---|
| **1** | 脚手架（Tauri 2 + Vite + React 18 + Tailwind v4 + shadcn），路由骨架 6 页，暗色主题 | ✅ 已完成 |
| **2** | SQLite 接入 + 迁移，Deck/Card CRUD + upsert，Markdown/CSV/JSON 导入解析 + 预览 | ✅ 已完成 |
| **3** | 集成 ts-fsrs (FSRS-5)，学习流程（due 队列 + 新卡配额 + 四按钮） | ✅ 已完成 |
| **4** | AI 设置页 + OpenAI 兼容客户端 + 完形/语境测试 + 判分/申诉 | ✅ 已完成 |
| **5** | 统计图表 + 自定义热力图、JSON 导出/恢复、翻转动画、主题打磨（无 WebDAV） | ✅ 已完成 |
| **6A** | 学习体验基础优化：一键续学、三档评分、主动回忆、迷你小结 | ✅ 已完成 |
| **6B** | AI 功能重塑：AI 对话面板、FSRS 自适应策略、JSON Prompt、弱词本、配置向导 | ✅ 已完成 |
| **6C** | 学习流统一与进阶：五模式自适应、语境沉浸、掌握度全景、测试入口降级 | ✅ 已完成 |

---

## 📝 设计约定

- **Markdown 导入规则**：`## 标题` → 词库；`- word: meaning` / `- word — meaning` / `- word：meaning` → 卡片；`> 例句` → 追加到上一卡片 back；`==高亮==` → 正则后处理提取挖空素材（remark 无稳定 mark 插件，采用 AST + 正则两阶段）
- **FSRS 时区陷阱**：ts-fsrs 使用原生 `Date`，应用层需实现 `getDayStart(hour)`（默认 04:00 为新一天起点，可配置）
- **主题持久化**：`useThemeStore`（Zustand persist → localStorage `reciter-theme`），在 `<html>` 上切换 `.dark` class
- **算法升级预留**：`card_states.algorithm_version` 字段（默认 `FSRS-5`），未来升级 FSRS-6 无需改表

## 🤝 贡献

项目处于早期阶段，欢迎按 PLAN.md 的阶段划分参与开发。改动请遵循：

1. 使用 Conventional Commits 提交（`feat:` / `fix:` / `docs:` / `chore:`）
2. 每次合并后更新 `CHANGELOG.md`（Keep a Changelog 规范）

## 🚀 使用与分发

### 日常使用（正式版）

```bash
npm run tauri build          # 构建正式版（输出 src-tauri/target/release/）
# 产物：
#   reciter.exe              独立可执行文件（约 18MB，含前端资源）
#   bundle/msi/*.msi         Windows 安装包（自动创建开始菜单/桌面快捷方式）
#   bundle/nsis/*-setup.exe  NSIS 安装包
```

- **一键启动**：双击桌面「Reciter」快捷方式，或从开始菜单启动（已自动创建）
- **安装分发**：运行 `Reciter_0.14.2_x64-setup.exe` 安装到系统，获得开始菜单/桌面图标与卸载程序
- 数据目录：`%APPDATA%\\com.reciter.app\\reciter.db`（SQLite，可整目录备份）

### 开发模式

```bash
npm run tauri dev            # 热更新开发（需要 Rust 工具链）
```

### PWA 网页版（平板/手机直接使用，零工具链）

- 同一套代码构建为 PWA：`npm run build:web` → `dist/`（sql.js WASM SQLite + IndexedDB，数据离线持久化）
- 已配置 GitHub Pages 自动部署（`.github/workflows/deploy-pages.yml`），推送 main 后自动发布
- 平板/手机浏览器打开网址 → **添加到主屏幕** → 全屏离线运行
- ⚠️ Web 端 AI 受浏览器 CORS 限制（DeepSeek/OpenAI 直连可能被拒，需代理）；Windows/Tauri 端 AI 不受影响

### 移动端移植（Tauri 2 官方支持）

- **可行性**：Tauri 2 官方支持 Android（SDK/NDK）与 iOS（Xcode）。Rust 核心 + React 前端完全复用，SQLite/HTTP 插件移动端可用
- **需要适配**：
  1. 环境：Android Studio + SDK/NDK（约 5GB）或 macOS + Xcode
  2. 存储：`write_text_file`/对话框需改用移动端沙箱目录（tauri-plugin-fs 作用域）与系统分享面板
  3. UI：桌面布局 → 移动端响应式适配（触控交互）
- 初始化命令：`npm run tauri android init` / `npm run tauri ios init`

## 📄 许可证

[MIT License](LICENSE) © 2026 [WirelessLaserRay](https://github.com/WirelessLaserRay)
