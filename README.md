<div align="center">
  <img src="public/icon.png" width="128" height="128" alt="Reciter Icon" style="border-radius: 28px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);" />

  # Reciter 📖✨

  <p><strong>现代化、本地优先（Local-first）英语学习与间隔重复记忆客户端</strong></p>
  <p><em>Modern English Learning & Spaced Repetition Client</em></p>

  <p>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
    <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Tauri-v2-blue.svg?logo=tauri" alt="Tauri: v2" /></a>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-61dafb.svg?logo=react" alt="React: 18" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?logo=typescript" alt="TypeScript" /></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg?logo=tailwindcss" alt="Tailwind CSS: v4" /></a>
    <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Tests-Vitest%20Passed-brightgreen.svg?logo=vitest" alt="Tests: Vitest" /></a>
  </p>
</div>

Reciter 是一款对标 Anki 与墨墨背单词的开源本地优先英语学习工具。项目深度融合了 **Markdown / 多格式自由导入**、**50+ 权威词库广场一键获取**、**FSRS-5 现代间隔重复算法**、**多源 TTS 真人发音与例句智能朗读**、**AI 智能语境与形近词门禁**、**Easy Days 减负日备考编排**、**每日外媒精读** 以及 **跨端全量快照同步**。

所有数据默认持久化于本地关系数据库（SQLite），既支持编译为轻量高效的 **Windows 桌面原生应用**（基于 Tauri 2），也支持作为纯静态、离线可用的 **PWA 网页应用** 部署运行。

---

## 🌟 核心特性

- 🧠 **FSRS-5 现代间隔重复引擎**：全面升级至前沿 FSRS-5 记忆模型（告别传统陈旧的 SM-2），支持 0.80~0.95 目标保留率自主调节，基于真实神经网络遗忘曲线动态推算最佳复习时机。
- 📚 **50+ 权威词库广场与全格式导入**：内置大学四六级、考研、专四专八、托福、雅思、GRE、高考等权威开源词库一键下载入库；原生支持 Markdown、Anki (`.apkg`)、CSV、JSON 导入与事务级防冲突。
- 🎙️ **多源 TTS 发音与长难句连续朗读**：集成网易有道（国内直连秒开）与 Google 翻译（纯正英美音），独创长句标点智能分片与队列播放技术，突破单次请求限制支持任意长例句流畅连读，自动净化构词括号与注释杂音。
- 📅 **Easy Days 减负日与备考任务编排**：绑定考试目标日期动态平摊每日配额，独创周一至周日自适应减负机制（支持周末休整、减半），科学防范备考疲态。
- 🤖 **AI 深度语境与形近词正交门禁**：OpenAI 兼容（原生支持 DeepSeek、本地 Ollama 等），实时语境完形填空出题与纠错；形近词引入编辑距离与正交相似度双重硬性门禁，坚决杜绝生硬凑数。
- 📰 **外媒精读与阅读防封穿透**：汇聚 CGTN、BBC、The Guardian 等权威外媒，集成防爬与付费墙降级穿透（Jina Reader / Wayback），支持划词即时释义与阅读生词一键入库。
- 🔒 **本地优先 (Local-first) 与跨端防冲刷同步**：数据 100% 存储于本地 SQLite，支持 Windows 原生桌面端与离线 PWA；配套 Cloudflare Worker 全量快照同步，具备冲突检测与本地最新做题记录防冲刷守护。

---

