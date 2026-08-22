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

### Added

- **弱词本支持手动导入**：可批量输入单词（支持 Tab/竖线/逗号分隔释义），一键加入弱词本
- **词库内一键加入弱词本**：词库详情页每张卡片可直接标记为弱词
- **弱词来源区分**：弱词本分别标注「手动添加」与「遗忘 N 次」自动收录
- **弱词阈值可配置**：设置页新增「弱词收录阈值」，默认 3 次
- **PWA 更新策略优化**：Service Worker 增加 `clientsClaim + skipWaiting`，新版本更快生效
- **学习忽略标签设置**：设置页可配置忽略标签，主页「今日学习」默认队列和统计会自动排除
- **主页每日一句**：每日展示英文名言 / 写作实用句子，并附中文翻译
- **主页 AI 智能测试提醒**：每 5 天提醒一次，AI 根据学习内容与掌握情况出题，默认考察已学词，优先覆盖到期/薄弱/重点词
- **文本框导入**：支持粘贴 Markdown / CSV / JSON / TXT 内容，自动识别格式后预览导入
- **词库文件夹分类**：支持用文件夹组织词库，不同文件夹可存在同名词库
- **JSON 导入冲突处理**：重名词库显示 diff、列出新增词/短语供勾选，可多选目标或新建 `*_1`
- **弱词本删除**：支持将单词移出弱词本，卡片与复习进度不受影响
- **备份/恢复事务化**：恢复过程在单个事务中执行，避免半状态；导入前显示备份摘要

### Changed

- **弱词入库阈值从 4 下调到 3**：达到 3 次遗忘即自动进入弱词本
- **统一弱词阈值到学习流/AI 策略**：学习模式与 AI 深度攻克使用同一可配置阈值
- **词库弱词 TOP 榜标注手动来源**：手动加入的弱词显示「手动」标签
- **统一提示框样式**：删除/加入弱词本/导入恢复/成功提示等改为与「设置 → 危险区」一致的对话框样式

### Fixed

- **词库详情页加载失败**：修复 `getDeckMasteryDistribution` 占位符与参数不匹配，词库修改/卡片编辑可正常保存
- **学习队列历史卡不再跳过后续卡片**：评分后保留当前卡作为历史记录，同时插入未来复习副本
- **学习队列越学越空**：队列剩余不足时自动补充学习过程中新到期的卡片
- **Learning/Relearning 步骤被截断**：步骤未完成前持续重插，直到 FSRS 进入 Review
- **Dashboard 待复习数不准确**：改为「此刻已到期且配额内」数量，与学习队列实际加载口径一致

### Removed

- **词库编辑卡片时移除「原文语境 / Markdown」编辑框**：卡片编辑保持单词、释义、标签、重点词

### Planned

- 后续方向：Easy Days 负载均衡、更多题型（AI 口语/拼写纠错）、备份加密、多端迁移、FSRS-6 升级预留等

---

## [0.14.6] - 2026-08-15

### Changed

- **新卡教学不再显示“原文语境”**：新词只展示单词/释义/同族词，原文语境保留给复习揭示阶段
- **主动回忆计时提示只在选择前显示**：点击「我知道 / 不知道」后不再提示思考时间
- **回答后显示“你的答案”**：主动回忆结果阶段用“你的答案 + 用户输入”替换原文语境

### Fixed

- **会话统计按独立卡片去重**：`stats.reviewed / again / hard` 现在代表“张”（独立卡片），同一张卡多次评分只计一次；新增 `stats.actions` 保留总评分次数
- **`daily_stats.review_count / again_count` 按独立卡片去重**：同一张卡当天多次评分不再注水，统计图表与记忆保留率更真实

### Verified

- ✅ `npm run build` 通过；`.install/6c-test.ts` 全过（新增 daily_stats 独立卡片去重断言）

---

## [0.14.5] - 2026-08-15

> 依据 `research_doc/study_logic_analysis.md` 修复队列调度与配额统计问题。

### Fixed

