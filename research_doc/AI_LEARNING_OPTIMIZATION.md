# Reciter AI 学习功能与学习机制 · 深度诊断与优化方案

> 基于完整源码审计 + 市场竞品调研  
> 分析日期: 2026-08-15

---

## 一、竞品对标：市面成熟方案的长短处

### 1.1 竞品矩阵

| 产品 | 核心优势 | 核心短板 | Reciter 可借鉴 |
|---|---|---|---|
| **Anki** (+ FSRS) | 极致自由度；FSRS 算法标杆；生态庞大 | UI 古老；无 AI；卡片制作繁琐 | FSRS 调参最佳实践、插件生态思路 |
| **MaiMemo / 墨墨背单词** | 中文语境优化；学习数据可视化细腻；社区词库 | 闭源算法不透明；AI 只做简单例句 | 学习流程的流畅度设计、统计细节 |
| **MintDeck** | AI 从多种素材自动生成卡片；FSRS；Anki 导入 | 仅词汇维度；无对话/语境深度 | AI 生成卡片的自动化思路 |
| **RemNote** | 笔记即卡片；FSRS；知识图谱 | 非语言学习专用；UI 复杂 | 知识关联（同根词/词族）概念 |
| **Praktika AI** | 3D 角色沉浸式场景对话；实时语音 | 无 SRS 记忆系统；偏口语 | 场景化角色扮演对话设计 |
| **Enverson AI** | 免手对话；深度个性化；语法实时纠错 | 无 SRS；不适合应试 | 对话中嵌入纠错的流畅体验 |
| **Taalhammer** | 以完整句子为单位的 SRS；生产优先 | 功能简约；无 AI 出题 | 「句子 SRS」概念（而非孤立单词） |
| **不背单词** | 影视原声语境例句；沉浸感好 | 算法一般；无 AI 互动 | 真实语料语境展示方式 |

### 1.2 行业关键趋势（2026）

```
趋势 1: 「识别 → 产出」的跨越
        不止认识单词，要能在语境中主动使用
        ↳ 填空/翻译 → 造句/对话/写作

趋势 2: AI 从「工具」变成「教练」
        不是按钮式的出题机器，而是持续对话的个人导师
        ↳ 单次出题 → 多轮追问 → 弱点自适应

趋势 3: 学习素材的零成本获取
        上传任何原生素材（文章/视频字幕/PDF）→ AI 自动生成学习内容
        ↳ 手动录入 → 一键导入 → AI 增强

趋势 4: 从「记忆」到「理解」
        SRS 负责间隔调度，AI 负责检验深度理解
        ↳ 翻卡片 → 语境理解 → 词族扩展 → 用法辨析
```

---

## 二、Reciter 现有功能痛点诊断

### 2.1 AI 功能痛点（核心问题）

#### 痛点 ① AI 深度复习 = 一次性出题机器，而非学习伙伴

**现状**：[`AIDeepReviewDialog.tsx`](src/components/ai/AIDeepReviewDialog.tsx) 的流程是：

```
idle → 选题型（例句/语境题） → 等待 AI 生成 → 用户文本作答 → AI 判分 → 确认评分 → 关闭
```

**问题**：
- 整个过程是**单轮一锤子买卖**——AI 出一道题，用户答一次，结束
- 答错后没有追问、讲解、变体练习，用户完全不知道「为什么错」
- 没有「继续深挖」的选项（如：用这个词造个句？给我看同义词区别？）
- 对话框关闭后，AI 的上下文完全丢失，下次从零开始

**竞品对比**：Praktika / Enverson 的 AI 是持续对话式的——答对了追加难度，答错了降级解释，直到真正理解。

---

#### 痛点 ② AI 题目质量不稳定，模板输出格式脆弱

**现状**：[`ai-prompts.ts`](src/lib/ai-prompts.ts) 使用固定模板 + `**标签**: 内容` 格式。[`ai-adapter.ts`](src/lib/ai-adapter.ts) 用正则解析。

**问题**：
- 不同 AI 模型（DeepSeek vs Ollama vs GPT）的输出格式差异大，正则经常匹配失败
- `**题目**: ... **选项**: ... **答案**: ...` 这种格式要求过于严格
- 选项方向校验逻辑（中译英 vs 英译中）容易误判，导致回退本地干扰项
- 生成的例句/语境题质量参差不齐——有时太简单，有时脱离考研语境

---

#### 痛点 ③ AI 出题与 FSRS 调度完全割裂

**现状**：AI 出题时不考虑卡片的记忆状态。无论该词是刚学的新卡还是已经掌握到间隔 30 天的旧卡，AI 出的题都一样。

**问题**：
- 新学的词应出简单的识别题，掌握良好的词应出高难度的产出题
- 遗忘次数多（lapses 高）的「顽固词」需要特殊对待——如词根分析、同义对比
- AI 完全不知道用户的学习历史，每次出题都是盲人摸象

---

#### 痛点 ④ AI 只做「测验」，不做「教学」

**现状**：AI 的三种模式——例句、语境题、完形填空——本质都是「考试」。

**问题**：
- 学习 ≠ 测验。用户第一次学一个词时，需要的是**讲解**而非考验
- 没有「帮我理解这个词」的功能——如词根词缀分析、同义词辨析、搭配用法
- 没有「在我写的句子里纠错」的功能——用户不能主动产出
- 考研英语中大量的熟词生义需要深层解释，而不是做选择题

---

### 2.2 学习机制痛点

#### 痛点 ⑤ 学习流程步骤过多，「选择疲劳」严重

**现状**：从首页到开始学习需要 **4 步点击**：

```
Dashboard → 点击"开始学习" → 选择词库 → 选择标签范围 → 开始
```

**问题**：
- 高频操作路径太长——每天打开 App 都要走一遍
- 没有「一键续学」——上次学的哪个词库？继续！
- 没有智能推荐——今天应该优先学哪个词库（到期最多的）？

**竞品对比**：墨墨/不背单词打开即学——没有任何选择页面，直接开始今日任务。

---

#### 痛点 ⑥ 翻卡片模式过于传统，认知负担高

**现状**：[`Study.tsx`](src/pages/Study.tsx) 的学习交互：

```
显示单词正面 → 点击"显示答案" → 3D 翻转看释义 → 四档评分（忘了/困难/良好/简单）
```

