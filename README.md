# Reciter

> 本地客制化英语学习与记忆客户端 · Local-first English Learning & Spaced Repetition Client
>
> [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Reciter 是对标 Anki / MaiMemo 的开源英语学习工具，主打 **Markdown 自由导入**、**FSRS-5 间隔重复**、**AI 深度复习** 与 **跨端全量快照同步**。数据默认保存在本地，可构建为 **Windows 桌面应用** 或 **PWA 网页应用**。

---

## ✨ 功能特性

| 功能 | 说明 |
|---|---|
| 🗂️ 灵活导入 | Markdown / CSV / JSON / TXT / 粘贴文本批量导入；导入前预览、冲突检测、JSON 重名 diff、原子导入（失败回滚） |
| 🧠 科学记忆 | FSRS-5 间隔重复算法（ts-fsrs v5），目标记忆率可调（0.80~0.95），Learning / Review / Relearning 三态流转，评分时实时显示下一间隔 |
| 🏷️ 词库管理 | 文件夹分类、跨文件夹同名词库、自然排序（数字按数值比较）、重命名自动避让冲突、标签分类、重点词、乱序学习 |
| 📝 测试模式 | 填空（中译英）+ 选择（中译英 / 英译中），形近词干扰项，本地 / AI 选项随机打乱，掌握度回填 FSRS |
| 🤖 AI 能力 | OpenAI 兼容双通道（DeepSeek / Ollama / OpenAI）；AI 语境测试、深度复习、判分与申诉、AI 助手侧栏、FSRS 自适应策略、弱词本、AI 配置向导 |
| 📰 每日一文 | 内置 CGTN / CNN / Guardian / NPR / BBC + 自定义 RSS；分页、时间排序、收藏、生词识别 / 讲解 / 导入词库、逐段中英对照、AI 出题（按文章长度动态生成数量） |
| 💬 每日一句 | Quotable API 每周同步英文名言 + AI 中文翻译；本地数据库缓存，离线回退内置名句库 |
| 🔀 统一学习流 | 新卡教学 → 主动回忆 / 快速测试 / AI 深度攻克 / 经典翻转自适应编排；Learning 优先；单轮学习上限与休息锁；学习退出回到词库选择 |
| ⏭️ 跳过 / 忽略 | 学习中可跳过（本轮稍后重插）或忽略（永久排除，可在词库详情恢复） |
| 🔤 释义主次拆分 | 导入时自动识别主要 / 次要释义；AI 扫描词库可按当前标准（默认考研）拆分并保留词性 |
| 🔊 发音与音标 | 学习卡 TTS 发音；音标字段展示；导入后后台自动补齐音标（不阻塞导入流程） |
| 🎨 多主题外观 | 7 套完整主题（石墨黑 / 珍珠白 / 深海蓝 / 森林绿 / 星夜紫 / 暖阳橙 / 玫瑰红），侧栏平滑折叠 |
| 📊 学习统计 | 复习量堆叠柱状图、记忆保留率折线图、未来 7 天预期复习量、365 天热力图、词库掌握度全景 |
| 💾 本地优先 | 桌面端 SQLite（WAL），Web 端 sql.js WASM + IndexedDB；全量 JSON 导出 / 恢复 |
| 🔄 跨端同步 | Cloudflare Worker + KV 全量快照同步，PWA 与 Windows 可互相同步 |
| ⚖️ Easy Days | 开启后周末复习量默认减半，避免堆积 |
| 🎯 考试日期规划 | 设置考试日期与目标词库，主页显示倒计时与建议每日新学量；支持 AI 生成分阶段备考计划 |
| 🧹 学习偏好 | 三档 / 四档评分、主动回忆 10 秒柔和提示、忽略标签支持正则、每日一文截断长度可调 |

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | **Tauri 2**（Rust），tauri-plugin-sql / dialog / http |
| 前端 | **React 18** + **TypeScript** + **Vite 7** |
| UI | **Tailwind CSS v4** + **shadcn/ui**（暗色 / 亮色双主题） |
| 状态 / 路由 | **Zustand 5** + **React Router 7**（HashRouter） |
| 记忆算法 | **FSRS-5**（ts-fsrs v5） |
| 数据库 | SQLite（桌面）/ sql.js WASM + IndexedDB（Web），双后端共用同一套迁移 |
| 图表 | Recharts + 自定义 HeatmapGrid |
| PWA | vite-plugin-pwa（Web 端离线可用） |
| 云函数 | Cloudflare Worker（DeepL 代理 / RSS 代理 / KV 快照同步） |

---

## 🏗️ 架构

```
┌──────────────────────────────────────────────────────────┐
│ Tauri 2 Shell (Rust, 薄壳)                                │
│  ├─ tauri-plugin-sql     → SQLite (本地词库 + 进度)       │
│  ├─ tauri-plugin-dialog  → 文件选择 (Markdown/CSV/JSON)  │
│  └─ tauri-plugin-http    → AI API / Worker 请求          │
├──────────────────────────────────────────────────────────┤
│ React 18 + TypeScript + Vite (前端)                       │
│  ├─ UI: Tailwind v4 + shadcn/ui                          │
│  ├─ 状态: Zustand；路由: React Router 7 (HashRouter)     │
│  ├─ 解析: remark AST + 正则后处理 → Card                  │
│  ├─ SRS: ts-fsrs (FSRS-5)                                │
│  ├─ 学习流: 统一学习流 + StudyCard + QuizSession          │
│  └─ 图表: Recharts + HeatmapGrid                          │
└──────────────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
   SQLite 单文件                Cloudflare Worker
   (reciter.db, WAL)            ├─ /api/sync/*   KV 全量快照同步
                                ├─ /api/news*    RSS 代理 + Readability
                                └─ /, /api/deepl, /translate  DeepL CORS 代理
```

### 数据库 Schema 摘要

| 表 | 说明 | 关键字段 |
|---|---|---|
| `decks` | 词库 | `folder` + `name` 联合唯一，`new_cards_per_day` |
| `cards` | 卡片 | `(deck_id, front)` 唯一 → 重导入 upsert 保留进度；`is_key`、`weak_source`、`weak_dismissed`、`phonetic`、`meaning_primary`、`meaning_secondary`、`ignored` |
| `card_states` | FSRS 记忆状态（与卡片 1:1） | `state` / `stability` / `difficulty` / `due` / `learning_steps` / `desired_retention` / `algorithm_version` |
| `review_logs` | 复习记录 | `grade(1-4)`、`source(review\|quiz\|ai_test)`、`ai_question` / `ai_answer` |
| `settings` | KV 设置 | `key` / `value` |
| `daily_stats` | 学习日报（统计 O(1) 查询） | `new_count` / `review_count` / `again_count` / `retention_rate` |

> 迁移文件位于 `src-tauri/migrations/*.sql`，Web 端镜像位于 `src/lib/migrations.ts`。已应用的迁移不可修改，新变更一律新增迁移文件。

---

## 📁 项目结构

```
<项目根目录>
├── src/                        # React 前端
│   ├── pages/                  # Dashboard / 词库 / 词库详情 / 学习 / 导入 / 统计 / 设置 / 弱词本 / 每日一文
│   ├── components/             # ui(shadcn) / layout / study / quiz / stats / ai / deck
│   ├── stores/                 # Zustand（theme / db / deck / study）
│   ├── lib/                    # db / fsrs / migrations / sql 双后端 / ai-* / news / sync / importer / ...
│   ├── types/                  # 与数据库 Schema 对齐的全局类型
│   ├── App.tsx                 # 路由（HashRouter）
│   └── main.tsx                # React 入口
├── src-tauri/                  # Tauri 2 Rust 壳
│   ├── src/                    # main.rs / lib.rs（迁移注册 + 插件）
│   ├── migrations/             # SQLite 迁移（001~010）
│   ├── capabilities/           # 权限声明
│   ├── icons/                  # 应用图标（含 icon.ico）
│   └── tauri.conf.json         # Tauri 配置
├── worker/                     # Cloudflare Worker（同步 / DeepL / RSS）
│   ├── src/index.ts
│   └── wrangler.jsonc          # Worker 配置 + KV 绑定
├── public/                     # PWA 静态资源：icon.png / icon.svg / sql-wasm.wasm / PWA 图标
├── templates/markdown/         # Markdown 导入格式模板
├── research_doc/               # 需求 / 审计 / 分析文档
├── .github/workflows/          # GitHub Pages 自动部署（deploy-pages.yml）
├── AGENT.md                    # AI Agent 开发工作流手册
├── CHANGELOG.md                # Keep a Changelog
├── IDEA.md / PLAN.md           # 需求 / 实施计划
└── README.md                   # 本文档
```

> 构建产物不纳入版本控制：`dist/`（前端构建）、`src-tauri/target/`（Rust 构建）、`.install/`（本地脚本 / 测试 / 日志）。

---

## 🛠️ 开发环境

### 前置依赖

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Node.js | >= 18（开发环境 22.x） | 前端构建 |
| npm | >= 10 | 包管理 |
| Rust | stable | Tauri 壳；rustup 安装 |
| MSVC Build Tools | VS2022 VCTools | Windows 链接必需（`link.exe`） |
| WebView2 Runtime | Win11 自带 | Tauri WebView 运行时 |

> ⚠️ Vite 开发端口使用 **14210**（非模板默认 1420）。1420 落在 Windows Hyper-V/WSL 保留端口区间，绑定会报 `EACCES`。

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

### 常用命令

| 命令 | 说明 |
|---|---|
| `npm install` | 安装前端依赖 |
| `npm run dev` | 仅前端开发（http://127.0.0.1:14210） |
| `npm run build` | 前端类型检查（tsc）+ 生产构建（输出 `dist/`） |
| `npm run build:web` | 构建 PWA 网页版（`--base=/Reciter/`） |
| `npm run tauri dev` | 启动桌面应用（开发模式，热更新） |
| `npm run tauri build` | 打包桌面安装包 |
| `npx tauri icon <png>` | 重新生成应用图标 |

---

## 🚀 使用与分发

### Windows 正式版

构建前请先关闭正在运行的 Reciter（否则 exe 被占用无法覆盖）。为了不在二进制中泄露本机路径，使用路径重映射编译：

```powershell
$env:RUSTFLAGS = '--remap-path-prefix=C:\Users\<用户名>=C:\Users\anonymous --remap-path-prefix=<项目根目录>=F:\project'
npm run tauri build
```

产物位置：

```
src-tauri/target/release/
├── reciter.exe                    # 独立可执行文件
└── bundle/
    ├── msi/*.msi                  # Windows 安装包（开始菜单 / 桌面快捷方式）
    └── nsis/*-setup.exe           # NSIS 安装包
```

数据目录：`%APPDATA%\com.reciter.app\reciter.db`（SQLite，可整目录备份）。

### PWA 网页版（平板 / 手机直接使用，零工具链）

```bash
npm run build:web          # 输出 dist/（sql.js WASM SQLite + IndexedDB，数据离线持久化）
```

- 已配置 GitHub Pages 自动部署：`.github/workflows/deploy-pages.yml`，推送 `main` 后自动发布。
- 浏览器打开 `https://wirelesslaserray.github.io/Reciter/` → **添加到主屏幕** → 全屏离线运行。
- ⚠️ Web 端 AI 受浏览器 CORS 限制（DeepSeek / OpenAI 直连可能被拒，需代理）；Windows / Tauri 端 AI 不受影响。

### Cloudflare Worker（同步 / DeepL / RSS）

Worker 位于 `worker/`，需手动部署（未纳入 CI）：

```bash
cd worker
npm install

# 设置同步接口访问 Token（可选但强烈建议；未设置时同步接口返回 401）
npx wrangler secret put SYNC_TOKEN

npm run deploy
```

- `wrangler.jsonc` 已绑定 KV 命名空间 `KV_BINDING`，用于保存全量快照。
- 主要路由：
  - `/api/sync/meta`、`/api/sync/snapshot`：KV 全量快照同步（需 `X-Sync-Token`）。
  - `/api/news`、`/api/news/article`、`/api/news/custom`：RSS 列表 / 正文提取 / 自定义 RSS。
  - `/`、`/api/deepl`、`/translate`：DeepL CORS 代理（Worker 不保存用户 DeepL Key）。
- CORS 白名单包含本地开发、GitHub Pages、Tauri WebView 与 `Origin: null`（鸿蒙 / 部分 WebView）。

在应用内配置同步：**设置 → 同步**，填写 Worker 地址与 Token，即可上传 / 下载完整快照。

---

## 🧪 测试

仓库根目录的 `.install/` 是本地开发 / 测试脚本目录（gitignored，不随仓库分发），历史测试可复用：

```bash
npm run build                      # 前端类型检查 + 生产构建
npm run build:web                  # PWA 构建
npx tsx .install/parser-test.ts    # Markdown 解析器测试
npx tsx .install/6c-test.ts        # 学习流 / 队列逻辑测试
npx tsx .install/phase7-test.ts    # Phase 7 功能链路测试
npx tsx .install/sqljs-test.ts     # sql.js 后端 CRUD / 迁移 / 恢复链路
```

> 每个功能 / 修复完成后应同步新增或更新对应测试，并运行通过后再提交。

---

## 🗺️ 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 1 | Tauri 2 + Vite + React 18 + Tailwind v4 + shadcn 脚手架、路由骨架、暗色主题 | ✅ |
| Phase 2 | SQLite 接入 + 迁移、Deck / Card CRUD + upsert、Markdown / CSV / JSON 导入 | ✅ |
| Phase 3 | 集成 ts-fsrs（FSRS-5），due 队列 + 新卡配额 + 四按钮 | ✅ |
| Phase 4 | AI 设置页 + OpenAI 兼容客户端 + 完形 / 语境测试 + 判分 / 申诉 | ✅ |
| Phase 5 | 统计图表 + 热力图、JSON 导出 / 恢复、翻转动画、主题打磨 | ✅ |
| Phase 6A/6B/6C | 学习体验优化、AI 助手 / 弱词本 / 配置向导、统一学习流与进阶 | ✅ |
| 0.14+ | Easy Days、发音 / 音标、AI 智能生成、考试日期规划、每日一文、跨端快照同步、释义主次拆分、学习跳过 / 忽略、后台音标补齐 | ✅ |

后续方向：更多题型（AI 口语 / 拼写纠错）、备份加密、多端迁移、FSRS-6 升级预留等。

---

## 🤝 贡献

项目处于持续迭代阶段，欢迎参与。改动请遵循：

1. 使用 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:`）。
2. 每个功能 / 修复完成后更新 `CHANGELOG.md`（Keep a Changelog 规范）。
3. 开发前阅读 `AGENT.md`（AI Agent 工作流手册）与 `research_doc/` 分析文档。

---

## 📄 许可证

[MIT License](LICENSE) © 2026 [WirelessLaserRay](https://github.com/WirelessLaserRay)