- **短间隔重排逻辑反了**：`insertByDue` 用绝对 due 与历史“已到期”卡比较，导致 Again/Learning 短间隔卡仍被排到队尾；改为 `insertByOffset` 按“新 due 距当前时间的相对偏移（约 10 秒/张）”估算插入位置，1 分钟后复习会插到约 6 张后而不是几百张后；同时天然兼容乱序队列
- **交错算法边缘体验**：复习卡很少、新卡很多时，剩余新卡先打乱再追加，不再大段顺序堆积队尾
- **非重插卡片未回写队列状态**：Good/Hard 评分后同样把最新 FSRS 状态写回 `queue`，避免未来“上一张/小结”读到过期数据
- **每日复习上限被重复评分提前耗尽**：`countReviewsToday` 改为 `COUNT(DISTINCT card_id)`，同一张卡多次 Again/模糊只计 1 张

### Verified

- ✅ `npm run build` 通过；`.install/6c-test.ts` 全过（新增相对偏移插入、剩余新卡打乱、独立卡片去重统计）

---

## [0.14.4] - 2026-08-15

### Fixed

- **队列末尾反复出现**：Learning 卡在「突击测试」之后即使仍处于 Learning 也不再重插当前会话（增加 `tested` 标记），新词流程收敛为：教学 → 1m 后突击测试一次 → 若记得则进入 Review（约 2 天）

### Changed

- **自检评分按钮配色**：忘记=红色、模糊=黄色、掌握=绿色，视觉对比更明显；「掌握」按钮统一排在最右侧
- 学习页评分按钮同步红/黄/绿（四档模式“简单”为强调色）配色

### Verified

- ✅ `npm run build` 通过；`.install/6c-test.ts` 全过（learning_steps 持久化 + 突击测试后进入 Review）

---

## [0.14.3] - 2026-08-15

### Added

- **新词延迟突击测试**：新卡教学后不再当场测试，点击「开始记忆」进入 Learning（1m），卡片随队列尾部在若干词之后出现并接受主动回忆/快速测试
- **词库乱序学习**：学习范围选择页新增「乱序学习」开关（按词库记忆），加载队列时打乱新卡与复习卡顺序
- **AI 出题选项乱序**：测试模式中 AI 生成的选项在展示前随机打乱（本地选项此前已乱序）

### Fixed

- 弱词本页左上角标题由「Reciter」修正为「弱词本」

### Verified

- ✅ `npm run build` 通过；`.install/6c-test.ts` 全过（新增 shuffleRows 集合保持检查）

---

## [0.14.2] - 2026-08-15

### Fixed

- **新卡反复出现**：`updateCardState` 白名单遗漏 `learning_steps`，导致 Learning 步骤进度从不入库，每次评分都退回第一步、卡片被反复插入队列；现正确持久化，新卡按 1m → 10m → Review（约 2 天）推进
- **同族词误判**：词族匹配改为「词干完全相等」判定，移除前缀包含兜底（修复 journey ↔ journal 等误报）

### Changed

- AI 学习助手移除未使用的快捷按钮（帮我讲解 / 换个方式练 / 下一个词），只保留消息输入、发送与 AI 判分

### Verified

- ✅ `npm run build` 通过
- ✅ `.install/6c-test.ts` 全过，新增：learning_steps 持久化推进、journey/journal 不误判

---

## [0.14.1] - 2026-08-15

### Fixed

- **选择题长释义溢出**：选项改为自适应行高（min-h-12 + 完整换行 + 选项编号），长释义不再挤占相邻选项
- **侧栏宽度动画**：改用内联 width + 专用 CSS 过渡（`transition: width 300ms`），保证折叠/展开的宽度变化始终平滑；AI 右侧栏同步使用 300ms 宽度 + 透明度动画

### Changed

- 精简设置页与学习/测试按钮中的冗余说明文字（保留关键提示）；移除学习设置标签中的内部编号（P0/P1/P2/P3）

### Verified

- ✅ `npm run build` 通过；`.install/6c-test.ts` 回归全过

---

## [0.14.0] - 2026-08-15

### Added

- **设置 → 数据 → 危险区**：
  - 重置学习进度：保留词库与卡片，清空 FSRS 记忆状态 / 复习记录 / 学习日报（卡片全部回到未学习）
  - 重置统计数据：清空复习记录与日报，保留当前记忆进度
  - 均带二次确认对话框与不可撤销提示
