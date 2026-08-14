# Reciter 项目方案调研、评析与优化实施方案

> 基于 [IDEA.md](file:///F:/AI/Reciter/IDEA.md) 与 [PLAN.md](file:///F:/AI/Reciter/PLAN.md) 的深度分析  
> 调研日期: 2026-08-14

---

## 一、现有方案总览

[PLAN.md](file:///F:/AI/Reciter/PLAN.md) 已确定的技术栈：

| 层 | 选型 | 状态 |
|---|---|---|
| 桌面框架 | Tauri 2 (Rust 壳) | ✅ 合理 |
| 前端 | React 18 + TypeScript + Vite | ✅ 合理 |
| UI | Tailwind CSS + shadcn/ui | ⚠️ 需确认版本 |
| 状态/路由 | Zustand + React Router | ✅ 合理 |
| 本地数据库 | SQLite (tauri-plugin-sql) | ✅ 合理 |
| Markdown 解析 | unified + remark (AST) | ⚠️ 需补充插件 |
| SRS 算法 | ts-fsrs (FSRS-6) | ❌ 版本标注有误 |
| AI 接入 | OpenAI 兼容接口双通道 | ✅ 合理 |
| 图表 | Recharts | ⚠️ 热力图不支持 |
| 备份同步 | JSON 导出 + WebDAV | ✅ 合理 |

---

## 二、调研发现与问题评析

### 2.1 ❌ FSRS 算法版本标注错误

**问题**：PLAN.md 标注为 "FSRS-6"，但经调研确认：

- **FSRS-5** 才是当前最新稳定版算法（19 个参数）
- FSRS-6 仅为社区探索性研究，尚未正式发布
- `ts-fsrs` npm 包当前主要版本为 v4.x / v5.x，实现的是 FSRS-5 算法

**修正**：将所有 "FSRS-6" 标注改为 **FSRS-5**，并在 `card_states` 表中预留 `algorithm_version` 字段以便未来升级。

### 2.2 ⚠️ Tailwind CSS 版本跃迁

**发现**：shadcn/ui 当前推荐搭配 **Tailwind CSS v4**，与 v3 存在重大差异：

- v4 不再需要 `tailwind.config.js` 配置文件
- 使用 `@tailwindcss/vite` 插件替代 PostCSS 集成
- CSS 入口文件仅需 `@import "tailwindcss";`

**影响**：PLAN.md 未指定 Tailwind 版本。建议直接采用 **Tailwind CSS v4**，避免技术债务。

### 2.3 ⚠️ Recharts 热力图缺失

**发现**：Recharts v3.x **不原生支持热力图组件**（heatmap）。

PLAN.md 提到"复习曲线/热力图"作为统计功能，但 Recharts 无法直接实现。

**方案选择**：

| 方案 | 优点 | 缺点 |
|---|---|---|
| A. 自行实现 CSS Grid 热力图 | 零依赖、完全可控 | 需自行处理颜色映射 |
| B. 用 Recharts ScatterChart 模拟 | 统一技术栈 | 效果不理想 |
| C. 引入 `cal-heatmap` 专用库 | 开箱即用、GitHub 贡献图风格 | 多一个依赖 |

> [!TIP]
> **推荐方案 A**：热力图本质是一个简单的 CSS Grid + 颜色映射，自行实现代码量约 100 行，可完全匹配设计需求，无需额外依赖。

### 2.4 ⚠️ Markdown 解析需补充插件

**发现**：PLAN.md 提到的 `==word==` 高亮语法，标准 `remark-parse` 不支持。需要额外处理：

- `remark-parse` + `remark-gfm`：支持列表、标题、引用块、任务列表等
- `==highlight==` 语法：需使用 `remark-mark-highlight` 插件或自定义 micromark 扩展
- `unist-util-visit`：用于遍历 AST 节点，提取 `listItem`、`heading`、`blockquote`

**补充依赖**：
```
unified, remark-parse, remark-gfm, unist-util-visit
+ remark-mark-highlight (或自定义 micromark 扩展处理 ==mark==)
```

### 2.5 ✅ Tauri 2 生态确认可用

调研确认：
- `tauri-plugin-sql`（SQLite）：稳定可用，支持迁移管理
- `tauri-plugin-dialog`：文件选择对话框
- `tauri-plugin-http`：AI API 请求 / WebDAV
- 创建命令：`npm create tauri-app@latest`
- 前置条件：Rust 工具链 + Node.js 18+ + Windows WebView2（Win11 自带）

### 2.6 补充发现：竞品差异化机会

通过对 Anki 等竞品分析，发现以下差异化功能值得加入：

| 功能 | Anki 现状 | Reciter 优化机会 |
|---|---|---|
| **目标记忆率调节** | 有（0.85-0.95） | ✅ ts-fsrs 的 `request_retention` 原生支持 |
| **Easy Days 负载均衡** | 2025 新增 | ⭐ 应实现：避免周末/特定日期复习堆积 |
| **Markdown 导入** | 无原生支持 | ⭐ **核心差异点**，Anki 导入极其繁琐 |
| **AI 语境测试** | 无 | ⭐ **核心差异点**，主流竞品均未实现 |
| **记忆可检索度可视化** | 无 | ⭐ ts-fsrs 的 `get_retrievability()` 可实时展示 |

---

## 三、优化后的数据库 Schema

```sql
-- 词库表
CREATE TABLE decks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT DEFAULT '',
  new_cards_per_day INTEGER DEFAULT 20,      -- 新增：每日新卡配额
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 卡片表
CREATE TABLE cards (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id           INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front             TEXT NOT NULL,            -- 单词/短语
  back              TEXT NOT NULL,            -- 释义
  markdown_content  TEXT DEFAULT '',          -- 原始 Markdown 片段
  source_type       TEXT DEFAULT 'manual',    -- 'markdown' | 'csv' | 'manual'
  tags              TEXT DEFAULT '[]',        -- 新增：JSON 数组，支持标签筛选
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(deck_id, front)                      -- 防止同一词库重复卡片
);

-- FSRS 记忆状态表（与 cards 1:1）
CREATE TABLE card_states (
  card_id           INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  state             INTEGER NOT NULL DEFAULT 0,   -- 0:New 1:Learning 2:Review 3:Relearning
  stability         REAL NOT NULL DEFAULT 0,
  difficulty        REAL NOT NULL DEFAULT 0,
  due               TEXT NOT NULL DEFAULT (datetime('now')),
  last_review       TEXT,
  elapsed_days      REAL DEFAULT 0,
  scheduled_days    REAL DEFAULT 0,
  reps              INTEGER DEFAULT 0,
  lapses            INTEGER DEFAULT 0,
  desired_retention REAL DEFAULT 0.9,            -- 每卡可独立调节
  algorithm_version TEXT DEFAULT 'FSRS-5'        -- 新增：便于未来迁移
);

-- 复习记录表
CREATE TABLE review_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id           INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grade             INTEGER NOT NULL,             -- 1:Again 2:Hard 3:Good 4:Easy
  reviewed_at       TEXT DEFAULT (datetime('now')),
  response_time_ms  INTEGER,                      -- 用户响应耗时
  source            TEXT DEFAULT 'review',         -- 'review' | 'ai_test'
  ai_question       TEXT,                          -- 新增：AI 题目内容（如有）
  ai_answer         TEXT                           -- 新增：用户回答内容（如有）
);

-- 设置表（KV 存储）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 新增：学习统计日报表（加速统计查询）
CREATE TABLE daily_stats (
  date              TEXT PRIMARY KEY,              -- 'YYYY-MM-DD'
  new_count         INTEGER DEFAULT 0,
  review_count      INTEGER DEFAULT 0,
  again_count       INTEGER DEFAULT 0,
  total_time_ms     INTEGER DEFAULT 0,
  retention_rate    REAL DEFAULT 0                 -- 当日正确率
);
```

> [!IMPORTANT]
> **关键优化**：新增 `daily_stats` 日报表，避免每次打开统计页时扫描全量 `review_logs`（性能关键）。新增 `tags` 字段支持标签化管理。新增 `algorithm_version` 为算法升级预留。

---

## 四、五阶段具体实施方案

---

### Phase 1: 项目初始化与脚手架搭建

**目标**：桌面窗口可运行，暗色主题，路由骨架就绪

#### 步骤 1.1：创建 Tauri 2 项目

```bash
# 确保前置条件
rustup update stable
node --version  # >= 18

# 创建项目（选择 React + TypeScript）
npm create tauri-app@latest ./
# 选项：Project name: reciter, Frontend: React, Language: TypeScript, Package Manager: npm
```

#### 步骤 1.2：安装 Tailwind CSS v4 + shadcn/ui

```bash
# Tailwind CSS v4
npm install tailwindcss @tailwindcss/vite

# 配置 vite.config.ts 添加 tailwindcss() 插件
# src/index.css 替换为 @import "tailwindcss";

# Path aliases 配置
npm install -D @types/node
# 更新 vite.config.ts 添加 @/ 别名
# 更新 tsconfig.json 添加 paths

# 初始化 shadcn/ui
npx shadcn@latest init
# 添加基础组件
npx shadcn@latest add button card tabs dialog input textarea
npx shadcn@latest add dropdown-menu tooltip separator scroll-area
```

#### 步骤 1.3：配置路由骨架

```
src/
├── main.tsx                    # React 入口
├── App.tsx                     # 根布局 + React Router
├── index.css                   # Tailwind 入口
├── components/
│   ├── ui/                     # shadcn/ui 组件（自动生成）
│   ├── layout/
│   │   ├── Sidebar.tsx         # 侧边导航栏
│   │   ├── Header.tsx          # 顶部栏（标题 + 主题切换）
│   │   └── MainLayout.tsx      # 整体布局容器
│   └── common/                 # 通用组件
├── pages/
│   ├── Dashboard.tsx           # 主页（今日任务概览）
│   ├── DeckList.tsx            # 词库列表页
│   ├── DeckDetail.tsx          # 词库详情/卡片列表
│   ├── Study.tsx               # 学习/复习界面
│   ├── Import.tsx              # 导入页面
│   ├── Stats.tsx               # 统计图表页
│   └── Settings.tsx            # 设置页（AI 配置等）
├── lib/
│   ├── db.ts                   # 数据库封装
│   ├── fsrs.ts                 # FSRS 算法封装
│   ├── markdown-parser.ts      # Markdown 解析器
│   ├── ai-client.ts            # AI API 客户端
│   └── utils.ts                # 通用工具函数
├── stores/
│   ├── useStudyStore.ts        # 学习状态（Zustand）
│   ├── useDeckStore.ts         # 词库状态
│   └── useSettingsStore.ts     # 设置状态
└── types/
    └── index.ts                # 全局类型定义
```

#### 步骤 1.4：暗色主题配置

```tsx
// src/components/layout/ThemeToggle.tsx
// 使用 shadcn/ui 的 dark mode 方案：
// 1. CSS 变量定义在 index.css 中 (:root 和 .dark)
// 2. 通过 Zustand store 管理 theme 状态
// 3. 在 <html> 标签上切换 class="dark"
// 4. 持久化到 localStorage
```

**验收标准**：
- [x] `npm run tauri dev` 可启动桌面窗口
- [x] 侧边栏导航可在 6 个页面间切换
- [x] 暗色/亮色主题可一键切换
- [x] shadcn/ui 组件正常渲染

---

### Phase 2: 本地数据库与数据导入

**目标**：拖入 .md 文件能生成卡片入库

#### 步骤 2.1：集成 SQLite

```bash
# 添加 Tauri SQL 插件
npm run tauri add sql
```

```rust
// src-tauri/src/lib.rs
// 注册插件 + 添加数据库迁移
use tauri_plugin_sql::{Migration, MigrationKind};

let migrations = vec![
    Migration {
        version: 1,
        description: "create initial tables",
        sql: include_str!("../migrations/001_init.sql"),
        kind: MigrationKind::Up,
    }
];

tauri::Builder::default()
    .plugin(
        tauri_plugin_sql::Builder::default()
            .add_migrations("sqlite:reciter.db", migrations)
            .build(),
    )
    // ...
```

```typescript
// src/lib/db.ts - 前端数据库封装
import Database from '@tauri-apps/plugin-sql';

class ReciterDB {
  private db: Database | null = null;

  async init() {
    this.db = await Database.load('sqlite:reciter.db');
  }

  // Deck CRUD
  async createDeck(name: string, description?: string): Promise<number> { ... }
  async getDecks(): Promise<Deck[]> { ... }
  async updateDeck(id: number, data: Partial<Deck>): Promise<void> { ... }
  async deleteDeck(id: number): Promise<void> { ... }

  // Card CRUD
  async createCard(deckId: number, front: string, back: string, markdown?: string): Promise<number> { ... }
  async getCardsByDeck(deckId: number): Promise<Card[]> { ... }
  async upsertCard(deckId: number, front: string, back: string, markdown?: string): Promise<number> { ... }
  // upsertCard: 按 (deck_id, front) 匹配，存在则更新，不存在则新建
  // 这是 Markdown 重导入保留进度的关键

  // CardState CRUD
  async initCardState(cardId: number): Promise<void> { ... }
  async getCardState(cardId: number): Promise<CardState> { ... }
  async updateCardState(cardId: number, state: Partial<CardState>): Promise<void> { ... }

  // ReviewLog
  async addReviewLog(log: ReviewLogInsert): Promise<void> { ... }

  // DailyStats
  async updateDailyStats(date: string, delta: Partial<DailyStats>): Promise<void> { ... }
}

export const db = new ReciterDB();
```

#### 步骤 2.2：Markdown 导入解析器

```bash
npm install unified remark-parse remark-gfm unist-util-visit
```

```typescript
// src/lib/markdown-parser.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

interface ParsedCard {
  front: string;      // 单词/短语
  back: string;       // 释义
  markdown: string;   // 原始 Markdown 片段
  deckName: string;   // 所属词库名
}

interface ParseResult {
  cards: ParsedCard[];
  warnings: string[];   // 解析警告
  conflicts: string[];  // front 冲突
}

export function parseMarkdown(content: string): ParseResult {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);

  let currentDeck = 'Default';
  const cards: ParsedCard[] = [];
  const warnings: string[] = [];

  visit(tree, (node) => {
    // ## 标题 → 词库名
    if (node.type === 'heading' && node.depth === 2) {
      currentDeck = extractText(node);
    }

    // - word: meaning 或 - word — meaning → 卡片
    if (node.type === 'listItem') {
      const text = extractText(node);
      const match = text.match(/^(.+?)\s*[:：—–]\s*(.+)$/);
      if (match) {
        cards.push({
          front: match[1].trim(),
          back: match[2].trim(),
          markdown: text,
          deckName: currentDeck,
        });
      } else {
        warnings.push(`无法解析列表项: "${text}"`);
      }
    }

    // > blockquote → 追加到上一张卡片的 back
    if (node.type === 'blockquote' && cards.length > 0) {
      const quoteText = extractText(node);
      cards[cards.length - 1].back += `\n例句: ${quoteText}`;
    }
  });

  // ==highlight== 处理：自定义正则扫描
  // remark 不原生支持 ==mark==，在 extractText 中用正则处理
  // /==(.+?)==/g → 提取为挖空题源，存入 card metadata

  return { cards, warnings, conflicts: [] };
}

function extractText(node: any): string {
  // 递归提取所有文本节点内容
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(extractText).join('');
  return '';
}
```

> [!NOTE]
> **`==highlight==` 处理策略**：由于 remark 没有稳定的 mark 高亮插件，采用两阶段处理——先用 remark 解析结构（标题、列表、引用），再用正则 `/==(.+?)==/g` 提取高亮内容作为挖空题素材。这比引入不稳定的第三方插件更可靠。

#### 步骤 2.3：导入预览 UI

```
Import.tsx 页面流程：
1. 拖拽区域（使用 tauri-plugin-dialog 选择 .md/.csv 文件）
2. 调用 parseMarkdown() 解析
3. 展示预览表格：
   - 词库名 | 单词 | 释义 | 状态（新建/已存在/冲突）
   - 每行可勾选跳过
   - 冲突行高亮显示（同一 front 已存在于目标词库）
4. 点击"确认导入"→ 调用 db.upsertCard() 批量写入
5. 显示导入结果摘要（新建 X 张、更新 Y 张、跳过 Z 张）
```

**验收标准**：
- [x] 拖入 `.md` 文件可解析出卡片列表
- [x] 支持 `## 标题` 分词库、`- word: meaning` 格式
- [x] 预览表格可勾选跳过、冲突检测正常
- [x] 导入后数据持久化到 SQLite，重启不丢失

---

### Phase 3: 科学记忆算法集成 (FSRS-5)

**目标**：复习后 due 正确推移，重启不丢

#### 步骤 3.1：集成 ts-fsrs

```bash
npm install ts-fsrs
```

```typescript
// src/lib/fsrs.ts - FSRS 算法封装
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FSRSCard,
  type RecordLog,
} from 'ts-fsrs';

// 创建 FSRS 调度器实例
const params = generatorParameters({
  request_retention: 0.9,    // 默认 90% 目标记忆率
  maximum_interval: 36500,   // 最大间隔 100 年
  enable_fuzz: true,         // 启用随机微调，避免复习堆积
});

const scheduler = fsrs(params);

// ============ 核心 API ============

/** 为新卡片创建初始 FSRS 状态 */
export function createNewCardState(): FSRSCard {
  return createEmptyCard(new Date());
}

/** 获取所有评分选项的调度结果 */
export function scheduleReview(card: FSRSCard, now: Date = new Date()): RecordLog {
  return scheduler.repeat(card, now);
}

/** 获取指定评分的调度结果 */
export function reviewCard(card: FSRSCard, grade: Rating, now: Date = new Date()) {
  return scheduler.next(card, now, grade);
}

/** 获取当前记忆可检索度 (0~1) */
export function getRetrievability(card: FSRSCard, now: Date = new Date()): number {
  return scheduler.get_retrievability(card, now);
}

/** 将 DB 中的 card_states 行转换为 ts-fsrs Card 对象 */
export function dbStateToFSRSCard(dbState: CardStateRow): FSRSCard {
  return {
    due: new Date(dbState.due),
    stability: dbState.stability,
    difficulty: dbState.difficulty,
    elapsed_days: dbState.elapsed_days,
    scheduled_days: dbState.scheduled_days,
    reps: dbState.reps,
    lapses: dbState.lapses,
    state: dbState.state as State,
    last_review: dbState.last_review ? new Date(dbState.last_review) : undefined,
  };
}

/** 将 ts-fsrs Card 对象转换回 DB 写入格式 */
export function fsrsCardToDBState(card: FSRSCard): Partial<CardStateRow> {
  return {
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString() ?? null,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
  };
}

export { Rating, State };
```

> [!WARNING]
> **时区陷阱**：`ts-fsrs` 使用原生 JavaScript `Date` 对象，不处理"今日截止时间"概念（如 Anki 默认凌晨 4:00 为新一天起点）。需要在应用层实现 `getDayStart(hour: number)` 工具函数，在查询 due 卡片时使用这个边界时间。

#### 步骤 3.2：学习流程核心逻辑

```typescript
// src/stores/useStudyStore.ts (Zustand)
interface StudyStore {
  currentDeckId: number | null;
  queue: StudyCard[];          // 今日学习队列
  currentIndex: number;
  isFlipped: boolean;          // 卡片是否已翻转

  // Actions
  loadQueue: (deckId: number) => Promise<void>;
  flipCard: () => void;
  rateCard: (grade: Rating) => Promise<void>;
}

// loadQueue 逻辑：
// 1. 查询 due <= now 的 Review/Relearning 卡片（按 due 升序）
// 2. 查询 state = New 的卡片，取前 N 张（N = deck.new_cards_per_day - 今日已学新卡数）
// 3. 合并为 queue，交叉排列（每 3 张旧卡插 1 张新卡）
// 4. Learning 状态的卡片插入队列前端（需要在当次 session 内复习）

// rateCard 逻辑：
// 1. 调用 reviewCard(fsrsCard, grade) 获取新状态
// 2. 调用 db.updateCardState(cardId, newState) 持久化
// 3. 调用 db.addReviewLog(...) 记录
// 4. 调用 db.updateDailyStats(...) 更新日报
// 5. 如果 grade === Rating.Again，将卡片重新插入队列后方
// 6. currentIndex++，进入下一张
```

#### 步骤 3.3：学习界面 UI

```
Study.tsx 界面设计：

┌─────────────────────────────────┐
│  ← 返回     Deck Name    12/50 │  ← 进度指示
├─────────────────────────────────┤
│                                 │
│         apple                   │  ← 正面（单词）
│                                 │
│   ─────────────────────────     │  ← 分隔线
│                                 │
│    🍎 苹果；苹果公司             │  ← 反面（翻转后显示）
│    例句: An apple a day...      │
│                                 │
├─────────────────────────────────┤
│  翻转后显示四个按钮：              │
│  [忘了 1] [困难 2] [良好 3] [简单 4] │
│   <1min    <10min   3d      7d  │  ← 各按钮下方显示预计间隔
└─────────────────────────────────┘
```

**验收标准**：
- [x] Dashboard 显示今日待复习数量 + 新卡数量
- [x] 学习界面卡片可翻转，四个反馈按钮正常
- [x] 评分后 due 日期正确推移（可在数据库中验证）
- [x] 重启应用后学习进度保留
- [x] Learning 状态的卡片在同一 session 内按步骤间隔重复

---

### Phase 4: 智能化复习与 AI 集成

**目标**：DeepSeek 与 Ollama 均可切换使用

#### 步骤 4.1：AI 客户端封装

```typescript
// src/lib/ai-client.ts
// 使用 OpenAI 兼容接口，统一处理 DeepSeek / Ollama / OpenAI / Gemini

import { fetch } from '@tauri-apps/plugin-http';

interface AIConfig {
  baseURL: string;     // e.g. "https://api.deepseek.com/v1" 或 "http://localhost:11434/v1"
  apiKey: string;      // Ollama 可留空
  model: string;       // e.g. "deepseek-chat" 或 "qwen2.5:7b"
  temperature: number; // 默认 0.7
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIClient {
  constructor(private config: AIConfig) {}

  /** 流式输出（SSE），回调每个 token */
  async streamChat(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void
  ): Promise<void> {
    const response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && {
          'Authorization': `Bearer ${this.config.apiKey}`
        }),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        temperature: this.config.temperature,
      }),
    });

    // 解析 SSE 流，逐 token 回调 onToken
    // 完成后调用 onDone
  }

  /** 非流式调用（用于 AI 判分等短回复场景） */
  async chat(messages: ChatMessage[]): Promise<string> { ... }
}
```

#### 步骤 4.2：AI 测试 Prompt 模板

```typescript
// src/lib/ai-prompts.ts
// Prompt 模板存储在 settings 表中，用户可在设置页编辑

export const DEFAULT_PROMPTS = {
  // 完形填空
  cloze: `你是一位专业的英语教师。请根据给定的英语单词 "{word}"，生成一道适合 {level} 水平学习者的完形填空题。

要求：
1. 编写一个 3-5 句话的英语短段落，其中 "{word}" 出现的位置用 _____ 代替
2. 提供 4 个选项（A/B/C/D），其中一个是正确答案 "{word}"
3. 用中文简要解释为什么正确答案合适

输出格式：
**题目**: [段落]
**选项**: A. xxx  B. xxx  C. xxx  D. xxx
**答案**: [字母]
**解析**: [中文解析]`,

  // 语境造句
  context: `你是一位专业的英语教师。请用英语单词 "{word}"（释义：{meaning}）造一个情景对话。

要求：
1. 对话 2-3 轮，自然地使用该单词
2. 难度适合 {level} 水平
3. 对话后用中文解释该单词在语境中的具体含义

输出格式：
**对话**:
A: ...
B: ...
**解析**: [中文]`,

  // AI 判分
  grading: `请评估用户对以下英语问题的回答质量，并给出 1-4 分的评分：
1分 = 完全错误或不理解
2分 = 部分正确但有明显错误
3分 = 基本正确，小错误
4分 = 完全正确

**题目**: {question}
**正确答案**: {answer}
**用户回答**: {userAnswer}

请给出评分（仅数字 1-4）和简短评语。
格式：
**评分**: [数字]
**评语**: [一句话]`,
};
```

#### 步骤 4.3：AI 深度复习流程

```
1. 用户在学习界面点击 "AI 深度复习" 按钮
2. 系统从当日 due 卡片中选取（或用户指定）
3. 弹出 AI 测试面板：
   a. 显示加载动画 → 流式输出题目
   b. 用户输入/选择答案
   c. 提交 → AI 判分（非流式，快速返回）
   d. 显示评分 + 解析
   e. 用户可"申诉"（手动改评分）
4. 最终评分映射为 Rating (1-4) → 调用 ts-fsrs 更新状态
5. 记录到 review_logs（source = 'ai_test'，附带 ai_question/ai_answer）
```

#### 步骤 4.4：设置页面

```
Settings.tsx:

┌─ AI 模型配置 ──────────────────┐
│ 当前模式: [云端 ▼]             │
│                                │
│ API 地址: [________________]   │
│ API Key:  [________________]   │
│ 模型名:   [________________]   │
│ [🔍 测试连接]  ✅ 连接成功      │
├─ 快速切换 ─────────────────────┤
│ [DeepSeek] [Ollama] [OpenAI]  │  ← 预设模板一键填入
├─ Prompt 模板 ──────────────────┤
│ 完形填空: [编辑...]             │
│ 语境造句: [编辑...]             │
│ AI 判分:  [编辑...]             │
│ [恢复默认模板]                  │
├─ 学习设置 ─────────────────────┤
│ 目标记忆率: [0.9] (滑块 0.8-0.95) │
│ 每日新卡上限: [20]              │
│ 今日起始时间: [04:00]           │
└────────────────────────────────┘
```

**验收标准**：
- [x] 设置页可配置 AI 接口，测试连接成功
- [x] DeepSeek 云端与 Ollama 本地均可正常生成题目
- [x] AI 题目流式输出，无明显等待感
- [x] 判分结果正确回填 ts-fsrs 更新记忆状态
- [x] 用户可申诉改评分

---

### Phase 5: 界面打磨与数据统计

**目标**：数据可完整导出并恢复

#### 步骤 5.1：统计图表

```typescript
// 统计页需要三个核心图表：

// 1. 复习量趋势（Recharts BarChart）
//    X: 最近 30 天日期
//    Y: 每日复习量（堆叠柱状图：新学 | 复习 | 重学）
//    数据源: daily_stats 表

// 2. 记忆保留率曲线（Recharts LineChart）
//    X: 最近 30 天日期
//    Y: 每日正确率 (1 - again_count / review_count)
//    数据源: daily_stats 表

// 3. 未来 7 天预期复习量（Recharts BarChart）
//    X: 未来 7 天日期
//    Y: 预期 due 卡片数量
//    数据源: SELECT COUNT(*) FROM card_states
//            WHERE date(due) = ? GROUP BY date(due)

// 4. 学习热力图（自定义 CSS Grid 组件，类 GitHub 贡献图）
//    365 天格子，颜色深浅 = 当日复习量分级
//    数据源: daily_stats 表
```

```tsx
// src/components/stats/HeatmapGrid.tsx - 自定义热力图实现
interface HeatmapGridProps {
  data: Record<string, number>;  // { '2026-08-14': 42, ... }
  year: number;
}

export function HeatmapGrid({ data, year }: HeatmapGridProps) {
  // 1. 生成全年 365 天的日期数组
  // 2. 每个格子宽 12px，gap 2px，按周分列
  // 3. 颜色分 5 级：
  //    0 → 灰色(--muted)
  //    1-10 → 浅绿
  //    11-30 → 中绿
  //    31-60 → 深绿
  //    60+ → 最深绿
  // 4. Hover 显示 tooltip：日期 + 复习数量
  return (
    <div className="grid grid-flow-col gap-[2px]"
         style={{ gridTemplateRows: 'repeat(7, 12px)' }}>
      {days.map(day => (
        <div
          key={day}
          className="w-3 h-3 rounded-[2px] transition-colors"
          style={{ backgroundColor: getColor(data[day] ?? 0) }}
          title={`${day}: ${data[day] ?? 0} reviews`}
        />
      ))}
    </div>
  );
}
```

#### 步骤 5.2：数据导出与备份

```typescript
// src/lib/backup.ts

interface BackupData {
  version: 1;
  exportedAt: string;
  decks: Deck[];
  cards: (Card & { state: CardState })[];
  reviewLogs: ReviewLog[];
  settings: Record<string, string>;
}

/** 导出全量数据为 JSON */
export async function exportToJSON(): Promise<BackupData> {
  // 1. 查询所有 decks
  // 2. 查询所有 cards + JOIN card_states
  // 3. 查询所有 review_logs
  // 4. 查询所有 settings
  // 5. 组装为 BackupData 对象
  // 6. 用 tauri-plugin-dialog 选择保存路径
  // 7. 写入 JSON 文件
}

/** 从 JSON 恢复数据 */
export async function importFromJSON(data: BackupData): Promise<void> {
  // 1. 验证 version 兼容性
  // 2. 事务内批量写入（清空现有数据或合并策略由用户选择）
  // 3. 重建 daily_stats
}

/** WebDAV 备份（可选） */
export async function backupToWebDAV(
  url: string, username: string, password: string
): Promise<void> {
  // 1. 导出 JSON
  // 2. 通过 tauri-plugin-http PUT 到 WebDAV 服务器
  // 文件名: reciter-backup-YYYYMMDD-HHmmss.json
}
```

#### 步骤 5.3：动画与交互打磨

```css
/* 卡片翻转动画 */
.card-container {
  perspective: 1000px;
}

.card-inner {
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.card-inner.flipped {
  transform: rotateY(180deg);
}

.card-front, .card-back {
  backface-visibility: hidden;
  position: absolute;
  inset: 0;
}

.card-back {
  transform: rotateY(180deg);
}

/* 评分按钮按下反馈 */
.rating-button {
  transition: all 0.15s ease;
}
.rating-button:active {
  transform: scale(0.95);
}

/* 进度条流畅动画 */
.progress-bar {
  transition: width 0.3s ease-out;
}
```

**验收标准**：
- [x] 统计页显示复习量柱状图、保留率折线图、热力图
- [x] JSON 导出文件包含完整数据，可再导入恢复
- [x] WebDAV 备份功能正常（需提供 WebDAV 服务器）
- [x] 卡片翻转动画流畅
- [x] 暗色/亮色主题切换平滑

---

## 五、风险清单与对策（优化版）

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| Rust 工具链装机 ~1.5GB | 确定 | 低 | 一次性成本，文档明确说明 |
| ts-fsrs 未来升级到 FSRS-6 | 中 | 中 | `algorithm_version` 字段预留 + 封装层隔离 |
| AI 判分误判 | 高 | 中 | 用户申诉机制 + 评分可手动修改 |
| Markdown 导入重导入进度丢失 | 中 | 高 | 按 `(deck_id, front)` UNIQUE 匹配，upsert 策略 |
| Tailwind v4 与 shadcn/ui 兼容问题 | 低 | 中 | 使用 shadcn 官方推荐的 v4 集成方式 |
| SQLite 并发写入冲突 | 低 | 低 | 单用户桌面端，无并发场景；使用 WAL 模式 |
| AI API 网络超时 | 中 | 低 | 设置合理 timeout + 重试 + 降级提示 |
| `==highlight==` 解析不稳定 | 低 | 低 | 改用正则后处理，不依赖第三方插件 |

---

## 六、总结：方案修正要点

```diff
- SRS 算法: ts-fsrs (FSRS-6)
+ SRS 算法: ts-fsrs (FSRS-5)，FSRS-6 尚未正式发布

- Tailwind CSS（未指定版本）
+ Tailwind CSS v4 + @tailwindcss/vite 插件

- 热力图: Recharts
+ 热力图: 自定义 CSS Grid 组件（Recharts 不原生支持 heatmap）
+ 其余图表保留 Recharts

- Markdown ==highlight==: unified + remark
+ Markdown ==highlight==: remark AST 解析 + 正则后处理（无稳定插件）

+ 新增 daily_stats 日报表（统计查询性能优化）
+ 新增 tags 字段支持标签化管理
+ 新增 algorithm_version 字段预留升级
+ 新增 记忆可检索度实时展示（ts-fsrs get_retrievability）
+ 新增 Easy Days 负载均衡功能（差异化竞争力）
```

---
---

## 七、安卓移动端移植实施方案

> 调研日期：2026-08-14
>
> 基于 Tauri 2 官方 Android 支持能力，将现有桌面应用移植到 Android 移动端

---

### 7.1 可行性总评

Tauri 2 原生支持 Android 构建目标。Reciter 项目的技术栈天然适合移植：

| 层 | 桌面现状 | Android 可行性 | 适配难度 |
|---|---|---|---|
| **Rust 壳** | Tauri 2 Builder + 3 个 plugin | ✅ 官方支持 `crate-type = ["cdylib"]` 已配置 | 🟢 零改动 |
| **前端 React** | React 18 + Vite 7 + Tailwind v4 | ✅ WebView 渲染，完全复用 | 🟢 零改动 |
| **SQLite** | `tauri-plugin-sql` (WAL) | ✅ 插件原生支持 Android | 🟢 零改动 |
| **HTTP** | `tauri-plugin-http` | ✅ 插件原生支持 Android | 🟢 零改动 |
| **文件对话框** | `tauri-plugin-dialog` (open/save) | ⚠️ 移动端 `save()` 不支持，需适配 | 🟡 中等 |
| **自定义命令** | `write_text_file` / `read_text_file` | ⚠️ 路径需改用沙箱目录 | 🟡 中等 |
| **UI 布局** | 固定侧边栏 + 1280×800 桌面窗口 | ❌ 需重构为移动端响应式 | 🔴 较大 |
| **状态管理** | Zustand + React Router | ✅ 完全复用 | 🟢 零改动 |
| **SRS 算法** | ts-fsrs（纯 JS） | ✅ 无平台依赖 | 🟢 零改动 |
| **AI 客户端** | OpenAI 兼容接口 | ✅ 经 tauri-plugin-http（绕过 CORS） | 🟢 零改动 |

**结论**：核心业务逻辑（数据库/SRS/AI/解析）**100% 复用**，工作量集中在**环境搭建、UI 响应式改造、文件系统适配**三个方面。

---

### 7.2 开发环境搭建

#### 7.2.1 前置依赖安装

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Android Studio | 最新稳定版 (Ladybug+) | 提供 SDK Manager / AVD |
| Android SDK | API 24+（推荐 API 34） | Tauri 2 最低支持 API 24 (Android 7.0) |
| Android NDK | r27+（推荐 r27c） | Rust 交叉编译原生库 |
| Java JDK | 17+ | Android Gradle 构建需要 |
| Rust targets | `aarch64-linux-android` 等 | 交叉编译目标 |
| Node.js + npm | 现有版本即可 | 前端构建不变 |

#### 7.2.2 Windows 环境配置步骤

```powershell
# ===== Step 1: 安装 Android Studio =====
# 手动下载安装 https://developer.android.com/studio
# 或 winget：
winget install Google.AndroidStudio

# ===== Step 2: SDK / NDK 配置 =====
# 打开 Android Studio → Settings → SDK Manager
# 勾选安装：
#   - Android SDK Platform 34 (或更高)
#   - Android SDK Build-Tools 34.0.0
#   - NDK (Side by side) 27.2.xxxxx
#   - Android SDK Command-line Tools
#   - CMake 3.22+

# ===== Step 3: 环境变量 =====
# 写入系统环境变量（或用户 profile）
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("NDK_HOME", "$env:LOCALAPPDATA\Android\Sdk\ndk\27.2.12479018", "User")

# 追加 PATH
$env:Path += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin"

# ===== Step 4: Rust Android 交叉编译目标 =====
rustup target add aarch64-linux-android   # ARM 64-bit（主流设备）
rustup target add armv7-linux-androideabi  # ARM 32-bit（旧设备）
rustup target add i686-linux-android       # x86 模拟器
rustup target add x86_64-linux-android     # x86_64 模拟器

# ===== Step 5: Tauri Android 初始化 =====
cd F:\AI\Reciter
npm run tauri android init
```

#### 7.2.3 初始化产物说明

`npm run tauri android init` 将在 `src-tauri/gen/android/` 下生成完整的 Android 工程：

```
src-tauri/gen/android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml    # 应用清单（权限声明）
│   │   ├── java/.../MainActivity.kt
│   │   └── res/                   # 图标 / 启动屏等资源
│   └── build.gradle.kts
├── buildSrc/
├── gradle/
├── build.gradle.kts               # 根构建脚本
└── settings.gradle.kts
```

---

### 7.3 Tauri 配置适配

#### 7.3.1 `tauri.conf.json` 无需改动

现有配置已满足 Android 构建要求：
- `identifier: "com.reciter.app"` → Android 包名（反向域名格式 ✅）
- `build.beforeBuildCommand` / `frontendDist` → 前端构建逻辑复用
- `bundle.icon` → Android 图标由 `tauri icon` 命令另行生成

#### 7.3.2 `Cargo.toml` 已就绪

```toml
[lib]
crate-type = ["staticlib", "cdylib", "rlib"]
#                          ^^^^^^^ Android 需要 cdylib，已配置 ✅
```

#### 7.3.3 `lib.rs` 已就绪

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]  // ← 移动端入口点，已配置 ✅
pub fn run() { ... }
```

#### 7.3.4 capabilities 需新增移动端权限文件

现有 [`default.json`](file:///F:/AI/Reciter/src-tauri/capabilities/default.json) 的 `$schema` 引用桌面 schema，需新增移动端 capability：

```jsonc
// src-tauri/capabilities/mobile.json（新建）
{
  "$schema": "../gen/schemas/mobile-schema.json",
  "identifier": "mobile",
  "description": "Capability for mobile",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    {
      "identifier": "http:default",
      "allow": [
        { "url": "https://*:*" },
        { "url": "http://localhost:*" },
        { "url": "http://127.0.0.1:*" }
      ]
    },
    "sql:default",
    "sql:allow-load",
    "sql:allow-select",
    "sql:allow-execute",
    "sql:allow-close"
  ]
}
```

#### 7.3.5 AndroidManifest.xml 权限补充

`npm run tauri android init` 生成的清单文件需确认包含网络权限（AI 接口 / WebDAV）：

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

### 7.4 代码适配：三个需要改动的模块

#### 7.4.1 文件系统适配 — [`backup.ts`](file:///F:/AI/Reciter/src/lib/backup.ts)

**问题**：桌面端备份使用 `tauri-plugin-dialog` 的 `save()` 选择保存路径 + `invoke("write_text_file")` 写入任意文件路径。Android 沙箱不允许写入任意路径，`save()` 对话框在移动端不可用。

**适配方案**：

```
                    ┌─────────────────────┐
                    │  平台检测分支逻辑    │
                    └──────┬──────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      【桌面端：现有逻辑】        【Android 端】
      save() → 用户选路径         写入应用沙箱 appDataDir
      write_text_file              + 通过 Android Share Intent
                                     分享到其他应用/文件管理器
