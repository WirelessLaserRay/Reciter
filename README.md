# Reciter 📖✨

> 现代化、本地优先（Local-first）英语学习与间隔重复记忆客户端 · Modern English Learning & Spaced Repetition Client
>
> [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
> [![Tauri: v2](https://img.shields.io/badge/Tauri-v2-blue.svg?logo=tauri)](https://tauri.app/)
> [![React: 18](https://img.shields.io/badge/React-18-61dafb.svg?logo=react)](https://react.dev/)
> [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?logo=typescript)](https://www.typescriptlang.org/)
> [![Tailwind CSS: v4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg?logo=tailwindcss)](https://tailwindcss.com/)
> [![Tests: Vitest](https://img.shields.io/badge/Tests-Vitest%20Passed-brightgreen.svg?logo=vitest)](https://vitest.dev/)

Reciter 是一款对标 Anki 与墨墨背单词的开源本地优先英语学习工具。项目深度融合了 **Markdown / 多格式自由导入**、**50+ 权威词库广场一键获取**、**FSRS-5 现代间隔重复算法**、**多源 TTS 真人发音与例句智能朗读**、**AI 智能语境与形近词门禁**、**Easy Days 减负日备考编排**、**每日外媒精读** 以及 **跨端全量快照同步**。

所有数据默认持久化于本地关系数据库（SQLite），既支持编译为轻量高效的 **Windows 桌面原生应用**（基于 Tauri 2），也支持作为纯静态、离线可用的 **PWA 网页应用** 部署运行。

---

## 🌟 核心功能特性

### 📚 1. 词库管理与自由导入
- 🌐 **词库广场 (Deck Hub)**：内置 50+ 权威开源词库（覆盖大学四六级、考研、专四专八、托福、雅思、GRE、GMAT、高考及程序员高频词），支持一键远程下载入库；支持任意符合规范的 GitHub / CDN Raw JSON 链接直接导入。
- 📥 **多格式通用导入**：原生支持 Markdown（基于 remark AST 语法树解析）、CSV、JSON、TXT 及 Anki (`.apkg`) 牌组包导入；具备导入前预览、冲突排查、重名词库智能消歧、标签提取与原子事务写入回滚机制。
- 🗂️ **结构化分类整理**：支持嵌套文件夹与独立同名分类、多层级面包屑导航、全局模糊即时检索、自然数字智能排序、重点词标星与已掌握标签排除。

### 🧠 2. 现代间隔重复记忆引擎 (FSRS-5)
- 📈 **科学抗遗忘模型**：完整集成 FSRS-5 现代神经网络间隔重复算法（基于 `ts-fsrs v5`），全面替代传统 SM-2 算法。
- 🎛️ **保留率自主调节**：支持 0.80 ~ 0.95 目标记忆保留率自定义，严密流转 New / Learning / Review / Relearning 状态机，根据历史复习轨迹即时推算下一次最佳复习间隔。
- 🔄 **自适应复合学习流**：无缝融合卡片教学、桌面主动回忆（首字母/全拼即时核对）、移动端跟打回忆、快速测试（中英双向形近词抗干扰）、AI 深度攻克与经典翻转六大形态。

### 🔊 3. 专业 TTS 发音矩阵与例句朗读
- 🎙️ **多音源自由切换**：
  - **网易有道词典 TTS**：国内直连极速发音（毫秒级响应，无需翻墙，高保真英美真人原声）；
  - **Google 翻译 TTS**：纯正美式/英式真人发音，原生支持单词与完整例句长难句朗读（需网络代理）；
  - **系统语音引擎 (Web Speech)**：完全离线可用，零网络依赖，支持无限长例句。
- 🛡️ **严格固定音源 vs 智能优选**：支持“网络异常时自动回退系统语音”显式开关。用户选择固定音源时严格遵循设置，杜绝擅自回退机械音；智能优选模式下则自动真人优先、系统兜底。
- 📖 **超长例句智能分片与连续队列朗读**：突破 Google TTS 单次 ~180 字符限制，独创 `splitTextForTTS` 按标点符号智能切分子句，并通过 `playAudioUrlList` 队列无缝连贯朗读长例句。
- 🧼 **发音与拼写文本清洗引擎**：`cleanTextForTTS` 自动识别并忽略卡片中嵌入的构词括号（如 `recov(er)` 读写完整单词 `recover`），净化变体斜杠（`theatre / theater`），剥离词性标记（`[adj.]`、`(n.)`）与中文注释，消除 TTS 噪音。

### 📅 4. 备考任务编排与 Easy Days 减负日
- ⏱️ **倒计时智能均摊**：绑定四六级、考研、雅思等目标考试日期，自动扣除冲刺缓冲期，根据剩余生词量动态推演每日新学配额。
- ☕ **Easy Days 减负与休整日机制**：支持周一至周日独立配置减负系数（100% 满额、50% 减半、0% 专属休整日），提供“周末双休”、“周日休整”、“周末减半”等一键预设；休整日自动免除新词压力并折减复习负荷，劳逸结合防止倦怠。
- 🧭 **启发式学情诊断与 AI 规划**：动态感知减负日状态，向用户输出自适应的备考排期建议与阶段性复习指南。

### 🤖 5. AI 智能测评与助记辅助
- 🔌 **标准大模型接口**：OpenAI 兼容规范，开箱即用支持 DeepSeek、Ollama 本地离线大模型及 OpenAI 各类模型。
- 📝 **语境填空与自动批改**：AI 结合单词释义实时生成语境例句与完形填空试题，支持智能评分、纠错解析与一键申诉重评。
- 🎯 **形近词消歧“宁缺毋滥”门禁**：通过 Prompt 强约束结合代码层编辑距离 $\le 2$ 与形近度 $\ge 0.70$ 双重硬性正交门禁，杜绝生硬凑数，弱词回炉练习精准高效。

### 📰 6. 每日一文精读与新闻阅读
- 🌍 **权威外媒源聚合**：内置 CGTN、CNN、The Guardian、NPR、BBC 等优质新闻源，支持自定义 RSS 订阅。
- 🛡️ **阅读防封穿透**：集成 Jina Reader、Archive.today、Wayback 自动降级穿透防爬虫与付费墙，基于 Mozilla Readability 提取纯净正文。
- 💡 **精读辅助工具箱**：逐段双语对照、划词即时释义查询、文章生词一键加入复习词库、AI 智能生成阅读理解测试题。

### 📊 7. 统计全景与数据安全
- 📉 **多维数据可视化**：复习量堆叠统计柱状图、记忆保留率趋势平滑折线图、未来 7 天预期负荷预测、365 天提交热力图、全库熟练度等级分布。
- 💾 **多层级数据落盘守护**：做题每满 10 次阶段性写盘、切后台与关闭窗口触发 `beforeunload` / `visibilitychange` 即时强制落盘；SQLite WAL 模式配置优化，确保日志即时并入主库。
- ☁️ **跨端快照同步与冲突防护**：配套 Cloudflare Worker 云函数与 KV 存储，支持 Windows 桌面端与手机 PWA 双向全量快照同步；具备防冲刷检测机制，绝不静默覆盖本地最新复习数据，设备独立设置（`DEVICE_PRESERVED_SETTINGS`）隔离保存。

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