- **形近词干扰项**（`src/lib/similar-words.ts`）：以 Levenshtein 编辑距离为核心，叠加前后缀重叠与长度差加权，为英文单词选择题优先挑选拼写相似的干扰词；接入测试模式（choice-cn2en）与统一学习流的快速测试（熟练卡改为「看释义选单词 · 形近词干扰」，形近候选不足时自动回退）

### Changed

- **侧栏折叠动画重构**：改用 CSS `grid-template-columns 0fr/1fr` 平滑折叠文本（配合宽度/透明度过渡），彻底消除展开/收起时的生硬跳变；AI 右侧栏保留 300ms 宽度动画

### Verified

- ✅ `npm run build` 通过（tsc 严格检查 + vite 生产构建 + PWA workbox）
- ✅ `.install/6c-test.ts` 全过，新增：形近词排序/评分、危险区重置统计与重置进度（保留卡片）

---

## [0.13.0] - 2026-08-15

> 依据 `research_doc/learning_logic_audit.md` 学习逻辑审计报告，实施全部 13 项改进建议（P0/P1/P2/P3）。

### Added

- **队列编排优化（P0）**：新卡按比例交错穿插到复习卡中（`interleave_ratio`，默认每 5 张复习卡插 1 张，设置可调）；Learning/Again 卡按 FSRS 新 due 时间二分插入，短间隔复习不再被拖到队尾
- **回忆时限柔和提示（P1-④）**：主动回忆超过 10 秒显示建议提示（不强制，避免焦虑）
- **Leech 自动干预（P1-⑤）**：顽固词阈值 2 → 4（全局弱词本/掌握度全景/策略引擎同步），达到阈值自动标记为重点词
- **复习语境强化（P1-⑥）**：复习卡（经典翻转/主动回忆/快速测试）揭示答案后展示原文语境与同族词
- **新卡首测降阶（P2-⑦）**：识别先于产出——首测由拼写改为「看单词选释义」选择题（干扰项不足自动回退拼写）
- **干扰项池扩大（P2-⑧）**：选择题干扰项从当前队列扩大到整个词库
- **学习步骤可配置（P3-⑪）**：ts-fsrs `learning_steps` 设置项（默认 `1m,10m`，非法输入自动回退）
- **目标记忆率场景预设（P3-⑫）**：考研/考试 0.90、日常阅读 0.85、轻量维持 0.80
- **AI 右侧栏折叠动画**：展开/收起 300ms 宽度 + 透明度过渡，动画结束后再卸载面板

### Changed

- 到期队列排序：Learning/Relearning 卡片优先于 Review（P1-③）
- 熟练卡秒答阈值 8s → 5s（P2-⑨），可在设置中调整（2-15s）
- recall-match 仅对含中文的释义片段比对，过滤英文搭配（P1-⑩）
- AI 策略 deep_drill 阈值与 Leech 阈值统一为 4

### Verified

- ✅ `npm run build` 通过（tsc 严格检查 + vite 生产构建 + PWA workbox）
- ✅ `.install/6c-test.ts` 全过：模式引擎/队列交错/due 二分插入/学习步骤解析/词族/recall 过滤/掌握度分布/Learning 优先/Leech 自动标记

---

## [0.12.0] - 2026-08-15

### Added

- **统一多色主题**：明暗二元切换升级为 7 套完整主题（石墨黑 / 珍珠白 / 深海蓝 / 森林绿 / 星夜紫 / 暖阳橙 / 玫瑰红），每套主题同时定义背景、卡片与主色；右上角按钮保留明暗快捷切换，旧主题数据自动迁移
- **AI 会话缓存**：同一单词/词组的 AI 助手内容只生成一次并缓存（最多 30 条，含判分结果）；折叠侧栏、切换卡片后再回来直接复用，不再重复调用 AI，显著节省 token
- **侧栏折叠动画**：左侧导航折叠/展开加入 300ms 平滑过渡（宽度、文字淡出、图标缩放）

### Changed

- 设置 → 外观改为单张主题卡片网格（背景 + 主色预览）
- ThemeStore 升级 v3：`theme` 单字段（dark/light/blue/green/purple/orange/rose），自动迁移 v1/v2 持久化数据

