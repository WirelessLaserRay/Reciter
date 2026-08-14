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
- 全部 5 个阶段已完成。后续方向：Easy Days 负载均衡、更多题型（AI 口语/拼写纠错）、备份加密、多端迁移、FSRS-6 升级预留等

---

## [0.5.0] - 2026-08-14

> **里程碑**：Phase 5 完成 —— 统计图表（含自定义热力图）+ JSON 导出/恢复 + 动效打磨。（按需求**不做 WebDAV 备份适配**）

### Added

- **统计页**（Recharts 3 图 + 自定义热力图）：
  - 复习量趋势堆叠柱状图（近 30 天：新学 + 复习）
  - 记忆保留率折线图（1 − again/review，0~100%）
  - 未来 7 天预期复习量柱状图（按 FSRS due 本地日分组）
  - **365 天学习热力图**（GitHub 贡献图风格，纯 CSS Grid 零依赖，5 级颜色 + 图例 + 悬停提示）
  - 概览卡片：近 30 天复习/新学/平均保留率
- **数据备份**（设置 → 数据 标签）：
  - **导出备份**：全量 JSON（decks/cards+FSRS状态/review_logs/settings/daily_stats），tauri-plugin-dialog 保存对话框 + Rust 命令写文件
  - **导入恢复**：对话框选择 JSON → 清空现有数据后整体恢复（保留原始 ID 与关联）
- **统计查询层 `src/lib/stats.ts` + 纯函数 `stats-utils.ts`**（日期填充补零、保留率计算，可单测）
- **动效打磨**：主题切换平滑过渡（背景/卡片/边框 0.3s）、路由切换页面淡入（main key=pathname）
- Rust：`tauri-plugin-dialog` + 自定义命令 `write_text_file` / `read_text_file`

### Verified

- ✅ 统计纯函数单测 5 项通过（日期填充/补零/保留率 80%/100%/null）
- ✅ 备份查询只读验证：113 卡片 JOIN、daily_stats、未来 7 天 due=20、外键模式安全
- ✅ `npm run build` + `npm run tauri dev`（488 crates）窗口正常

---

## [0.4.3] - 2026-08-14
---

## [0.4.3] - 2026-08-14

### Changed

- **AI 深度复习**：题型改为「生成例句 / 生成语境题」；生成过程不再实时展示流式输出（显示加载提示），AI 输出完成后经适配层清洗再一次性展示题目
- **测试模式 AI 出题按题型方向单独适配**：
  - 填空·中译英 → AI 生成语境完形（挖空）题
  - 选择·中译英 → AI 生成语境句 + 4 个**英文单词**选项（含正确词）
  - 选择·英译中 → AI 生成语境句 + 4 个**中文释义**选项（含正确释义）
  - 新增「选择题出题」Prompt 模板（含 {direction} 占位符，方向自适应）
- **适配层方向校验**：英译中收到英文选项 / 中译英收到中文选项时判定方向不符，自动回退本地干扰项；支持「例句」输出段解析（例句+问题组合）
- Prompt 模板新增 2 套：例句、选择题出题（设置页 5 个模板标签）

### Verified

- ✅ 适配层 V2 单测通过：例句解析、方向校验（英译中×英文选项回退 / 中译英×英文选项使用 / 英译中×中文选项使用）、填空挖空、解析提取
- ✅ `npm run build` 通过

---

## [0.4.2] - 2026-08-14

### Changed

- **AI 出题适配层 `src/lib/ai-adapter.ts`**（重构 AI 题目处理链路）：
  - 解析 AI 按模板返回的结构化回复（**题目/选项/答案/解析** 分段提取），兼容完形与语境两种输出
  - **防答案泄漏**：展示文本自动剔除选项/答案/解析段；语境题取「对话」+「问题」
  - **选项适配**：AI 选项（A-D）解析并校验（≥2 个有效），选择题优先使用 AI 选项且确保含正确答案，无效时回退本地干扰项
  - **填空适配**：AI 未按模板挖空时，自动将目标词替换为 _____（词边界安全替换）
  - **解析展示**：作答后展示 AI 解析（💡）
- **测试模式 AI 出题**：改为经适配层嵌入测验（题目、选项、解析分别落位），AI 出题失败自动回退本地题目，不阻断测验
- **AI 深度复习**：展示与判分使用清洗后的题目（无泄漏），原始回复仅存档；review_logs 记录 ai_question（清洗后题目）与 ai_answer（用户回答）
- 测验记录补充 AI 字段：source='quiz' 时同时写入 ai_question/ai_answer

### Verified

- ✅ 适配层单测（tsx）8 项全通过：完形/语境解析、挖空（含词边界）、选项校验（2 项/1 项/兜底）、防泄漏检查、无标签兜底、正则字符挖空
- ✅ `npm run build` 通过

