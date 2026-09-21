# Reciter

> 本地客制化英语学习与记忆客户端 · Local-first English Learning & Spaced Repetition Client
>
> [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Reciter 是一款对标 Anki 与墨墨背单词的开源本地优先（Local-first）英语学习工具。项目深度结合 **Markdown / 多格式自由导入**、**词库广场一键下载**、**FSRS-5 现代间隔重复算法**、**AI 智能语境与助记辅助**、**每日精读与新闻阅读** 以及 **跨端全量快照同步**。所有数据默认持久化于本地关系数据库，支持编译为 **Windows 桌面原生应用**（基于 Tauri 2）或离线可用的 **PWA 网页应用**。

---

## 功能特性

| 功能模块 | 功能说明 |
|---|---|
| 词库广场 (Deck Hub) | 内置 50+ 权威开源词库目录（覆盖大学四六级、考研、专四专八、托福、雅思、GRE、GMAT、高考及程序员高频词），支持一键远程下载入库；支持任意符合规范的 GitHub / CDN Raw JSON 链接直接解析导入 |
| 灵活多格式导入 | 原生支持 Markdown（基于 remark AST 解析）、CSV、JSON、TXT 及 Anki (.apkg) 牌组包导入；具备导入前预览、冲突检测、重名词库智能消歧、标签提取、原子级事务写入与失败回滚 |
| 科学记忆引擎 | 完整集成 FSRS-5 现代神经网络间隔重复算法（ts-fsrs v5），支持 0.80~0.95 目标记忆保留率自定义，严密支持 Learning / Review / Relearning 状态流转与即时计算下一间隔 |
| 统一自适应学习流 | 卡片教学模式、桌面主动回忆（首字母/全拼即时核对）、移动端拼写回忆、快速测试（中英双向形近词干扰）、AI 深度攻克与经典翻转五种学习形态自动融合；支持单轮上限与休息锁 |
| 词库组织与管理 | 嵌套文件夹与路径分类、词库跨目录独立同名、全局模糊检索、按自然数大小智能自然排序、重点词标记、已掌握标签过滤与排除、学习乱序调度 |
| AI 智能测评与助记 | OpenAI 兼容标准接口（原生适配 DeepSeek、Ollama 本地大模型、OpenAI 等）；支持 AI 语境完形填空出题、智能自动批改与申诉、助记侧边栏、分级词汇诊断与动态弱词攻克 |
| 每日一文精读 | 内置 CGTN、CNN、The Guardian、NPR、BBC 等权威外媒源，支持自定义 RSS；支持 Jina Reader、Archive.today、Wayback 自动降级穿透防爬与付费墙；双语逐段对照、阅读中生词提取、划词查词及 AI 阅读理解出题 |
| 每日一句名言 | 集成 ZenQuotes 英文名言与本地离线回退名句库，AI 智能翻译中文解析，支持一键切换并随系统日期自动滚动 |
| 发音与音标自动补齐 | 卡片内置标准英美音标与 Web Speech TTS 离线/在线朗读发音；导入大批量词库时自动移交全局任务中心后台并发补齐音标，不阻塞任何前端交互 |
| 释义智能拆分 | 导入或浏览时自动提取主要释义与次要释义，保持词性标注完整，为抗干扰测试与主动回忆提供准确的基础语义边界 |
| 学习统计与记忆全景 | 复习量堆叠统计柱状图、记忆保留率平滑折线图、未来 7 天预期复习负荷、365 天动态强度提交热力图，以及全词库熟练度等级分布占比 |
| 跨端全量快照同步 | 配套 Cloudflare Worker 云函数，基于 HMAC-SHA256 安全验证与 KV 存储实现 Windows 与 PWA 移动端双向全量快照同步，支持设备追踪与并发冲突检测 |
| 备考日期与任务编排 | 设定考试目标日期（四六级、考研、雅思等），自动扣除冲刺缓冲期，根据剩余生词量动态平摊每日新学配额，支持一键生成 AI 分阶段宏观复习计划 |
| 严谨工程架构与测试 | 模块化清晰解耦，具备 Vitest 自动化单元测试矩阵、ESLint 9 严格代码规范与 GitHub Actions 持续集成工作流，确保系统长效演进稳定性 |

---

## 技术栈

| 层次 | 选型与说明 |
|---|---|
| 桌面原生壳 | **Tauri 2**（Rust 语言驱动，轻量高效，系统内存占用极低），集成 tauri-plugin-sql / dialog / http |
| 前端工程体系 | **React 18** + **TypeScript** + **Vite 7** 现代工具链 |
| 样式与交互系统 | **Tailwind CSS v4** + **shadcn/ui**（深度定制，7 款多主题色与深浅模式自由切换） |
| 状态与路由调度 | **Zustand 5** 响应式轻量状态库 + **React Router 7**（HashRouter 单页哈希路由） |
| 记忆算法实现 | **ts-fsrs**（FSRS-5 算法规范） |
| 数据持久层 | **双后端统一架构**：桌面端采用原生 SQLite 3（WAL 高性能模式）；Web / PWA 采用 sql.js WebAssembly 虚拟 SQLite 引擎结合 IndexedDB 离线持久化存储，共用同一套 Schema 迁移文件 |
| 可视化图表 | **Recharts** 响应式数据图表库 + 自定义 SVG 强度热力图组件 |
| 离线应用 (PWA) | **vite-plugin-pwa**（离线缓存、Manifest 声明与原生桌面/移动端添加到主屏幕支持） |
| 云端基础设施 | **Cloudflare Worker**（边缘云函数，提供 RSS 抓取清洗、DeepL 代理与全量快照同步服务） |

---

## 架构设计

```
+-------------------------------------------------------------+
| Tauri 2 Native Shell (Rust, 安全隔离)                       |
|  * tauri-plugin-sql     -> 本地 SQLite 文件 (reciter.db)    |
|  * tauri-plugin-dialog  -> 本地文件系统对话框                |
|  * tauri-plugin-http    -> 原生网络请求 (避开浏览器跨域限制)|
+-------------------------------------------------------------+
| React 18 + TypeScript + Vite (前端展示与交互层)             |
|  * 页面与流程组件解耦: dashboard-view / study-flow /        |
|    article / import-flow / exam-plan / settings-tabs        |
|  * 状态流转: useDeckStore / useStudyStore / useDbStore      |
|  * 领域仓储层: lib/db/ (card-repo, deck-repo, stats-repo)   |
|  * 调度与算法: ts-fsrs / recall-match / exam-planner         |
|  * 词库广场: lib/deck-hub/ ( catalogue 数据与远程解析器 )   |
+-------------------------------------------------------------+
          |                          |
          v                          v
   SQLite 3 单文件             Cloudflare Worker
   (reciter.db, WAL)          * /api/sync/*    全量快照同步
                              * /api/news/*    RSS 抓取与 Readability
                              * /api/deepl/*   翻译跨域反向代理
```

### 数据库设计要点

数据库迁移脚本位于 `src-tauri/migrations/*.sql`（Web 端镜像见 `src/lib/migrations.ts`）。核心表结构如下：

| 表名 | 用途描述 | 关键字段与约束 |
|---|---|---|
| `decks` | 词库实体 | `id`, `folder`, `name`（`folder + name` 联合唯一），`new_cards_per_day` |
| `cards` | 单词与卡片 | `id`, `deck_id`, `front`（`(deck_id, front)` 联合唯一，重导时保留记忆历史）；包含 `is_key`, `phonetic`, `meaning_primary`, `meaning_secondary`, `ignored` |
| `card_states` | FSRS 记忆状态（与卡片 1:1） | `card_id`, `state` (0-New, 1-Learning, 2-Review, 3-Relearning), `stability`, `difficulty`, `due`, `learning_steps` |
| `review_logs` | 历史复习日志 | `card_id`, `grade` (1-Again, 2-Hard, 3-Good, 4-Easy), `review_time`, `source` |
| `settings` | 全局持久化键值配置 | `key` (主键), `value` |
| `daily_stats` | 日常学习量汇总日报 | `date` (主键), `new_count`, `review_count`, `again_count`, `retention_rate` |

---

## 项目代码结构

```
Reciter/
├── src/                        # 前端源代码
│   ├── components/             # 通用与功能组件
│   │   ├── ai/                 # AI 对话助手与提示词模板
│   │   ├── common/             # MarkdownView、HeatmapGrid、WordDetailModal
│   │   ├── deck/               # 词库卡片与列表展示组件
│   │   ├── layout/             # 侧边导航栏与应用外壳
│   │   ├── quiz/               # 测试与拼写练习组件 (QuizSession)
│   │   ├── study/              # 学习卡片与子模式 (card/、exam-plan/)
│   │   └── ui/                 # 原子化基础 UI 部件 (shadcn/ui)
│   ├── lib/                    # 核心领域逻辑与库
│   │   ├── db/                 # 领域数据库仓库 (card-repo, deck-repo, stats-repo)
│   │   ├── deck-hub/           # 词库广场静态目录与远程解析导入器
│   │   ├── ai-client.ts        # 统一 OpenAI / DeepSeek / 本地大模型客户端
│   │   ├── day.ts              # 日期与日界计算工具函数
│   │   ├── exam-planner.ts     # 备考任务动态均摊与计划推演
│   │   ├── fsrs.ts             # FSRS-5 算法适配封装
│   │   └── recall-match.ts     # 主动拼写回忆匹配算法
│   ├── pages/                  # 业务路由页面及其子模块
│   │   ├── article/            # 每日一文精读业务组件 (Reader, Feed, WordSidebar)
│   │   ├── dashboard-view/     # 仪表盘业务组件 (StatsGrid, QuoteArticle, OrchestratedCard)
│   │   ├── import-flow/        # 导入流组件 (Dropzone, Manual, Ai, PreviewTable)
│   │   ├── settings/tabs/      # 系统设置选项卡 (General, Learning, AI, Backup, Data, Sync)
│   │   ├── study-flow/         # 学习流程组件 (DeckPicker, StudySession, TagScopeDialog)
│   │   ├── DailyArticle.tsx    # 每日一文页面入口
│   │   ├── Dashboard.tsx       # 仪表盘页面入口
│   │   ├── DeckHub.tsx         # 词库广场页面
│   │   ├── Import.tsx          # 导入页面入口
│   │   ├── Settings.tsx        # 设置页面入口
│   │   └── Study.tsx           # 学习主流程入口
│   ├── stores/                 # Zustand 全局状态流 (useDeckStore, useStudyStore 等)
│   └── types/                  # 全局 TypeScript 接口定义
├── src-tauri/                  # Tauri 2 原生桌面端 (Rust)
│   ├── src/                    # Rust 入口与命令注册
│   ├── migrations/             # SQLite 数据库升级脚本
│   ├── icons/                  # 桌面端应用图标
│   └── tauri.conf.json         # Tauri 配置文件
├── tests/                      # Vitest 自动化单元测试套件
│   ├── db/                     # 数据库与 CRUD 回归测试
│   └── lib/                    # 算法、导入解析、拼写判定测试
├── worker/                     # Cloudflare Worker 代理与快照同步服务
│   ├── src/index.ts            # Worker 核心处理逻辑 (安全防护、限流、KV 同步)
│   └── wrangler.jsonc          # Cloudflare Worker 配置文件
├── public/                     # 静态资源与 PWA Service Worker 资源
└── .github/workflows/          # GitHub CI/CD 工作流 (ci.yml, deploy-pages.yml)
```

---

## 开发与调试环境

### 前置环境依赖

- **Node.js**：>= 18.0.0（推荐使用 LTS 22.x）
- **npm**：>= 10.0.0
- **Rust**：Stable 工具链（`rustup` 安装，用于构建 Windows 原生桌面端）
- **Visual Studio 2022 C++ 生成工具**：包含 MSVC 工具集与 Windows SDK（供 Rust 链接器 `link.exe` 调用）

> 注意：本地 Vite 开发服务器配置端口为 **14210**，避开 Windows 系统 Hyper-V / WSL 常用的保留端口段。

### 常用命令指令表

```bash
# 1. 安装项目依赖
npm install

# 2. 启动前端本地开发热重载 (http://127.0.0.1:14210)
npm run dev

# 3. 运行自动化单元测试套件 (基于 Vitest)
npm test

# 4. 执行全项目代码规范与类型检查
npm run lint
npx tsc --noEmit

# 5. 前端全量生产打包 (构建输出至 dist/)
npm run build

# 6. 构建 PWA 网页独立包 (配置 GitHub Pages base 路径)
npm run build:web

# 7. 启动桌面端原生联合调试 (Tauri Dev, 需 Rust 环境)
npm run tauri dev

# 8. 打包 Windows 桌面正式安装包 (.msi 与 -setup.exe)
npm run tauri build
```

---

## 软件打包与分发

### Windows 原生客户端构建

在项目根目录下执行以下构建命令即可生成原生二进制产物：

```powershell
# 编译并打包为 Windows 独立执行程序及安装包
npm run tauri build
```

构建成功后，输出文件位于：
- **独立可执行程序**：`src-tauri/target/release/reciter.exe`
- **Windows 标准安装包**：`src-tauri/target/release/bundle/msi/Reciter_<版本>_x64_en-US.msi`
- **轻量 NSIS 安装程序**：`src-tauri/target/release/bundle/nsis/Reciter_<版本>_x64-setup.exe`

本地用户数据持久化保存在系统应用数据目录：`%APPDATA%\com.reciter.app\reciter.db`。

### PWA 网页版部署

```bash
npm run build:web
```

- 编译生成的静态文件可直接托管至 GitHub Pages、Cloudflare Pages、Vercel 或任意静态 Web 服务器。
- 手机、平板或浏览器直接访问部署地址，点击浏览器菜单中的「添加到主屏幕」或「安装应用」，即可享受全屏独立、离线可用的本地化学习体验。

---

## Cloudflare Worker 部署（可选）

配套的 Worker 位于 `worker/` 目录，负责支持跨端全量快照同步、新闻聚合与翻译跨域代理。

1. 进入 worker 目录并安装依赖：
   ```bash
   cd worker
   npm install
   ```
2. 绑定 KV 存储并设置访问密钥：
   ```bash
   # 配置同步密钥（用于保护个人快照不被匿名读取/覆盖）
   npx wrangler secret put SYNC_TOKEN
   ```
3. 部署上线：
   ```bash
   npm run deploy
   ```
4. 在客户端「设置 -> 数据同步」中填写 Worker 部署的公开域名与密钥，即可开启跨端快照多向备份。

---

## 鸣谢与开源参考

Reciter 的构建得益于全球开源社区与语言学习研究团队的宝贵成果：

- **[Anki](https://github.com/ankitects/anki)**：间隔重复学习与数字化闪卡生态的先驱，启发了 Reciter 的闪卡结构、复习流程与卡片状态流转设计。
- **[FSRS (Free Spaced Repetition Scheduler)](https://github.com/open-spaced-repetition/fsrs4anki)** 与 **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)**：Jarrett Ye 与 Open Spaced Repetition 团队开发的现代间隔重复算法，为 Reciter 提供了抗遗忘曲线与记忆稳定性建模核心。
- **[Qwerty Learner](https://github.com/RealKai42/qwerty-learner)**：优秀开源英语打字学习项目，为 Reciter 词库广场提供了权威结构化词汇大纲与 CDN 镜像标准支持。
- **[ECDICT](https://github.com/skywind3000/ECDICT)**：Skywind3000 主导维护的 77 万词条大型英汉词典，为词库词形还原、柯林斯星级与音标规范提供了权威基准。
- **[Tauri](https://github.com/tauri-apps/tauri)**：跨平台 Rust 桌面框架，赋予 Reciter 极小的运行内存占用与极佳的本地执行性能。
- **[sql.js](https://github.com/sql-js/sql.js)**：SQLite WebAssembly 移植项目，使得 PWA 网页端能够完全无缝复用原生 SQLite 架构与迁移语句。
- **[Mozilla Readability](https://github.com/mozilla/readability)**：Firefox 阅读模式核心开源库，驱动每日一文纯净正文提取与排版解析。
- **[Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)** 与 **[shadcn/ui](https://github.com/shadcn-ui/ui)**：为 Reciter 提供了现代、精细、高可访问性的设计语言与组件库支撑。

---

## 许可证

本项目遵循 [MIT 许可证](LICENSE) 开源。