```

**具体改动**：

```typescript
// src/lib/backup.ts — 新增平台感知逻辑

import { platform } from "@tauri-apps/plugin-os";  // 新增依赖

export async function exportToJSON(): Promise<BackupResult> {
  const data = await buildBackup();
  const json = JSON.stringify(data, null, 2);
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const fileName = "reciter-backup-" + stamp + ".json";

  if (platform() === "android") {
    // Android：写入 appDataDir 后触发系统分享
    const dir = await appDataDir();           // tauri-plugin-fs
    const filePath = dir + "/" + fileName;
    await invoke("write_text_file", { path: filePath, content: json });
    // 可选：调用 Android Share Intent 分享文件
    return { ok: true, message: "已保存到应用数据目录", decks: data.decks.length, cards: data.cards.length };
  } else {
    // 桌面端：原有逻辑不变
    const path = await save({ defaultPath: fileName, filters: [...] });
    ...
  }
}
```

**需新增 Cargo 依赖**：
```toml
# src-tauri/Cargo.toml
tauri-plugin-os = "2"     # 平台检测
tauri-plugin-fs = "2"     # 移动端文件操作（appDataDir）
```

#### 7.4.2 文件导入适配 — [`Import.tsx`](file:///F:/AI/Reciter/src/pages/Import.tsx)

**现状**：桌面端导入页使用 HTML5 `<input type="file">` + 拖拽 `onDrop`，通过浏览器 File API 读取文件内容（`FileReader`）。

**Android 适配**：
- ✅ HTML5 File API 在 Android WebView 中**可用**
- ✅ `<input type="file">` 会调用系统文件选择器
- ⚠️ 拖拽事件在触屏不可用，但导入按钮仍可触发文件选择
- **改动极小**：仅需确保触控交互可达，无需改底层逻辑

#### 7.4.3 Rust 自定义命令适配 — [`lib.rs`](file:///F:/AI/Reciter/src-tauri/src/lib.rs)

**问题**：`write_text_file` / `read_text_file` 使用 `std::fs::write/read_to_string` 写入用户指定的绝对路径，Android 沙箱限制文件访问。

**适配方案**：

```rust
// 方案 A（推荐）：改用 tauri-plugin-fs，前端直接调用
//   → 删除自定义命令，用插件 API 替代
//   → 插件自动处理沙箱路径作用域