**问题**：
- **四档评分认知负担高**——新用户不知道 Hard 和 Good 的区别，Anki 社区也长期争论这一点
- 翻卡片看释义 → 自评掌握度，用户容易「自欺欺人」——看到释义后觉得自己知道了就按 Good
- 没有**主动回忆**的强制机制——不需要动脑，看到释义就可以按按钮
- 记忆可检索度只在翻转后才显示，不够直观

---

#### 痛点 ⑦ 学习模式 vs 测试模式完全隔离

**现状**：学习（翻卡片 + 四档评分）和测试（填空/选择题）是两个独立入口，互不相干。

**问题**：
- 用户不知道什么时候该学、什么时候该测
- 学习和测试对 FSRS 的评分映射不同（测试用 forgot/fuzzy/mastered 三档，学习用 1-4 四档），容易混乱
- 没有「先学后测」的融合流程——理想的学习周期应该是：初学 → 巩固 → 测试 → 复习

---

#### 痛点 ⑧ 新卡学习没有「初始教学」阶段

**现状**：新卡片（state=0）直接进入翻卡片流程——显示单词 → 翻转看释义 → 评分。

**问题**：
- 第一次见到一个陌生词时，用户需要**理解**它：发音、词根、搭配、例句
- 当前流程把新卡和复习卡一视同仁——但「初学」和「复习」的心理过程完全不同
- 没有利用 Markdown 原始数据中丰富的注解信息（释义中的词性/搭配/同义词）

---

#### 痛点 ⑨ 词库内缺少宏观进度感知

**现状**：学习页面只显示「已完成 N · 剩余 M」，词库详情页只有简单的 learned/due 数字。

**问题**：
- 用户不知道整个词库的掌握进度（如 60% 已掌握 → 30% 学习中 → 10% 未学）
- 没有「薄弱词清单」——哪些词反复遗忘？哪些词的 retrievability 最低？
- 统计页的数据（Stats.tsx）偏宏观，不针对具体的词

---

#### 痛点 ⑩ 缺乏错词本 / 弱词追踪

**现状**：review_logs 记录了所有评分，但没有前端视图来分析和展示「薄弱词」。

**问题**：
- lapses（遗忘次数）高的「顽固词」没有特殊对待
- 没有自动标记弱词的机制——用户无法快速找到需要额外关注的词
- AI 不知道哪些词是用户的弱点，无法针对性出题

---

#### 痛点 ⑪ 学习会话没有节奏感

**现状**：学习会话是一个平坦的循环——卡片一张接一张，直到队列清空。

**问题**：
- 没有番茄钟/小节休息提示——长时间单调学习导致效率下降
- 没有阶段性小结——每学 10/20 张后总结一下掌握情况
- 没有「今日亮点」——如「你今天新学了 15 个词，其中 3 个需要特别注意」

---

#### 痛点 ⑫ AI 配置门槛高，普通用户望而却步

**现状**：使用 AI 功能必须先去设置页手动填写 API URL、Key、Model。

**问题**：
- 考研学生通常不了解 DeepSeek / Ollama API 的概念
- 配置预设（三个按钮）帮助有限——选了 DeepSeek 预设后还是要自己去申请 API Key
- 没有引导流程——用户甚至不知道 AI 功能的存在和价值

---

## 三、优化迭代方案

### 3.0 总体设计理念

```
                    ┌─────────────────────────────────┐
                    │   从「闪卡工具」升级为「AI 语伴」 │
                    └─────────────────────────────────┘

旧范式（Reciter 现状）              新范式（迭代目标）
─────────────────────              ─────────────────────
看到单词 → 翻转释义               看到单词 → AI 给语境 → 主动回忆
自评掌握度                        系统判定 + 用户确认
AI = 出题工具                     AI = 学习伙伴（教、练、测一体）
学习/测试/AI 三条线               统一学习流（自适应切换模式）
每次配置 AI 才能用                开箱即用，渐进引导
```

---

### Phase 6A: 学习体验基础优化（~5 天）

> 不涉及 AI 改动，纯粹优化学习机制的「怪怪的」感觉

#### 6A.1 一键续学 + 智能推荐

```
Dashboard 改造：
┌──────────────────────────────────────┐
│ 今日任务                    8月15日  │
│                                      │
│  📝 待复习 47 张  🆕 新卡 20 张      │
│                                      │
│  ┌──────────────────────────────┐    │
│  │   ▶  开始今日学习            │    │
│  │   考研英语——必考词 · 28 张到期│    │
│  └──────────────────────────────┘    │
│                                      │
│  其他词库：                           │
│  · 基础词部分  19 张到期              │
│  · 核心词汇    0 张到期  ✅           │
└──────────────────────────────────────┘
```

**具体改动**：
- Dashboard 自动推荐到期最多的词库，一键开始
- 记住上次学习的词库 + 标签（存 localStorage），提供「继续上次」入口
- 跳过 DeckPicker → TagPicker 流程，直接进入学习

#### 6A.2 简化评分：三档 + 快捷翻转

```
当前（四档 Anki 式）：        优化后（三档直觉式）：
┌────┬────┬────┬────┐        ┌──────┬──────┬──────┐
│忘了│困难│良好│简单│   →    │ 😕   │ 🤔   │ 😊   │
│ 1  │ 2  │ 3  │ 4  │        │不记得│ 模糊 │ 记得 │
└────┴────┴────┴────┘        └──────┴──────┴──────┘
                              映射: Again / Hard / Good
                              (Easy 自动分配给秒答的 Good)
```

**理由**：
- Anki 社区经验表明，大多数用户几乎从不按 Easy，四档增加的只是焦虑
- 三档评分认知成本大幅降低，与测试模式的三档（忘记/模糊/掌握）统一
- 保留高级设置中切换回四档的选项（for power users）

#### 6A.3 主动回忆模式（默认开启）

```
翻转前增加「先回忆」步骤：

┌─────────────────────────────┐
│         abandon             │
│                             │
│  你知道这个词的意思吗？       │
│                             │
│  ┌────────┐ ┌────────────┐  │
│  │ 我知道  │ │ 不确定/不知│  │
│  └────────┘ └────────────┘  │
│                             │
│  💡 点击「我知道」后输入释义   │
└─────────────────────────────┘

        ↓ 点击"我知道"

┌─────────────────────────────┐
│         abandon             │
│                             │
│  请输入你记得的释义：         │
│  ┌─────────────────────┐    │
│  │ 放弃               │    │
│  └─────────────────────┘    │
│  ┌────────────────────┐     │
│  │   检查              │     │
│  └────────────────────┘     │
└─────────────────────────────┘

        ↓ 系统比对

┌─────────────────────────────┐
│ ✅ 基本正确！                │
│ 你的回答: 放弃               │
│ 标准释义: vt. 放弃; 抛弃     │
│                             │
│  ┌──────┬──────┬──────┐     │
│  │ 😕   │ 🤔   │ 😊   │     │
│  │不记得│ 模糊 │ 记得 │     │
│  └──────┴──────┴──────┘     │
└─────────────────────────────┘
```