### Verified

- ✅ `npm run build` 通过（tsc 严格检查 + vite 生产构建 + PWA workbox）
- ✅ `.install/6c-test.ts` 回归全过

---

## [0.11.0] - 2026-08-15

### Added

- **标签巩固测试**：按标签学习完全部内容后，完成页推荐并一键进入该标签集的选择/填空测试（`/study?quiz=<deckId>&tag=<tag>`），测试结束返回词库选择页
- **多强调色主题**：明暗模式 × 6 套强调色（中性/海蓝/森林/星紫/暖橙/玫红）自由组合，设置 → 外观选择并自动持久化
- **AI 助手右侧栏**：学习页 AI 学习助手移至右侧可折叠侧栏（桌面端），窄屏退化为卡片下方折叠面板，折叠状态持久化；左侧导航栏支持折叠为纯图标栏
- QuizSession 支持预设标签范围（`presetTag`）

### Changed

- **评分按钮 UI 修复**：按钮自适应高度与换行，emoji 与文字分行、字号分级，四档模式小屏自动 2×2，彻底消除文字溢出
- **AI 学习助手字号放大**：消息与结构化教学卡片由 13px 提升至 15px，行距加宽，输入框加大
- **AI 设置简化**：移除 Prompt 模板编辑区（内置 JSON 结构化模板 + 策略自适应，无需手动维护），AI 页仅保留连接配置与使用说明
- **边框对比度增强**：亮色边框 0.922 → 0.86、暗色边框 10% → 22%（输入框同步加深），解决黑白主题下边框看不清的问题

### Verified

- ✅ `npm run build` 通过（tsc 严格检查 + vite 生产构建 + PWA workbox）
- ✅ `.install/6c-test.ts` 回归全过（模式引擎 / 掌握度分布 / 队列 markdown_content）

---

## [0.10.0] - 2026-08-15

### Added（Phase 6B · AI 功能重塑）

- AI 策略引擎：根据 FSRS 状态自动选择 teach / recognition / production / deep_drill
- AI Chat Panel：内嵌学习页的多轮对话助手，支持讲解、换方式练、AI 判分与评分回填
- Prompt 重构：新增 JSON 结构化策略 Prompt，AI 响应优先走 JSON 解析，失败回退旧正则
- 弱词本页面：按词库筛选、展示遗忘次数/可检索度，支持 AI 攻克并回填 FSRS
- Dashboard 弱词提醒
- AI 配置引导向导：DeepSeek / Ollama / 自定义一键配置

### Added（Phase 6C · 学习流统一与进阶）

- **统一学习流模式引擎**（`src/lib/study-mode.ts`）：按 FSRS 状态自适应切换五种学习模式——新卡教学（new_teach）、主动回忆（recall）、快速测试（quick_test）、AI 深度攻克（ai_drill）、经典翻转（classic）；学习/测试二元入口合并为单一「开始学习」
- **多模式学习卡片**（`src/components/study/StudyCard.tsx`）：五种模式子视图 + 三档/四档评分组件；熟练卡秒答（8 秒内答对）自动记为 Good；AIChatPanel 支持按模式注入策略（strategyOverride）
- **语境沉浸展示**（`src/components/study/MarkdownContext.tsx`）：学习时展示 Markdown 原文语境并高亮目标词，支持折叠/展开
- **词库掌握度全景**（`src/components/deck/MasteryOverview.tsx`）：分段彩色进度条 + 已掌握/学习中/弱词/未学习四类统计 + 弱词 TOP 5 + 一键 AI 攻克跳转
- db 新增 `getDeckMasteryDistribution` / `getDeckTopWeakWords`；学习队列查询携带 `markdown_content`
- 词库详情页新增「高级测试」入口（`/study?quiz=<deckId>`）；Sidebar 新增「学习」直达导航
- 弱词本支持 `?deck=<id>` 参数定位词库

### Fixed

- Markdown 导入此前把 `cards.markdown_content` 存为空串，导致原文语境丢失；现导入时保留原始片段并按真实格式记录 `source_type`（支持 markdown/csv/json）

### Verified