// 方案 B（最小改动）：保持自定义命令，但路径由前端传入沙箱相对路径
//   → 前端通过 appDataDir() 获取沙箱根目录
//   → Rust 侧拼接完整路径
```

---

### 7.5 UI 响应式改造（核心工作量）

#### 7.5.1 布局架构变更

桌面端采用固定 `w-56` 侧边栏 + 右侧内容区的经典桌面布局。移动端需改为底部标签栏导航。

```
桌面端布局：                     移动端布局：
┌──────┬──────────────┐         ┌──────────────────┐
│      │              │         │     Header       │
│ Side │    Content   │    →    ├──────────────────┤
│ bar  │              │         │                  │
│      │              │         │    Content       │
│      │              │         │                  │
│      │              │         ├──────────────────┤
└──────┴──────────────┘         │  BottomTabBar    │
                                └──────────────────┘
```

#### 7.5.2 组件改造清单

| 组件 | 改动内容 | 优先级 |
|---|---|---|
| [`MainLayout.tsx`](file:///F:/AI/Reciter/src/components/layout/MainLayout.tsx) | 响应式切换：桌面侧边栏 ↔ 移动底部标签栏 | P0 |
| [`Sidebar.tsx`](file:///F:/AI/Reciter/src/components/layout/Sidebar.tsx) | 桌面保持不变；移动端隐藏，新建 `BottomTabBar` | P0 |
| [`Header.tsx`](file:///F:/AI/Reciter/src/components/layout/Header.tsx) | 移动端显示页面标题 + 汉堡菜单（可选） | P1 |
| [`Study.tsx`](file:///F:/AI/Reciter/src/pages/Study.tsx) | 卡片区域全屏化；四档评分按钮改为底部固定条 | P0 |
| [`Dashboard.tsx`](file:///F:/AI/Reciter/src/pages/Dashboard.tsx) | 网格布局改为单列堆叠 | P1 |
| [`DeckList.tsx`](file:///F:/AI/Reciter/src/pages/DeckList.tsx) | 卡片网格改为列表 | P1 |
| [`DeckDetail.tsx`](file:///F:/AI/Reciter/src/pages/DeckDetail.tsx) | 表格改为卡片列表，按钮组紧凑化 | P1 |
| [`Import.tsx`](file:///F:/AI/Reciter/src/pages/Import.tsx) | 移除拖拽区域交互，保留按钮触发 | P1 |
| [`Stats.tsx`](file:///F:/AI/Reciter/src/pages/Stats.tsx) | 图表宽度 100%；热力图横向可滚动 | P2 |
| [`Settings.tsx`](file:///F:/AI/Reciter/src/pages/Settings.tsx) | 表单布局改为全宽单列 | P2 |

#### 7.5.3 响应式策略 — Tailwind 断点

```css
/* 利用 Tailwind v4 的断点系统 */
/* sm: 640px  md: 768px  lg: 1024px */