## 🛠️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│ Tauri 2 Native Shell (Rust 驱动，极低资源占用)               │
│  ├── tauri-plugin-sql     ──▶ 本地原生 SQLite 3 (WAL 模式)  │
│  ├── tauri-plugin-dialog  ──▶ 本地原生文件对话框            │
│  └── tauri-plugin-http    ──▶ 原生网络栈 (绕过 WebView 限制)│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ React 18 + TypeScript + Vite 7 (前端展示与交互层)           │
│  ├── 视图与组件: Dashboard / StudyFlow / Reading / DeckHub │
│  ├── 状态管理: Zustand 5 (useDeckStore / useStudyStore)     │
│  ├── 领域仓储层: lib/db/ (CardRepo / DeckRepo / StatsRepo) │
│  ├── 算法与引擎: ts-fsrs / tts / exam-planner / recall-match│
│  └── 视觉系统: Tailwind CSS v4 + shadcn/ui (7 款主题自由选) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
       本地关系数据库 (SQLite)        Cloudflare Worker (边缘云)
       %APPDATA%/.../reciter.db      ├── /api/sync/*   全量快照同步
       (或 Web 端 sql.js WASM)       ├── /api/news/*   RSS 抓取解析
                                     └── /api/deepl/*  翻译跨域代理
```

### 数据库核心实体设计

数据库迁移脚本位于 `src-tauri/migrations/*.sql`（Web 端镜像对应 `src/lib/migrations.ts`）：

| 实体表 | 用途描述 | 核心字段与设计要点 |
|:---|:---|:---|
| `decks` | 词库分类实体 | `id`, `folder`, `name`（`folder + name` 联合唯一约束），`new_cards_per_day` 配额控制 |
| `cards` | 单词与卡片 | `id`, `deck_id`, `front`（`(deck_id, front)` 联合唯一，重导时保留历史），音标与主次释义 |
| `card_states` | FSRS 算法状态 | `card_id`, `state` (0-新学/1-学习/2-复习/3-重学), `stability`, `difficulty`, `due`, `learning_steps` |
| `review_logs` | 历史复习流水 | `card_id`, `grade` (1-Again/2-Hard/3-Good/4-Easy), `review_time`, `source` |
| `settings` | 全局持久化配置 | `key` (主键), `value`；包含 TTS 音源、日界时间、考试规划、减负日设置等 |
| `daily_stats` | 每日学情统计日报 | `date` (主键), `new_count`, `review_count`, `again_count`, `retention_rate` |

---

## 💻 本地开发与调试

### 前置环境需求
- **Node.js**：`>= 18.0.0`（推荐 LTS 22.x）
- **npm**：`>= 10.0.0`
- **Rust**：Stable 工具链（用于编译构建 Tauri 桌面端）
- **C++ 生成工具**：Visual Studio 2022 C++ 生成工具（MSVC 工具集与 Windows SDK）

> 💡 **提示**：本地 Vite 开发服务器默认端口配置为 **`14210`**，专为避开 Windows 系统 Hyper-V / WSL 保留端口段设计。

### 常用开发命令

```bash
# 1. 安装项目依赖
npm install

# 2. 启动前端本地开发热重载 (http://127.0.0.1:14210)
npm run dev

# 3. 运行自动化单元测试套件 (Vitest 覆盖 66+ 项用例)
npm test

# 4. 执行代码规范与 TypeScript 类型检查
npm run lint
npx tsc --noEmit

# 5. 前端全量生产构建 (产物输出至 dist/)
npm run build

# 6. 构建 PWA 网页独立包 (配置 GitHub Pages base 路径)
npm run build:web

# 7. 启动桌面端原生联合调试 (Tauri Dev, 需 Rust 环境)
npm run tauri dev

# 8. 构建 Windows 桌面正式安装包与可执行程序
npm run tauri build
```

---

## 📦 打包与部署分发

### 🪟 Windows 桌面端构建
在项目根目录运行以下命令：
```powershell
npm run tauri build
```

打包成功后产物位于：
- **绿色免安装单文件**：`src-tauri/target/release/reciter.exe`（已内嵌路径脱敏重映射）
- **轻量 NSIS 安装程序**：`src-tauri/target/release/bundle/nsis/Reciter_<版本>_x64-setup.exe`
- **Windows MSI 安装包**：`src-tauri/target/release/bundle/msi/Reciter_<版本>_x64_en-US.msi`

本地用户数据默认安全存储于：`%APPDATA%\com.reciter.app\reciter.db`。

### 📱 PWA 网页版部署
```bash
npm run build:web
```
- 构建生成的静态资源位于 `dist/`，可直接托管至 GitHub Pages、Cloudflare Pages、Vercel 或私有服务器。
- 在手机或平板浏览器中访问，点击浏览器菜单的「添加到主屏幕」即可作为独立 App 运行，离线环境下亦可正常复习背词。

### ☁️ Cloudflare Worker 部署（可选同步服务）
配套的云端 Worker 位于 `worker/` 目录：
```bash
cd worker
npm install
# 配置个人专属同步令牌密钥
npx wrangler secret put SYNC_TOKEN
# 部署至 Cloudflare 边缘节点
npm run deploy
```
在客户端「设置 ➔ 数据同步」填入部署好的 Worker 域名与 Secret，即可体验多端秒级备份与快照漫游。

---

## 🤝 鸣谢与开源致敬

Reciter 的诞生离不开全球开源社区与记忆科学研究者的杰出成果：

- **[Anki](https://github.com/ankitects/anki)**：数字化闪卡记忆软件先驱，启发了 Reciter 的闪卡结构与复习流转设计。
- **[FSRS (Free Spaced Repetition Scheduler)](https://github.com/open-spaced-repetition/fsrs4anki)** 与 **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)**：Jarrett Ye 与 Open Spaced Repetition 团队打造的现代间隔重复算法，为 Reciter 提供了精准的记忆建模基石。
- **[Qwerty Learner](https://github.com/RealKai42/qwerty-learner)**：优秀的打字背词项目，为 Reciter 词库广场提供了高质量的词汇大纲与 CDN 镜像标准。
- **[ECDICT](https://github.com/skywind3000/ECDICT)**：Skywind3000 维护的 77 万词条大型英汉词典，为词库词形还原与音标规范提供了权威支持。
- **[Tauri](https://github.com/tauri-apps/tauri)**：跨平台 Rust 原生应用框架，赋予 Reciter 极低的内存占用与卓越性能。
- **[sql.js](https://github.com/sql-js/sql.js)**：SQLite WebAssembly 移植版本，使 Web/PWA 端能够 100% 复用原生 SQLite Schema 架构。
- **[Mozilla Readability](https://github.com/mozilla/readability)**：Firefox 阅读模式核心开源库，驱动每日一文纯净正文提取。
- **[Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)** 与 **[shadcn/ui](https://github.com/shadcn-ui/ui)**：为 Reciter 提供了现代、精细、高可访问性的设计语言。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。欢迎 Star、Fork 与提交 Pull Request！