- ✅ `.install/6c-test.ts` 全过：模式引擎 6 组判定、掌握度分布四类互斥且合计=total、TOP 弱词排序、队列携带 markdown_content
- ✅ `npm run build` 通过（tsc 严格检查 + vite 生产构建 + PWA workbox）

---

## [0.9.1] - 2026-08-15

### Changed

- **AI 学习助手回复渲染**（`AIReply.tsx`）：
  - AI 的 JSON 结构化回复解析为**教学卡片**（💡讲解 / 📖词根词缀 / 📝例句 / 🔤用法搭配 / 🌱引申词族 / ⚡易混词 / 🧠助记 / ✏️小练习 / ❓追问），不再裸露 JSON 代码块
  - 非 JSON 回复用 **react-markdown** 渲染（加粗/列表/代码块等样式）
  - 兼容旧 schema 字段，未知字段兜底展示
- **策略 Prompt 教学优先**：四种策略统一为教学 JSON 结构——先讲解（词义/词根/例句/用法/引申词），练习作为最后检验；deep_drill 强调助记与易混词辨析
- **三档评分按钮加大**：py-5、文字 text-lg、表情 text-xl、间隔 gap-4，不再拥挤（四档不变）

### Verified

- ✅ 教学 JSON 解析（讲解/例句数组/引申词）全过；四策略 Prompt 含教学要求；策略联动正常
- ✅ `npm run build` 通过

---

## [0.9.0] - 2026-08-15

> 附：新增 `AGENT.md` —— 给 AI Agent 的开发工作流手册（环境事实/部署流程/踩坑记录）

### Added（Phase 6A · 学习体验基础优化，依据 AI_LEARNING_OPTIMIZATION.md）

- **一键续学 + 智能推荐**（Dashboard）：自动推荐到期最多的词库一键开始；记录上次学习上下文（词库/标签/重点），提供「继续上次」入口；其他到期词库快速进入
- **三档评分**（默认，可在设置切换回四档）：不记得 😕 / 模糊 🤔 / 记得 😊，映射 Again/Hard/Good；Easy 自动分配给秒答的 Good
- **主动回忆模式**（默认开启）：先回忆再看释义——「我知道」输入释义（模糊比对）、「不确定/不知道」直接看释义后两档评分；可关闭回退经典翻卡
- **会话迷你小结**：每 N 张（默认 10，可调）插入一次小结卡片——记得/模糊/忘记统计 + 本轮薄弱词 + 一键「AI 帮我巩固」
- **设置页学习设置**：三档/四档切换、主动回忆开关、小结间隔；迁移 005 写入默认值（rating_mode/active_recall_enabled/session_summary_interval）

### Verified

- ✅ 6A 全部改动编译通过（`npm run build`）

---

## [0.8.3] - 2026-08-14

### Added

- **可自定义学习量（学习设置）**：
  - **每日新卡上限（默认值）**：全局默认（默认 20），新建词库自动应用；可在「词库」页重命名对话框对单个词库单独调整
  - **每日复习上限**：全局复习预算（默认 200，对标 Anki maximum reviews/day）；学习队列按"今日已复习数"截取 due 卡片，超出部分留待次日，避免过度复习
- db：`createDeck` 支持全局默认配额与参数覆盖；`countReviewsToday`（今日复习预算）；`getDueCards` 支持 LIMIT

### Verified

- ✅ 配额逻辑测试：全局默认 5 → 新建词库 5；词库级覆盖 30；countReviewsToday 计数正确；due LIMIT 截取生效

---

## [0.8.2] - 2026-08-14

### Fixed

- **编辑卡片后列表回跳顶部**：编辑/删除/添加后的 `load()` 会 `setLoading(true)` 使整个组件切换为加载占位，ScrollArea 被卸载重挂导致滚动位置丢失。修复：`load(silent)` —— 初始加载才显示 spinner，后续刷新静默执行，列表停留在原位置

---

## [0.8.1] - 2026-08-14

### Fixed