/* 核心策略：
   - < md (768px)  → 移动端布局（底部导航、单列、全宽）
   - >= md         → 桌面布局（侧边栏、多列、固定宽）
*/
```

**MainLayout 改造示意**：

```tsx
// src/components/layout/MainLayout.tsx — 响应式改造
export default function MainLayout() {
  return (
    <div className="flex h-screen w-full flex-col md:flex-row overflow-hidden">
      {/* 桌面侧边栏：仅 md 以上显示 */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* 移动底部导航：仅 md 以下显示 */}
      <div className="md:hidden">
        <BottomTabBar />
      </div>
    </div>
  );
}
```

**BottomTabBar 新组件**：

```tsx
// src/components/layout/BottomTabBar.tsx（新建）
const TAB_ITEMS = [
  { to: "/",        label: "首页", icon: LayoutDashboard },
  { to: "/decks",   label: "词库", icon: BookOpen },
  { to: "/study",   label: "学习", icon: GraduationCap },
  { to: "/import",  label: "导入", icon: FileUp },
  { to: "/settings",label: "设置", icon: Settings },
];

export default function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 flex h-16 items-center
                    justify-around border-t bg-background/95 backdrop-blur
                    safe-bottom">
      {TAB_ITEMS.map(item => (
        <NavLink key={item.to} to={item.to} end={item.to === "/"} ...>
          <item.icon className="size-5" />
          <span className="text-[10px]">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
```

#### 7.5.4 触控交互适配

| 桌面交互 | 移动端替代 |
|---|---|
| hover 悬停提示（Tooltip） | 长按或直接显示文案 |
| 右键菜单 | 长按菜单 |
| 拖拽导入文件 | 点击按钮触发系统文件选择器 |
| 双击编辑 | 点击进入编辑模式 |
| 精密鼠标滚轮 | 惯性滚动 + 过渡弹性 |
| 小号按钮（24px） | 最小触控目标 44×44px |

**CSS 全局补丁**：

```css
/* src/index.css — 追加移动端适配 */

/* 安全区域（刘海屏/底部手势条） */
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-top    { padding-top: env(safe-area-inset-top); }

/* 移动端最小触控目标 */
@media (max-width: 767px) {
  button, a, [role="button"] {
    min-height: 44px;
    min-width: 44px;
  }
}

/* 禁止 WebView 长按选中文本（学习页面） */
.no-select {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
```

---

### 7.6 构建、调试与发布

#### 7.6.1 开发调试

```powershell
# 启动 Android 模拟器（或连接物理设备，开启 USB 调试）
# 确认设备已连接：
adb devices

# 开发模式运行（热更新）
npm run tauri android dev

# 指定设备运行（多设备时）
npm run tauri android dev -- --device <device-id>
```

**调试方法**：
- Chrome DevTools 远程调试：`chrome://inspect` → 选择 WebView
- Android Studio Logcat：过滤 `Tauri` / `RustLog` 查看 Rust 日志
- React DevTools：通过 Flipper 或远程连接

#### 7.6.2 生产构建

```powershell
# 构建 APK / AAB
npm run tauri android build

# 产物位置：
#   src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
#   src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab
```

#### 7.6.3 应用签名

```powershell
# 生成签名密钥（首次）
keytool -genkey -v -keystore reciter-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias reciter

# 配置签名：编辑 src-tauri/gen/android/app/build.gradle.kts
# 或使用 Tauri 的 signing 配置
```

#### 7.6.4 应用图标生成

```powershell
# 准备一张 1024x1024 PNG 图标，然后：
npx tauri icon path/to/icon.png
# 自动生成 Android 所有尺寸的 mipmap 资源
```

---

### 7.7 分阶段实施计划

```
Phase A: 环境搭建 + 最小可运行 (1~2 天)
├─ A.1 安装 Android Studio + SDK/NDK + Rust targets
├─ A.2 npm run tauri android init
├─ A.3 新建 mobile.json capability
├─ A.4 AndroidManifest.xml 加网络权限
├─ A.5 npm run tauri android dev → 在模拟器验证启动
└─ 验收：应用在模拟器启动，桌面布局虽不理想但功能可用

Phase B: 响应式 UI 改造 (3~5 天)
├─ B.1 MainLayout 响应式分支（侧边栏 / 底部标签栏）
├─ B.2 新建 BottomTabBar 组件
├─ B.3 Study 页面移动端全屏卡片布局
├─ B.4 Dashboard / DeckList / DeckDetail 单列适配
├─ B.5 Import 页面：移除拖拽，优化按钮触控
├─ B.6 Stats 页面：图表全宽 + 热力图横向滚动
├─ B.7 Settings 页面：表单全宽
├─ B.8 全局触控适配（44px 最小目标、安全区域）
└─ 验收：所有 7 个页面在移动端布局正常、交互流畅

Phase C: 文件系统 + 备份适配 (1~2 天)
├─ C.1 新增 tauri-plugin-os + tauri-plugin-fs 依赖
├─ C.2 backup.ts 平台分支（Android 沙箱写入 + 分享）
├─ C.3 lib.rs 自定义命令沙箱路径适配
├─ C.4 导入/导出功能在 Android 端验证
└─ 验收：Android 上可正常导入 Markdown、导出/恢复 JSON 备份

Phase D: 测试 + 打包发布 (1~2 天)
├─ D.1 真机测试（ARM64 设备）
├─ D.2 AI 功能验证（DeepSeek / Ollama 连接）
├─ D.3 性能验证（大词库 1000+ 卡片流畅度）
├─ D.4 签名 + 构建 Release APK
├─ D.5 更新 README.md 移动端使用说明
└─ 验收：Release APK 可安装、全功能可用
```

**总工期估计：6~11 天**（一人开发，熟悉 Android 基础设施前提下）

---

### 7.8 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| Android Studio + SDK/NDK 安装体积大 (~15GB) | 确定 | 低 | 一次性成本，文档明确磁盘需求 |
| Rust 交叉编译首次较慢 (10~20 min) | 确定 | 低 | 增量编译后秒级；CI 可缓存 |
| WebView 性能不如原生 | 低 | 中 | Reciter 无复杂动画需求，WebView 足够 |
| Android 11+ Scoped Storage 限制 | 中 | 中 | 使用 Tauri 插件 API，自动适配沙箱 |
| 移动端 AI API 网络不稳定 | 中 | 低 | 已有 timeout + 错误提示机制 |
| 不同 Android 版本 WebView 内核差异 | 低 | 中 | Tauri 使用系统 WebView，最低 API 24 覆盖 95%+ 设备 |
| 触控误操作（学习评分按钮） | 中 | 中 | 加大按钮尺寸 + 间距 + 确认机制 |

---

### 7.9 Tauri API 依赖全景图

以下为代码中使用的所有 Tauri API 及其 Android 兼容性：

| 使用位置 | Tauri API | Android 支持 | 备注 |
|---|---|---|---|
| [`db.ts`](file:///F:/AI/Reciter/src/lib/db.ts) | `@tauri-apps/plugin-sql` (Database.load) | ✅ | SQLite 跨平台无差异 |
| [`ai-client.ts`](file:///F:/AI/Reciter/src/lib/ai-client.ts) | `@tauri-apps/plugin-http` (fetch) | ✅ | HTTP 跨平台无差异 |
| [`backup.ts`](file:///F:/AI/Reciter/src/lib/backup.ts) | `@tauri-apps/plugin-dialog` (open, save) | ⚠️ | `open()` 可用，`save()` 需适配 |
| [`backup.ts`](file:///F:/AI/Reciter/src/lib/backup.ts) | `@tauri-apps/api/core` (invoke) | ✅ | 跨平台 IPC 无差异 |
| [`lib.rs`](file:///F:/AI/Reciter/src-tauri/src/lib.rs) | `std::fs::write/read_to_string` | ⚠️ | 路径需限制在沙箱内 |

---

### 7.10 与桌面端共存策略

移植后项目结构变为双目标共存，无需分仓：

```
F:\AI\Reciter
├── src/                          # React 前端（共用）
│   ├── components/layout/
│   │   ├── Sidebar.tsx           # 桌面端侧边栏
│   │   ├── BottomTabBar.tsx      # 移动端底部导航（新增）
│   │   └── MainLayout.tsx        # 响应式分支
│   └── ...
├── src-tauri/
│   ├── capabilities/
│   │   ├── default.json          # 桌面端权限
│   │   └── mobile.json           # 移动端权限（新增）
│   ├── gen/android/              # Android 工程（自动生成）
│   └── ...
└── ...

# 构建命令
npm run tauri dev              # 桌面开发
npm run tauri build            # 桌面打包
npm run tauri android dev      # Android 开发
npm run tauri android build    # Android 打包
```

**一套代码、两个平台**——Tauri 2 的核心优势。