---

## [0.4.1] - 2026-08-14

### Fixed

- **AI 请求被 HTTP 作用域拦截**（"url not allowed on the configured scope"）：tauri-plugin-http 的 `http:default` 默认不放行任何来源，需在 capability 显式配置 URL Pattern 作用域。已在 `capabilities/default.json` 为 `http:default` 添加 allow：`https://*:*`（任意云端 AI 服务，如 DeepSeek/OpenAI 及用户自定义地址）、`http://localhost:*` 与 `http://127.0.0.1:*`（Ollama 本地）

---

## [0.4.0] - 2026-08-14

> **里程碑**：Phase 4 完成 —— AI 接口配置（DeepSeek/Ollama/OpenAI）、AI 深度复习（流式出题 + 判分 + 申诉）、测试模式 AI 出题全部接通。

### Added

- **AI 配置页**（设置 → AI 配置）：
  - 快速切换预设（DeepSeek / Ollama 本地 / OpenAI），云端/本地徽标自动识别
  - API 地址 / API Key / 模型 / 温度（0~1 滑块）配置，保存到 settings KV
  - **测试连接**按钮：发送极简请求验证配置并回显
  - **Prompt 模板编辑**：完形填空 / 语境造句 / AI 判分三套模板（支持 {word} {meaning} {level} {question} {answer} {userAnswer} 占位符），可保存、恢复默认
- **AI 客户端 `src/lib/ai-client.ts`**（tauri-plugin-http 直连，无 CORS）：
  - `chat`（非流式）、`streamChat`（SSE 流式逐 token 回调，兼容服务端忽略 stream 的 JSON 响应）
  - `generateQuestion`（完形/语境出题，渲染用户模板）、`gradeAnswer`（判分并解析 1-4 分与评语）、`testConnection`
- **AI 深度复习**（学习页新增按钮，`src/components/ai/AIDeepReviewDialog.tsx`）：
  - 流式生成完形填空/语境对话 → 用户作答（Ctrl+Enter 提交）→ AI 判分 → **申诉机制**（手动改评分 1-4）→ 评分回填 FSRS
  - review_logs 记录 source='ai_test' + ai_question/ai_answer（经共享 `applyReview` 链路）
- **测试模式 AI 出题**：AI 配置可用时启用「AI 出题」开关，填空生成语境完形题、选择题生成语境提示（题目带 ✨AI 徽标）
- **解析工具 `src/lib/ai-parse.ts`**：判分结果解析（**评分**: N / 评分：N / 行内数字，兜底 3）+ SSE 行解析（token/[DONE]/error/异常容错）
- Rust：`tauri-plugin-http` v2（capabilities 增加 http:default）

### Verified

- ✅ `npm run build`：tsc + vite 通过
- ✅ `npm run tauri dev`：tauri-plugin-http 编译（477 crates），窗口正常
- ✅ AI 解析单测（tsx）：判分 6 例 + SSE 6 例全部通过
- ✅ 数据库迁移 [1,2,3] 完好；词库数据增长中

---

## [0.3.3] - 2026-08-14
---

## [0.3.3] - 2026-08-14

### Fixed

- **测试模式退出按钮失效**：测试界面由 `/study` 路由内本地状态（`quizDeck`）渲染，"退出"使用 `<Link to="/study">` 属同路由跳转（无操作）。修复：QuizSession 增加 `onExit` 回调，退出时清除父组件状态回到词库选择
---

## [0.3.2] - 2026-08-14

### Fixed

- **评分按钮悬停说明未生效**：disabled 的 button 不触发指针事件，Radix Tooltip 收不到 hover。修复：`TooltipTrigger asChild` 改为包裹 `<span>`（tabIndex=0），未翻牌/评分中也可悬停查看四档说明

### Changed

- **测试模式支持按标签分组考察**：新增「考察范围」筛选（全部 / 按标签，如「单词」「词组」分开测试），仅显示有卡片的标签；题目数量与开始按钮实时反映筛选后卡片数

### Verified

- ✅ `npm run build` 通过；运行中应用模块热更新正常

---

## [0.3.1] - 2026-08-14

### Added

- **测试模式**（学习页每个词库新增「测试」入口，`src/components/quiz/QuizSession.tsx`）：
  - 三种题型：填空·中译英（输入拼写）、选择·中译英（看释义选单词）、选择·英译中（看单词选释义），支持混合题型
  - 题目数量可选（10/20/全部），干扰项从词库内随机抽取去重
  - 掌握度评价：填空自评（忘记/模糊/掌握），选择题自动判分可调整；掌握度按 FSRS 映射回填记忆状态（忘记=Again / 模糊=Hard / 掌握=Good），计入 review_logs（source='quiz'）与 daily_stats
  - 测试结果摘要（掌握/模糊/忘记统计）