- **拖入导入在 Windows/Tauri 下失效**：WebView2 出于安全不向网页暴露 `dataTransfer.files`（HTML5 拖放拿不到文件）。修复：Tauri 环境改用原生拖放事件 `getCurrentWebview().onDragDropEvent` 获取文件路径 → `read_text_file` 命令读取 → 进入预览；Web/PWA 环境保留 HTML5 拖放
- **删除词库警告弹窗**：`window.confirm` 改为应用内警告对话框（显示词库名 + 卡片数 + FSRS/复习记录影响 + 备份建议），确认按钮红色 destructive

---

## [0.8.0] - 2026-08-14

### Added

- **重点词标记（Markdown 黑体识别）**：
  - 解析 Markdown 时检测列表项以 **strong（黑体）** 开头（如 `- **radiate vt./vi. (from) 发散；流露出**`）→ 标记为**重点词/词组**（`cards.is_key = 1`）；不加粗的次要词条为 0
  - CSV 支持 `key/重点` 列（值为 1/true/是 → 重点）
  - 迁移 004：`cards` 增加 `is_key` 列（Windows Rust + Web 镜像同步）
- **重点记忆/测试**：
  - 学习页「选择学习范围」新增「★ 重点词 / 词组」选项（显示数量），队列仅取重点卡（due + 新卡）
  - 测试模式「考察范围」新增「重点词 / 词组」筛选
  - 学习卡正面、词库列表、测验题头部显示 ★ 重点徽标
  - 词库详情：★ 筛选按钮 + 编辑对话框「重点词」开关（可手动调整）
  - 导入预览表格标记 ★（导入时写入 is_key）
- 导出/恢复包含 is_key；`getDeckKeyCount` 等查询

### Notes

- 已有卡片 is_key 默认 0；重新导入原 Markdown（upsert 会更新 is_key）或手动在编辑中勾选即可标记

### Verified

- ✅ 黑体识别：模板文件 7/11 重点识别正确；keyOnly 队列过滤生效；is_key 入库/计数/恢复测试通过

---

## [0.7.3] - 2026-08-14

### Fixed

- **导入后"词库有但卡片没有"**：此前失败的导入（restore 中途报错）会因 sql.js 的 300ms 防抖保存，把"已清空+只恢复词库"的半状态写入 IndexedDB。修复：**原子导入**——导入前快照数据库 → 恢复全部数据后自校验数量并立即 flush 持久化 → 任何失败自动回滚快照，绝不残留半状态
- `db` 新增 `snapshot()/restoreSnapshot()/flush()` 透传（sql.js 后端）

### Verified

- ✅ 原子导入测试：快照/正常导入（1 词库 100 卡）/ 失败回滚保留旧数据 全部通过

---

## [0.7.2] - 2026-08-14

### Fixed

- **导入桌面备份报 "tried to bind a value of an unknown type (undefined)"**：`getAllCardsWithState` 导出时主键别名为 `card_id`（`SELECT c.id AS card_id`），而 `restoreCard` 读取 `c.id` 得到 undefined → sql.js 绑定报错（Windows plugin-sql 静默容忍，Web 直接抛错）。修复：恢复逻辑改用 `card_id`（兼容 `id` 兜底），并给 sql.js 后端增加参数归一化（undefined → null，SQLite NULL 语义兜底）
- `db.init` 支持注入后端（测试/未来用途）

### Verified

- ✅ 端到端恢复测试：真实桌面备份（1 词库 / 100 卡 / 复习记录 / 设置 / 日报）完整恢复到 sql.js 后端，标签与 FSRS 状态正确

---

## [0.7.1] - 2026-08-14

### Fixed

- **Web 版初始化报 "duplicate column name: learning_steps"**：`runMigrations` 每次初始化无条件重跑全部迁移，IndexedDB 已有 `learning_steps` 列时 002 的 ALTER 报重复列错误（页面刷新即触发）。修复：新增 `_reciter_migrations` 迁移记录表 + 002 提供 `alreadyApplied` 列存在性检测，迁移幂等执行（全新/二次/历史库三场景验证通过）

---

## [0.7.0] - 2026-08-14

### Added