**效果**：强制主动回忆 → 深层编码 → 真正的记忆强化（而非被动翻卡片的虚假安全感）

#### 6A.4 学习会话节奏感

- 每 10 张卡片后插入 **迷你小结**：
  ```
  📊 本轮小结：学习 10 张 | 记得 7 | 模糊 2 | 忘记 1
  薄弱词: abandon, radical
  [ 继续学习 ] [ AI 帮我巩固薄弱词 ]
  ```
- 连续学习 25 分钟后提示休息（可关闭）
- 完成页面增加「今日之星」（retrievability 提升最大的词）和「需要关注」（lapses 最多的词）

---

#### 🤖 Phase 6A — Agent 实现步骤

> 以下步骤按顺序执行，每一步精确到文件与函数级别

##### 步骤 A-1: 数据库新增「学习偏好」字段

**涉及文件**：[`src/lib/sql/`](src/lib/sql) 新建迁移 + [`migrations.ts`](src/lib/migrations.ts)

```sql
-- src-tauri/migrations/004_study_prefs.sql（新建）
-- 无需建表，利用现有 settings KV 表存储以下键值：
--   last_study_deck_id    → 上次学习的词库 ID
--   last_study_tag        → 上次学习的标签
--   last_study_key_only   → 上次是否仅重点词
--   rating_mode           → "3" | "4"（评分档位）
--   active_recall_enabled → "true" | "false"（主动回忆模式）
--   session_summary_interval → "10"（每 N 张小结一次）
```

操作：
1. 在 [`migrations.ts`](src/lib/migrations.ts) 的 `MIGRATIONS` 数组末尾追加 `004_study_prefs` 条目
2. 利用 `db.setSetting()` / `db.getSetting()` 读写，无需修改 [`db.ts`](src/lib/db.ts) 的接口

##### 步骤 A-2: 新增学习偏好工具库

**新建**：`src/lib/study-prefs.ts`

```typescript
// 读写上次学习的上下文 + 用户偏好
export async function getLastStudyContext(): Promise<{deckId: number; tag?: string; keyOnly?: boolean} | null>
export async function saveLastStudyContext(deckId: number, tag?: string, keyOnly?: boolean): Promise<void>
export async function getRatingMode(): Promise<"3" | "4">       // 默认 "3"
export async function getActiveRecallEnabled(): Promise<boolean>  // 默认 true
export async function getSummaryInterval(): Promise<number>       // 默认 10
```

##### 步骤 A-3: Dashboard 智能推荐改造