- **AI 出题预留接口** `src/lib/ai-client.ts`：OpenAI 兼容 `AIClient` 骨架（DeepSeek/Ollama 双通道，Phase 4 填充真实调用）；测试模式已接入调用点（AI 配置可用时启用开关，生成题目将显示 AI 徽标），当前未配置时禁用并提示 Phase 4
- **共享评分持久化** `src/lib/review.ts`：`applyReview()` 抽取学习/测试共用链路（FSRS 调度 → 状态持久化 → review_logs → daily_stats），`masteryToGrade()` 掌握度映射；设置读取移至 `src/lib/settings.ts` 避免循环依赖

### Fixed

- **卡片翻转闪烁**：评分后 `flipped` 状态在 await 之后才重置，新卡片会以"已翻转"状态渲染一帧露出释义。修复：评分前同步收起卡片 + 翻转容器按 `card_id` 加 `key` 强制重建
- 评分按钮增加 Tooltip 说明四档含义（忘了/困难/良好/简单及各自调度效果）

### Verified

- ✅ `npm run build`：tsc + vite 通过（1915 模块）
- ✅ 应用运行正常，测试模式组件可加载

---

## [0.3.0] - 2026-08-14

> **里程碑**：Phase 3 完成 —— FSRS-5 记忆算法集成，学习流程（due 队列 + 新卡配额 + 四档评分）可用。

### Added

- **FSRS-5 调度封装 `src/lib/fsrs.ts`**（ts-fsrs v5.4.1）：调度器缓存（按目标记忆率重建）、DB↔FSRS 状态转换（含 v5 新增 `learning_steps`）、`reviewCard` / `previewIntervals`（评分按钮间隔预览）/ `getRetrievability`（记忆可检索度实时展示）
- **学习队列核心 `src/stores/useStudyStore.ts`**：
  - 队列 = 今日到期卡片（Learning/Review/Relearning，due 升序）+ 配额内新卡（`deck.new_cards_per_day - 今日已学新卡`）
  - `rate()`：FSRS 调度 → 持久化 card_states → 写 review_logs（含 response_time_ms）→ 累加 daily_stats → 会话统计
  - Learning 状态与 Again 评分卡片自动重插队列尾部（同 session 内按步骤重复）
- **学习界面重写 `src/pages/Study.tsx`**：词库选择页 → 3D 翻转卡片（正面单词/背面释义+标签+可检索度）→ 四档评分按钮（显示预计间隔）→ 进度条 → 完成摘要；键盘快捷键 1-4
- **Dashboard 真实统计**：今日待复习（due < 日界）、新卡待学（state=New）
- **设置页 FSRS 控制**：目标记忆率滑块（0.80~0.95，改后调度器重建）、今日起始时间（默认 04:00，时区陷阱对策）
- **迁移 002**：card_states 增加 `learning_steps`（Learning 步骤进度持久化，重启不丢）

### Fixed

- **迁移 checksum 校验失败**：修改已应用的 001_init.sql 导致 sqlx checksum 不匹配、后续迁移无法执行；还原 001 后恢复（教训：已应用迁移不可修改）
- **时间格式不一致（严重）**：SQLite `datetime('now')` 生成 `'YYYY-MM-DD HH:MM:SS'`，ts-fsrs 写入 ISO `'YYYY-MM-DDTHH:MM:SS.sssZ'`；字符串比较中 `' '`(0x20) < `'T'`(0x54) 导致 due 判断与新卡配额统计错乱（`countNewLearnedToday` 恒为 0 → 新卡配额失效）。迁移 003 规范化历史数据 + 应用层所有时间写入统一为 ISO UTC
- **daily_stats 增量丢失**：`ON CONFLICT DO UPDATE` 仅在行已存在时累加，当日首次复习插入默认值 0；改为 `excluded` 累加模式（新行直接写增量）

### Infrastructure

- 依赖：`ts-fsrs` v5.4.1；迁移 002/003
- 冒烟测试（tsx）：FSRS 调度流转验证（New→Learning→Review、Learning 步骤内 Again 重置、Review+Again→Relearning、间隔预览、可检索度、DB 往返）
- 学习流程 SQL 链路验证（Python sqlite3，回滚模式）：评分后 due 推移、`countNewLearnedToday`、日报跨天累加

### Verified

- ✅ `npm run build`：tsc + vite 构建通过
- ✅ `npm run tauri dev`：416 crates 编译，窗口正常
- ✅ 迁移 [1,2,3] 全部应用；card_states 时间统一 ISO 格式
- ✅ FSRS 单测：新卡预览（Again 1min/Hard 6min/Good 10min/Easy 7d）、Learning 毕业 2d、Relearning 1h10m

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