- **PWA 网页版（平板/手机/任何浏览器运行，零安卓工具链）**：
  - 存储层抽象为 `SQLBackend` 双实现：Tauri 环境用 `tauri-plugin-sql`（Windows 行为不变）；Web 环境用 `sql.js`（WASM SQLite）+ IndexedDB 持久化，**完全相同的 SQL 与迁移脚本**
  - 迁移 SQL 镜像为 `src/lib/migrations.ts`（web 端初始化时执行 001/002/003）
  - 环境检测 `isTauri()`：备份/导出改浏览器下载、导入改文件选择器、AI 请求回退 `window.fetch`
  - PWA 清单 + Service Worker（`vite-plugin-pwa`，离线可用），图标 192/512 已生成，`sql-wasm.wasm` 静态化
  - `build:web`（base=/Reciter/）+ GitHub Pages 自动部署工作流
- **使用方式**：GitHub Pages 部署后，平板浏览器打开网址 → 添加到主屏幕 → 全屏离线运行

### Notes

- Web 端 AI 功能受浏览器 CORS 限制，直连 DeepSeek/OpenAI 可能被拒（可加 Cloudflare Worker 代理或暂不用 AI）；Windows/Tauri 端 AI 不受影响
- Windows 端功能与行为完全不变（后端运行时自动选择）

### Verified

- ✅ sql.js 后端单测（node）：迁移/建库/upsert+RETURNING/标签 LIKE/时间函数全部通过
- ✅ `npm run build` + `build:web` 通过；dist 含 sw.js/manifest/图标/wasm

---

## [0.6.1] - 2026-08-14

### Added

- **MIT 许可证**：新增 `LICENSE` 文件（© 2026 WirelessLaserRay），`package.json` 标注 license 字段，README 增加许可徽标与说明

---

## [0.6.0] - 2026-08-14

### Added

- **词库重命名**：词库列表悬停出现 ✏️ 按钮 → 对话框修改名称与描述（UNIQUE 约束冲突有错误提示）
- **词条编辑**：词库详情每行 ✏️ 按钮 → 对话框修改单词/释义/标签（、或逗号分隔）
- **按标签分类学习**：学习页选择词库后进入「选择学习范围」——全部卡片 / 各标签（显示卡片数）；标签过滤作用于 due 队列与新卡选取，会话内显示当前标签徽标；测试模式原有标签筛选保持

### Changed

- db.ts：新增 `updateCard`、`getDeckTags`、`getDeckTagsWithCount`；`getDueCards`/`getNewCards` 支持可选标签参数（JSON 数组引号包裹的精确匹配，不误伤相似标签）
- 学习 store：`loadQueue(deckId, tag?)` + 会话标签名

### Verified

- ✅ 标签 SQL 精确匹配：真实词库 25/39/36 全对
- ✅ `npm run build` 通过

---

## [0.5.1] - 2026-08-14

### Added

- **正式版构建与分发**：`npm run tauri build` 产出独立 exe（18MB）+ MSI + NSIS 安装包
- **一键启动快捷方式**：桌面 + 开始菜单「Reciter」快捷方式（指向 release exe，无需安装即可用）

### Infrastructure

- README 新增「使用与分发」章节：日常使用/开发模式/移动端移植指南（Tauri 2 官方支持 Android/iOS，需适配存储与对话框）

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

- **安装 Rust 工具链**：rustup stable（rustc/cargo 1.97.1，minimal profile），路径 `%USERPROFILE%\.cargo`
- **安装 MSVC C++ Build Tools**：VS2022 BuildTools（MSVC 14.44.35207 + Windows 11 SDK 10.0.26100，`link.exe` 就绪），路径 `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`；经用户确认后以 UAC 提权静默安装
- **预热 cargo crate 缓存**：`cargo fetch` 预下载全部依赖源码，首次 `tauri dev` 编译仅耗时 1m12s
- **调试沙箱网络问题**：定位 pwsh 沙箱内代理（127.0.0.1:7890）TLS 失效问题，安装流程改经直连网络执行
- **`.install/` 目录**：集中存放环境安装脚本与日志（已加入 .gitignore）

### Verified

- ✅ `npm run build`：tsc 严格检查 + vite 生产构建通过
- ✅ `npm run tauri dev`：355 个 crate 编译成功，窗口启动（`Finished dev profile in 1m 12s`）
- ✅ 桌面窗口标题 "Reciter"，进程 Responding
- ✅ Vite dev server（127.0.0.1:14210）正常响应