**修改文件**：[`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx)

改动清单：
1. 导入 `getLastStudyContext`、`db.getDueCountByDeck`（需在 db.ts 新增）
2. 在 `useEffect` 中加载「上次学习」和「各词库到期数」
3. 新增 `db.getDueCountByDeck(deckId: number): Promise<number>` — 查询单个词库的 due 卡片数
4. 替换「快捷操作」Card 为两块区域：
   - **主推荐卡**：到期最多的词库 → 一键开始（调用 `useStudyStore.loadQueue` 后跳转 `/study`）
   - **续学入口**：如果 `lastStudyContext` 存在 → 「继续上次：{词库名} · {标签}」
5. 点击推荐卡 → 直接调用 `useStudyStore.loadQueue(deckId, tag, keyOnly)` → `navigate('/study')`，跳过 DeckPicker + TagPicker

##### 步骤 A-4: useStudyStore 保存学习上下文

**修改文件**：[`src/stores/useStudyStore.ts`](src/stores/useStudyStore.ts)

改动清单：
1. 在 `loadQueue` 函数成功加载后，调用 `saveLastStudyContext(deckId, tag, keyOnly)`
2. 在 `stats` 对象中新增三个追踪字段：
   ```typescript
   stats: {
     reviewed: number;
     newDone: number;
     again: number;
     hard: number;       // 新增: 模糊计数
     sessionStartTime: number;  // 新增: 会话开始时间戳
     weakWords: string[];       // 新增: 本轮薄弱词列表 (grade=Again 的 front)
   }
   ```
3. 在 `rate` 函数中：追踪 `hard` 计数和 `weakWords` 收集

##### 步骤 A-5: 三档评分 UI

**修改文件**：[`src/pages/Study.tsx`](src/pages/Study.tsx)

改动清单：
1. 导入 `getRatingMode` 并在组件中用 `useState` 加载当前模式
2. 定义三档评分常量：
   ```typescript
   const RATINGS_3 = [
     { grade: 1 as const, label: "不记得", emoji: "😕", hint: "Again", desc: "没想起来 → 立即重学" },
     { grade: 2 as const, label: "模糊",   emoji: "🤔", hint: "Hard",  desc: "想起来了但不确定 → 较短间隔" },
     { grade: 3 as const, label: "记得",   emoji: "😊", hint: "Good",  desc: "基本掌握 → 正常安排" },
   ];
   ```
3. 评分按钮区域（L310-L335）根据 `ratingMode` 渲染 `RATINGS_3` 或原始 `RATINGS`
4. 三档模式下 `grid-cols-4` → `grid-cols-3`
5. 在 `Settings.tsx` 中新增「评分模式」切换开关（三档/四档），写 `rating_mode` 到 settings

##### 步骤 A-6: 主动回忆模式

**修改文件**：[`src/pages/Study.tsx`](src/pages/Study.tsx)

改动清单：
1. 新增组件内状态：
   ```typescript
   const [recallPhase, setRecallPhase] = useState<"prompt" | "input" | "result" | "off">("prompt");
   const [recallInput, setRecallInput] = useState("");
   const [recallResult, setRecallResult] = useState<{match: boolean; similarity: number} | null>(null);
   ```
2. 新建工具函数 `src/lib/recall-match.ts`：
   ```typescript
   // 模糊比对用户输入与标准释义（分词 + 包含检查 + 编辑距离）
   export function matchRecall(userInput: string, standardBack: string): { match: boolean; similarity: number }
   ```
3. 卡片正面区域（L272-L293）根据 `recallPhase` 渲染：
   - `"prompt"`: 显示单词 + 「我知道 / 不确定」两个按钮
   - `"input"`: 显示单词 + 输入框 + 「检查」按钮
   - `"result"`: 显示比对结果 + 标准释义 + 三档评分按钮
   - `"off"`: 原有翻转模式（设置关闭主动回忆时）
4. 「不确定」按钮 → 直接翻转卡片 → 展示释义 → 仅显示「不记得/模糊」两档
5. 每张卡片切换时（`useEffect [index]`）重置 `recallPhase` 为 `"prompt"`

##### 步骤 A-7: 学习会话节奏 — 迷你小结

**修改文件**：[`src/pages/Study.tsx`](src/pages/Study.tsx)

改动清单：
1. 新建内部组件 `SessionMiniSummary`：
   ```tsx
   function SessionMiniSummary({ stats, onContinue, onAIReview }: {
     stats: StudyState["stats"];
     onContinue: () => void;
     onAIReview: (words: string[]) => void;
   })
   ```
2. 在 `StudySession` 中新增状态 `showMiniSummary: boolean`
3. 在 `handleRate` / `rate` 回调后检查：`if (done % summaryInterval === 0 && done > 0)` → `setShowMiniSummary(true)`
4. `showMiniSummary === true` 时渲染 `SessionMiniSummary`（替换卡片区域）
5. 迷你小结显示内容：本轮统计 + `stats.weakWords` 列表 + 「继续学习」 / 「AI 帮我巩固」按钮
6. 完成页面（L172-L213）增加：
   - 「需要关注」：显示 `stats.weakWords`（lapses 最多的 3 个词）
   - 「本次学习时长」：`Date.now() - stats.sessionStartTime` 格式化

##### 步骤 A-8: 设置页新增学习偏好区

**修改文件**：[`src/pages/Settings.tsx`](src/pages/Settings.tsx)

改动清单：
1. 在「学习设置」Tab 中新增三个控件：
   - **评分模式**：三档/四档 Switch → 写 `rating_mode`
   - **主动回忆**：开/关 Switch → 写 `active_recall_enabled`
   - **小结间隔**：数字输入（10/15/20）→ 写 `session_summary_interval`

---

### Phase 6B: AI 功能重塑（~7 天）

> 将 AI 从「出题工具」升级为「学习伙伴」

#### 6B.1 AI 对话式学习（替代单次出题）

**核心改动**：将 `AIDeepReviewDialog`（弹窗单轮模式）替换为 **AI Chat Panel**（侧边栏/内嵌多轮对话）。

```
┌─────────────────────────────────────────────┐
│                 学习主页面                    │
│                                             │
│        abandon vt. 放弃; 抛弃               │
│                                             │
│  ┌─ AI 学习助手 ──────────────────────────┐  │
│  │ 🤖 我来帮你深入学习 "abandon"：          │  │
│  │                                        │  │
│  │ 📖 词根: a-(去) + bandon(控制)          │  │
│  │    → 放弃控制 → 放弃; 抛弃              │  │
│  │                                        │  │
│  │ 📝 来试试在语境中使用吧：               │  │
│  │ "The hikers had to _____ their         │  │
│  │  campsite due to the approaching       │  │
│  │  storm."                               │  │
│  │                                        │  │
│  │ 你的回答: abandon                       │  │
│  │                                        │  │
│  │ ✅ 完全正确！再来一个更难的：            │  │
│  │ "在考研语境中, abandon oneself to       │  │
│  │  sth. 是什么意思？"                     │  │
│  │                                        │  │
│  │ ┌──────────────────────────────────┐    │  │
│  │ │ 输入回答...                      │    │  │
│  │ └──────────────────────────────────┘    │  │
│  │                                        │  │
│  │ [换个方式练] [帮我讲解] [下一个词]       │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**技术实现**：
- 保持消息历史（`ChatMessage[]`），多轮对话共享上下文
- AI 系统提示注入当前词的学习状态（stability, lapses, reps）
- 根据状态自适应：
  - 新词 (reps=0) → 先教后练（词根 → 例句 → 简单填空）
  - 复习词 (reps>0, stability 高) → 直接出难题（语境理解、同义辨析）
  - 顽固词 (lapses≥3) → 深度追问（词族扩展、对比记忆、助记法）

#### 6B.2 AI 自适应出题（与 FSRS 状态联动）

```typescript
// 新增: 根据卡片记忆状态决定 AI 出题策略
function getAIStrategy(state: CardState): AIStrategy {
  if (state.reps === 0) return "teach";           // 初学 → 教学模式
  if (state.lapses >= 3) return "deep_drill";     // 顽固词 → 深度攻克
  if (state.stability > 30) return "production";  // 稳定 → 产出练习
  return "recognition";                            // 一般 → 识别练习
}

// teach: 词根分析 + 例句展示 + 简单识别题
// recognition: 完形填空 / 选择题
// production: 造句 / 翻译 / 用法辨析
// deep_drill: 多维度练习 + 助记法 + 同义对比
```

#### 6B.3 智能弱词追踪与 AI 专攻

**新增「弱词本」功能**：

- 自动标记弱词条件：`lapses >= 2` 或 `最近 3 次评分中有 2 次 Again`
- 弱词本页面：按严重程度排序，显示遗忘次数、上次复习日期、retrievability
- **一键 AI 攻克**：选择弱词 → AI 生成专项练习套题（5 道递进难度的题）
- Dashboard 显示「今日弱词提醒：你有 N 个词反复遗忘」

#### 6B.4 AI Prompt 重构：JSON 结构化输出

```typescript
// 替代现有的 **标签**: 内容 格式
// 改用 JSON 格式输出，可靠度大幅提升

const SYSTEM_PROMPT = `
你是 Reciter 英语学习助手。
请严格以 JSON 格式回复，不要添加其他内容。
{
  "question": "题目文本",
  "options": ["A选项", "B选项", "C选项", "D选项"],  // 选择题时提供
  "answer": "正确答案",
  "explanation": "解析",
  "difficulty": "easy|medium|hard",
  "follow_up": "追问（可选）"
}
`;
```

**效果**：JSON 解析替代正则，兼容所有 AI 模型，彻底消除格式匹配问题。

#### 6B.5 AI 引导式开箱体验

```
首次打开 AI 功能时：

┌──────────────────────────────────────┐
│ 🤖 开启 AI 学习助手                  │
│                                      │
│ AI 可以帮你：                         │
│ ✅ 生成语境题目，让记忆更深刻          │
│ ✅ 分析词根词缀，理解而非死记          │
│ ✅ 针对弱词做专项训练                 │
│                                      │
│ 选择你的 AI 服务：                    │
│ ┌──────────────────────────────┐     │
│ │ 🔥 DeepSeek（推荐·高性价比） │     │
│ │ 需要 API Key → 30秒注册教程 →│     │
│ └──────────────────────────────┘     │
│ ┌──────────────────────────────┐     │
│ │ 💻 Ollama（本地·免费·离线） │     │
│ │ 需要安装 → 一键配置教程     →│     │
│ └──────────────────────────────┘     │
│ ┌──────────────────────────────┐     │
│ │ ⚙️ 自定义 OpenAI 兼容接口    │     │
│ └──────────────────────────────┘     │
│                                      │
│ [ 暂不配置 · 以后再说 ]               │
└──────────────────────────────────────┘
```

---

#### 🤖 Phase 6B — Agent 实现步骤

##### 步骤 B-1: AI Prompt 重构为 JSON 结构化输出

**修改文件**：[`src/lib/ai-prompts.ts`](src/lib/ai-prompts.ts)

改动清单：
1. 新增 `AIStrategy` 类型与策略专用 prompt：
   ```typescript
   export type AIStrategy = "teach" | "recognition" | "production" | "deep_drill";
   ```
2. 新增 `STRATEGY_PROMPTS: Record<AIStrategy, string>` 常量，每个策略对应不同的系统提示：
   - `teach`: 要求输出 JSON `{ etymology, examples[], simple_quiz, explanation }`
   - `recognition`: 要求输出 JSON `{ question, options[], answer, explanation }`
   - `production`: 要求输出 JSON `{ prompt, sample_answer, rubric, explanation }`
   - `deep_drill`: 要求输出 JSON `{ mnemonic, confusable_words[], quiz_chain[] }`
3. 所有 prompt 末尾强制追加：`"请严格以 JSON 格式回复，不要使用 markdown 标记包裹。"`
4. 保留现有 `DEFAULT_PROMPTS`（向下兼容），新增 `STRATEGY_PROMPTS` 并行

##### 步骤 B-2: AI 响应解析层重构

**修改文件**：[`src/lib/ai-adapter.ts`](src/lib/ai-adapter.ts) + [`src/lib/ai-parse.ts`](src/lib/ai-parse.ts)

改动清单：
1. 在 `ai-parse.ts` 中新增 JSON 安全解析函数：
   ```typescript
   export function parseAIJSON<T>(raw: string): T | null {
     // 1. 尝试直接 JSON.parse
     // 2. 提取 ```json ... ``` 代码块后解析
     // 3. 提取第一个 { ... } 块后解析
     // 4. 全部失败 → return null
   }
   ```
2. 在 `ai-adapter.ts` 中新增 `parseStructuredQuestion(raw: string)`：
   ```typescript
   // 先尝试 JSON 解析路径 → 再 fallback 到现有 parseSections 正则路径
   export function parseStructuredQuestion(raw: string): AIParsedQuestion { ... }
   ```
3. 修改 `parseAIQuestion` 函数：内部先调用 `parseStructuredQuestion`（JSON），解析失败再走原有正则逻辑
4. 修改 `adaptAIQuestion` 函数：兼容新 JSON 结构与旧 Markdown 结构

##### 步骤 B-3: AI 策略引擎

**新建文件**：`src/lib/ai-strategy.ts`

```typescript
import type { CardState } from "@/types";

export type AIStrategy = "teach" | "recognition" | "production" | "deep_drill";

/** 根据 FSRS 状态决定 AI 出题策略 */
export function getAIStrategy(state: CardState): AIStrategy {
  if (state.state === 0 || state.reps === 0) return "teach";
  if (state.lapses >= 3) return "deep_drill";
  if (state.stability > 30) return "production";
  return "recognition";
}

/** 构建注入到 AI system prompt 中的学习上下文 */
export function buildLearnerContext(state: CardState): string {
  return [
    `学习者当前状态：`,
    `- 该词已复习 ${state.reps} 次`,
    `- 遗忘次数: ${state.lapses}`,
    `- 记忆稳定性: ${state.stability.toFixed(1)} 天`,
    `- 难度系数: ${state.difficulty.toFixed(2)}`,
    state.lapses >= 3 ? `- ⚠️ 这是一个顽固词，请采用多角度记忆策略` : "",
    state.reps === 0 ? `- 🆕 这是首次学习，请先教学后练习` : "",
  ].filter(Boolean).join("\n");
}
```

##### 步骤 B-4: 弱词追踪 — 数据库查询

**修改文件**：[`src/lib/db.ts`](src/lib/db.ts)

新增方法：
```typescript
/** 获取弱词列表（lapses >= threshold，按 lapses 降序） */
async getWeakCards(deckId: number, threshold = 2, limit = 50):
  Promise<(Card & CardState)[]>

/** 全局弱词计数 */
async getGlobalWeakCount(threshold = 2): Promise<number>

/** 获取指定卡片最近 N 次评分 */
async getRecentGrades(cardId: number, n = 3): Promise<number[]>
```

SQL 示例：
```sql
SELECT c.*, cs.*
FROM cards c JOIN card_states cs ON c.id = cs.card_id
WHERE c.deck_id = ? AND cs.lapses >= ?
ORDER BY cs.lapses DESC, cs.stability ASC
LIMIT ?
```

##### 步骤 B-5: AI Chat Panel 组件

**新建文件**：`src/components/ai/AIChatPanel.tsx`

```typescript
interface ChatMessage {
  role: "system" | "assistant" | "user";
  content: string;
  timestamp: number;
}

interface Props {
  front: string;                  // 当前词
  back: string;                   // 释义
  cardState: CardState;           // FSRS 状态（策略引擎输入）
  onGradeDecided?: (grade: 1|2|3|4) => void;  // AI 评分回调
}
```

组件职责：
1. 初始化时根据 `getAIStrategy(cardState)` 决定首轮 system prompt
2. 自动发送首轮消息（teach → 讲解；recognition → 出题；等）
3. 维护 `messages: ChatMessage[]` 状态，每轮追加
4. 底部固定快捷按钮：`[换个方式练] [帮我讲解] [下一个词]`
5. 「帮我讲解」→ 追加 user message `"请帮我详细讲解这个词"`
6. 「换个方式练」→ 追加 user message `"请用另一种方式出题"`
7. AI 判分后显示评分 + 可手动修改 + 「确认并继续」按钮
8. 流式渲染 AI 回复（复用 `AIClient.streamChat`）

##### 步骤 B-6: 集成 AIChatPanel 到学习页面

**修改文件**：[`src/pages/Study.tsx`](src/pages/Study.tsx)

改动清单：
1. 移除对 `AIDeepReviewDialog` 的引用（L38, L101, L337-L345, L352-L359）
2. 在卡片区域下方（L337 位置）嵌入 `AIChatPanel`：
   ```tsx
   <AIChatPanel
     front={item.row.front}
     back={item.row.back}
     cardState={rowToState(item.row)}
     onGradeDecided={handleAIComplete}
   />
   ```
3. `AIChatPanel` 默认折叠显示一行提示「✨ AI 学习助手 — 点击展开」，展开后内嵌到学习页面中
4. 保留 `AIDeepReviewDialog.tsx` 文件但不再在 Study 页面中调用（向下兼容 QuizSession）

##### 步骤 B-7: 弱词本页面

**新建文件**：`src/pages/WeakWords.tsx`

功能清单：
1. 列表展示弱词：单词 | 释义 | 遗忘次数 | 上次复习 | 可检索度
2. 可检索度调用 `getRetrievability(state)` 实时计算
3. 按 `lapses` 降序排列
4. 支持按词库筛选
5. 每个弱词行有 「AI 攻克」按钮 → 打开 AIChatPanel（strategy = "deep_drill"）
6. 批量选择 → 「一键 AI 攻克」 → 依次对选中词进行 deep_drill 会话

**路由注册**：在 [`src/App.tsx`](src/App.tsx) 中新增 `/weak-words` 路由

**导航入口**：在 [`Sidebar.tsx`](src/components/layout/Sidebar.tsx) 的 `NAV_ITEMS` 中新增 `{ to: "/weak-words", label: "弱词本", icon: AlertTriangle }`

##### 步骤 B-8: Dashboard 弱词提醒

**修改文件**：[`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx)

改动清单：
1. 在 `useEffect` 中调用 `db.getGlobalWeakCount()` 获取弱词总数
2. 在「今日计划」Card 下方新增条件渲染：
   ```tsx
   {weakCount > 0 && (
     <Card className="border-amber-500/30">
       <CardContent>
         ⚠️ 你有 {weakCount} 个词反复遗忘
         <Button asChild variant="outline"><Link to="/weak-words">去弱词本</Link></Button>
       </CardContent>
     </Card>
   )}
   ```

##### 步骤 B-9: AI 引导式配置向导

**新建文件**：`src/components/ai/AISetupWizard.tsx`

组件职责：
1. 检测 `ai_base_url` setting 是否为空 → 空则显示向导
2. 三个选项卡：DeepSeek / Ollama / 自定义
3. DeepSeek 页：
   - 「30 秒获取 Key」按钮 → 外链到 DeepSeek 注册页
   - 输入 API Key → 自动填入 `base_url` = `https://api.deepseek.com` + `model` = `deepseek-chat`
   - 点击「测试连接」→ 调用 `AIClient.testConnection()`
4. Ollama 页：
   - 检测 `http://localhost:11434` 是否可达 → 自动发现
   - 选择本地模型列表
5. 自定义页：保持现有 Settings 中的 AI 配置表单
6. 向导完成 → 写入 settings + 关闭 + 设置 `ai_setup_completed = true`

**触发位置**：
- 在 Study 页面中，当用户首次点击 AI 相关功能且 `ai_setup_completed` 为 false 时弹出
- 在 Settings → AI 标签页顶部也可手动打开

---

### Phase 6C: 学习流统一与进阶（~5 天）

#### 6C.1 统一学习流：自适应模式切换

**废除「学习」和「测试」的二元分裂**，合并为单一学习流：

```
统一学习流：
┌─────────────────────────────────────────┐
│                                         │
│  新卡 (state=0)                         │
│  ├→ 初学教学模式（展示释义+例句+词根）  │
│  ├→ AI 讲解（如果启用）                 │
│  └→ 简单识别测试 → 评分                 │
│                                         │
│  复习卡 (due, stability < 10)           │
│  ├→ 主动回忆模式（先回忆再翻转）        │
│  ├→ 每 3 张插入一道 AI 题（如果启用）    │
│  └→ 三档评分                            │
│                                         │
│  熟练卡 (stability >= 10)               │
│  ├→ 直接快速测试（选择/填空）            │
│  └→ 秒答 → 自动 Good                    │
│                                         │
│  弱词 (lapses >= 2)                     │
│  ├→ 强制 AI 深度复习                     │
│  ├→ 多轮对话直到理解                     │
│  └→ 标记为已攻克 or 待继续               │
│                                         │
└─────────────────────────────────────────┘
```

#### 6C.2 语境沉浸展示

利用 Markdown 原始数据（`markdown_content` 字段已有），在学习时展示完整上下文：

```
┌─────────────────────────────────────┐
│  abandon  vt. 放弃; 抛弃            │
│                                     │
│  📖 原文语境：                       │
│  ┌─────────────────────────────┐    │
│  │ Unit 4 · 4.2 生词            │    │
│  │ ...                         │    │
│  │ · abandon oneself to sth.   │    │
│  │   陷入/沉湎于某事             │    │
│  └─────────────────────────────┘    │
│                                     │
│  📝 AI 例句：                       │
│  The government decided to          │
│  abandon the outdated policy.       │
│  政府决定放弃过时的政策。             │
└─────────────────────────────────────┘
```

#### 6C.3 词库掌握度全景视图

```
词库详情页新增掌握度分布：

掌握进度                         72%
████████████████████░░░░░░░░  ← 进度条

  🟢 已掌握 (stability≥15)    542  (54.2%)
  🟡 学习中 (0<stability<15)  178  (17.8%)
  🔴 弱词   (lapses≥2)        42   (4.2%)
  ⚪ 未学习  (state=0)         238  (23.8%)

弱词 TOP 5：
  1. abandon (遗忘 5 次, 可检索度 23%)
  2. radical (遗忘 4 次, 可检索度 31%)
  ...
  [ 一键 AI 攻克这些弱词 ]
```

---

#### 🤖 Phase 6C — Agent 实现步骤

##### 步骤 C-1: 学习模式引擎（统一学习流核心）

**新建文件**：`src/lib/study-mode.ts`

```typescript
import type { CardState } from "@/types";
import { State } from "@/lib/fsrs";
import { getAIStrategy, type AIStrategy } from "@/lib/ai-strategy";

export type StudyMode =
  | "new_teach"      // 新卡教学
  | "recall"         // 主动回忆（常规复习卡）
  | "quick_test"     // 快速测试（熟练卡）
  | "ai_drill"       // AI 深度攻克（弱词）
  | "classic";       // 经典翻转（降级模式 / AI 未启用时）

export interface StudyModeConfig {
  mode: StudyMode;
  aiStrategy: AIStrategy | null;   // AI 策略（null = AI 未启用）
  showMarkdown: boolean;           // 是否展示原文语境
  autoRecall: boolean;             // 是否启用主动回忆
}

/** 决定当前卡片的学习模式 */
export function resolveStudyMode(
  state: CardState,
  aiEnabled: boolean,
  activeRecallEnabled: boolean,
): StudyModeConfig {
  const isNew = state.state === State.New || state.reps === 0;
  const isWeak = state.lapses >= 2;
  const isStable = state.stability >= 10;

  if (isNew) {
    return {
      mode: "new_teach",
      aiStrategy: aiEnabled ? "teach" : null,
      showMarkdown: true,
      autoRecall: false,  // 新卡不需要回忆，先教
    };
  }
  if (isWeak && aiEnabled) {
    return {
      mode: "ai_drill",
      aiStrategy: "deep_drill",
      showMarkdown: true,
      autoRecall: false,
    };
  }
  if (isStable) {
    return {
      mode: "quick_test",
      aiStrategy: aiEnabled ? "production" : null,
      showMarkdown: false,
      autoRecall: false,  // 熟练卡直接快速测试
    };
  }
  return {
    mode: activeRecallEnabled ? "recall" : "classic",
    aiStrategy: aiEnabled ? "recognition" : null,
    showMarkdown: false,
    autoRecall: activeRecallEnabled,
  };
}
```

##### 步骤 C-2: 多模式学习卡片组件

**新建文件**：`src/components/study/StudyCard.tsx`

组件职责：根据 `StudyModeConfig` 渲染不同的学习 UI

```typescript
interface Props {
  row: StudyCardRow;
  modeConfig: StudyModeConfig;
  onRate: (grade: 1|2|3|4) => void;
  ratingMode: "3" | "4";
}
```

内部分支渲染逻辑：
```
switch (modeConfig.mode) {
  case "new_teach":     → <NewCardTeachView />
  case "recall":        → <ActiveRecallView />  // 来自 Phase 6A
  case "quick_test":    → <QuickTestView />      // 填空/选择，无翻转
  case "ai_drill":      → <AIChatPanel strategy="deep_drill" />
  case "classic":       → <ClassicFlipView />    // 现有翻转
}
```

各子视图职责：
- **NewCardTeachView**: 展示单词 + 完整释义 + markdown_content（如果有）+ AI 教学（如果有）→ 底部「开始记忆」→ 简单识别测试 → 评分
- **ActiveRecallView**: 步骤 A-6 中已实现的主动回忆流程
- **QuickTestView**: 从 QuizSession 中提取的单题选择/填空逻辑（复用 `pickDistractors`），秒答自动 Good
- **AIChatPanel**: 步骤 B-5 中已实现的 AI 多轮对话
- **ClassicFlipView**: 现有翻转逻辑的提取封装

##### 步骤 C-3: Study.tsx 集成多模式引擎

**修改文件**：[`src/pages/Study.tsx`](src/pages/Study.tsx)

改动清单：
1. 在 `StudySession` 顶部导入 `resolveStudyMode` + `StudyCard`
2. 为每张卡片计算模式：
   ```typescript
   const modeConfig = useMemo(
     () => item ? resolveStudyMode(rowToState(item.row), aiEnabled, activeRecallEnabled) : null,
     [item, aiEnabled, activeRecallEnabled]
   );
   ```
3. 替换 L264-L307（卡片翻转区域）为：
   ```tsx
   <StudyCard
     row={item.row}
     modeConfig={modeConfig!}
     onRate={handleRate}
     ratingMode={ratingMode}
   />
   ```
4. 移除 DeckPicker 中「学习」和「测试」的双按钮（L411-L419），合并为单一「开始学习」按钮
5. 保留 `QuizSession` 组件，但将入口降级为「高级 → 自定义测试」（从主学习流中移除）

##### 步骤 C-4: 语境沉浸展示

**新建文件**：`src/components/study/MarkdownContext.tsx`

```typescript
interface Props {
  markdownContent: string;  // cards.markdown_content 字段
  word: string;             // 高亮目标词
}
```

组件职责：
1. 解析 `markdown_content`（简单 Markdown → HTML）
2. 高亮目标词出现的位置（加 `<mark>` 标签）
3. 折叠显示：默认只显示目标词所在的段落/列表项，展开可看完整内容
4. 样式：浅灰底色卡片，左边线 accent 色

**集成位置**：在 `NewCardTeachView` 和 `ActiveRecallView` 的翻转后面板中，当 `markdown_content` 非空时渲染

##### 步骤 C-5: 词库掌握度全景视图

**修改文件**：[`src/pages/DeckDetail.tsx`](src/pages/DeckDetail.tsx)

新增数据查询（[`db.ts`](src/lib/db.ts) 中新增方法）：

```typescript
/** 获取词库的掌握度分布 */
async getDeckMasteryDistribution(deckId: number): Promise<{
  mastered: number;    // stability >= 15 且 lapses < 2
  learning: number;    // 0 < stability < 15
  weak: number;        // lapses >= 2
  unlearned: number;   // state = 0
  total: number;
}>

/** 获取词库 TOP N 弱词 */
async getDeckTopWeakWords(deckId: number, limit = 5):
  Promise<{ front: string; lapses: number; stability: number }[]>
```

SQL：
```sql
SELECT
  SUM(CASE WHEN cs.state = 0 THEN 1 ELSE 0 END) as unlearned,
  SUM(CASE WHEN cs.state > 0 AND cs.stability < 15 AND cs.lapses < 2 THEN 1 ELSE 0 END) as learning,
  SUM(CASE WHEN cs.stability >= 15 AND cs.lapses < 2 THEN 1 ELSE 0 END) as mastered,
  SUM(CASE WHEN cs.lapses >= 2 THEN 1 ELSE 0 END) as weak,
  COUNT(*) as total
FROM cards c JOIN card_states cs ON c.id = cs.card_id
WHERE c.deck_id = ?
```

**新建组件**：`src/components/deck/MasteryOverview.tsx`

组件职责：
1. 接收 `distribution` 数据
2. 渲染进度条（分段彩色条：绿/黄/红/灰）
3. 渲染四项统计（🟢 已掌握 / 🟡 学习中 / 🔴 弱词 / ⚪ 未学习）
4. 渲染弱词 TOP 5 列表
5. 「一键 AI 攻克」按钮 → 跳转弱词本（带词库筛选参数）

**集成位置**：DeckDetail.tsx 页面顶部，在卡片列表之前

##### 步骤 C-6: 路由与导航整理

**修改文件**：[`src/App.tsx`](src/App.tsx) + [`src/components/layout/Sidebar.tsx`](src/components/layout/Sidebar.tsx)

改动清单：
1. App.tsx 路由新增：
   ```tsx
   <Route path="/weak-words" element={<WeakWords />} />
   ```
2. Sidebar.tsx 导航项调整：
   ```typescript
   const NAV_ITEMS = [
     { to: "/",           label: "今日学习", icon: LayoutDashboard },
     { to: "/decks",      label: "词库",     icon: BookOpen },
     { to: "/study",      label: "学习",     icon: GraduationCap },  // 新增直达入口
     { to: "/weak-words", label: "弱词本",   icon: AlertTriangle },  // 新增
     { to: "/import",     label: "导入",     icon: FileUp },
     { to: "/stats",      label: "统计",     icon: BarChart3 },
     { to: "/settings",   label: "设置",     icon: Settings },
   ];
   ```
3. 从 Study 页面的 DeckPicker 中移除「测试」入口按钮，将独立测试模式移至「设置 → 高级 → 自定义测试」或在词库详情页保留入口

##### 步骤 C-7: 全量验证与清理

1. 验证学习流完整路径：Dashboard 一键学习 → 新卡教学 → 主动回忆 → 迷你小结 → AI 对话 → 完成
2. 验证弱词链路：Dashboard 弱词提醒 → 弱词本 → AI 攻克 → 评分回填 FSRS
3. 验证旧入口降级：测试模式仍可通过词库详情页或高级设置访问
4. 移除不再使用的 dead code（如 `AIDeepReviewDialog` 在 Study 中的引用）
5. 确认所有 FSRS 评分回填路径统一使用 `applyReview()`

---

## 四、优先级与工期汇总

| 阶段 | 内容 | 工期 | 价值 |
|---|---|---|---|
| **Phase 6A** | 一键续学、三档评分、主动回忆、会话节奏 | ~5 天 | 🔴 体验质变——解决「怪怪的」感觉 |
| **Phase 6B** | AI 对话式学习、弱词追踪、JSON 输出、引导 | ~7 天 | 🔴 AI 价值质变——从工具到伙伴 |
| **Phase 6C** | 统一学习流、语境沉浸、掌握度全景 | ~5 天 | 🟡 完整性——融合为一体 |

**建议顺序**：**6A → 6B → 6C**（先修地基，再建高楼）

---

## 五、完整文件变更清单

> 按三个 Phase 汇总所有涉及的文件

### Phase 6A 文件清单（8 个步骤）

| 操作 | 文件路径 | 说明 |
|---|---|---|
| **新建** | `src/lib/study-prefs.ts` | 学习偏好读写（上次上下文、评分模式等） |
| **新建** | `src/lib/recall-match.ts` | 主动回忆释义模糊比对 |
| 修改 | `src/lib/migrations.ts` | 追加 004 迁移条目 |
| 修改 | `src/lib/db.ts` | 新增 `getDueCountByDeck` 方法 |
| 修改 | `src/pages/Dashboard.tsx` | 智能推荐 + 一键续学 |
| 修改 | `src/pages/Study.tsx` | 三档评分 + 主动回忆 + 迷你小结 |
| 修改 | `src/pages/Settings.tsx` | 学习偏好设置区 |
| 修改 | `src/stores/useStudyStore.ts` | 保存上下文 + 追踪弱词统计 |

### Phase 6B 文件清单（9 个步骤）

| 操作 | 文件路径 | 说明 |
|---|---|---|
| **新建** | `src/lib/ai-strategy.ts` | AI 策略引擎（FSRS → 出题策略） |
| **新建** | `src/components/ai/AIChatPanel.tsx` | AI 多轮对话面板 |
| **新建** | `src/components/ai/AISetupWizard.tsx` | AI 配置引导向导 |
| **新建** | `src/pages/WeakWords.tsx` | 弱词本页面 |
| 修改 | `src/lib/ai-prompts.ts` | 新增策略 prompt + JSON 格式 |
| 修改 | `src/lib/ai-adapter.ts` | JSON 解析路径 + fallback |
| 修改 | `src/lib/ai-parse.ts` | 新增 `parseAIJSON` 安全解析 |
| 修改 | `src/lib/db.ts` | 弱词查询方法 |
| 修改 | `src/pages/Dashboard.tsx` | 弱词提醒 |
| 修改 | `src/pages/Study.tsx` | 集成 AIChatPanel |
| 修改 | `src/App.tsx` | 弱词本路由 |
| 修改 | `src/components/layout/Sidebar.tsx` | 弱词本导航 |

### Phase 6C 文件清单（7 个步骤）

| 操作 | 文件路径 | 说明 |
|---|---|---|
| **新建** | `src/lib/study-mode.ts` | 学习模式引擎（统一学习流核心） |
| **新建** | `src/components/study/StudyCard.tsx` | 多模式学习卡片（分发组件） |
| **新建** | `src/components/study/MarkdownContext.tsx` | 语境沉浸展示 |
| **新建** | `src/components/deck/MasteryOverview.tsx` | 掌握度全景视图 |
| 修改 | `src/lib/db.ts` | 掌握度分布查询 + TOP 弱词查询 |
| 修改 | `src/pages/Study.tsx` | 集成多模式引擎 + 移除测试入口 |
| 修改 | `src/pages/DeckDetail.tsx` | 集成掌握度全景 |
| 修改 | `src/App.tsx` | 路由整理 |
| 修改 | `src/components/layout/Sidebar.tsx` | 导航项调整 |

---

## 六、关键设计原则

```diff
- AI 是一个弹窗里的出题工具
+ AI 是学习流程中的隐形伙伴，自然地穿插在每一步

- 学习 = 翻卡片 + 自评
+ 学习 = 主动回忆 + 系统验证 + AI 追问

- 用户要先配置 API 才能体验 AI
+ 首次使用就引导配置，30 秒完成

- 四档评分，用户纠结
+ 三档评分，直觉操作

- 弱词淹没在词库中，无人关注
+ 弱词自动浮出，AI 专项攻克

- 学习和测试是两个入口
+ 一个统一的学习流，自适应切换模式
```
