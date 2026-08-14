# Reciter 项目方案与架构（已确认 · 修订版）

> 状态: 已确认 · 2026-08-14
> 依据: F:\AI\Reciter\IDEA.md（需求）+ F:\AI\Reciter\ANALYSIS.md（调研评析，本版已合并其全部修正要点）
> 详细分步实施方案见 ANALYSIS.md 第四、五章

## 技术栈（最终确认，含修正）

| 层 | 选型 | 理由 / 修正说明 |
|---|---|---|
| 桌面框架 | **Tauri 2** (Rust 壳) | 轻量(~5MB/80MB内存)，Win11 自带 WebView2；`tauri-plugin-sql`/`dialog`/`http` 均稳定可用 |
| 前端 | **React 18 + TypeScript + Vite** | 生态最大，shadcn/ui 支持最好 |
| UI | **Tailwind CSS v4 + shadcn/ui** | ⚠️修正：明确 **v4**（`@tailwindcss/vite` 插件，无需 tailwind.config.js，CSS 入口仅 `@import "tailwindcss"`），避免 v3 技术债务 |
| 状态/路由 | Zustand + React Router | 轻量，够用 |
| 本地数据库 | **SQLite** (tauri-plugin-sql) | 单文件、强查询、易备份；启用 WAL 模式 |
| Markdown 解析 | unified + remark-parse + **remark-gfm** + **unist-util-visit** | ⚠️修正：`==highlight==` 无稳定插件，采用 **AST 解析结构 + 正则后处理** 两阶段策略 |
| SRS 算法 | **ts-fsrs (FSRS-5)** | ⚠️修正：**FSRS-5 才是当前最新稳定版**（19 参数）；FSRS-6 仅社区研究未发布。库版本 v4.x/v5.x。预留 `algorithm_version` 字段便于未来升级 |
| AI 接入 | **OpenAI 兼容接口双通道**：DeepSeek(云端) + Ollama(本地) | settings 页可配置 baseURL/key/model/temperature，代码零分叉 |
| 图表 | **Recharts（柱状/折线）+ 自定义 CSS Grid 热力图** | ⚠️修正：Recharts **不原生支持 heatmap**；热力图自行实现（~100 行，类 GitHub 贡献图），零额外依赖 |
| 备份同步 | JSON 导出 + WebDAV (TgNAS) | 不做实时多端同步（过度工程） |

## 架构

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
│  └─ 图表: Recharts + 自定义 HeatmapGrid             │
└────────────────────────────────────────────────────┘
                    │
                    ▼
          SQLite 单文件 (reciter.db, WAL)
          ├─ decks / cards / card_states / review_logs / settings / daily_stats
          └─ 导出 → JSON → WebDAV (TgNAS) 备份
```

## 数据库 Schema（ANALYSIS.md 优化版）

```sql
-- 词库表
CREATE TABLE decks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT DEFAULT '',
  new_cards_per_day INTEGER DEFAULT 20,      -- 每日新卡配额
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
  tags              TEXT DEFAULT '[]',        -- JSON 数组，标签筛选
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(deck_id, front)                      -- 重导入匹配/去重关键
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
  algorithm_version TEXT DEFAULT 'FSRS-5'        -- 预留升级迁移
);

-- 复习记录表
CREATE TABLE review_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id           INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grade             INTEGER NOT NULL,             -- 1:Again 2:Hard 3:Good 4:Easy
  reviewed_at       TEXT DEFAULT (datetime('now')),
  response_time_ms  INTEGER,                      -- 用户响应耗时
  source            TEXT DEFAULT 'review',         -- 'review' | 'ai_test'
  ai_question       TEXT,                          -- AI 题目内容（如有）
  ai_answer         TEXT                           -- 用户回答内容（如有）
);

-- 设置表（KV 存储）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 学习统计日报表（加速统计查询，避免全表扫 review_logs）
CREATE TABLE daily_stats (
  date              TEXT PRIMARY KEY,              -- 'YYYY-MM-DD'
  new_count         INTEGER DEFAULT 0,
  review_count      INTEGER DEFAULT 0,
  again_count       INTEGER DEFAULT 0,
  total_time_ms     INTEGER DEFAULT 0,
  retention_rate    REAL DEFAULT 0                 -- 当日正确率
);
```

关键设计：
- **card_states 独立表** → Markdown 重导入只重建 cards，按 `(deck_id, front)` UNIQUE upsert 保留复习进度
- **daily_stats 日报表** → 统计页 O(1) 查询，不扫全量 review_logs
- **algorithm_version** → FSRS 未来升级无需改表结构

## Markdown 导入规则

- `## 标题` → 新建/匹配 Deck
- `- word: meaning` / `- word — meaning` / `- word：meaning` → 卡片正反面
- 引用块 `> example` → 例句追加到上一卡片 back
- `==word==` 高亮 → **正则后处理**提取为挖空题素材（remark 无稳定 mark 插件，两阶段：AST 解析结构 + 正则扫描）
- 依赖：`unified, remark-parse, remark-gfm, unist-util-visit`
- 导入预览：解析结果展示、可勾选跳过、front 冲突检测、结果摘要（新建 X / 更新 Y / 跳过 Z）

## AI 测试流程

```
选择卡组 → 今天 due 的卡片 → 正常复习（Again/Hard/Good/Easy）
         └→ 可选"AI 深度复习"：完形/语境题（流式输出）→ 用户作答 → AI 判分
             → 判分按 4 级反馈回填 ts-fsrs → 更新 card_states
             → 记 review_logs (source='ai_test', 附 ai_question/ai_answer)
```

- Prompt 模板存 settings，用户可编辑、可恢复默认（完形/语境/判分三套模板）
- 流式输出 (SSE) 避免等待感
- 判分误判 → **用户申诉机制**（手动改评分）
- 时区陷阱：ts-fsrs 用原生 Date，不处理"今日截止"概念 → 应用层实现 `getDayStart(hour)`（默认 04:00，可配置）

## 差异化功能（竞品分析补充）

| 功能 | 说明 |
|---|---|
| 目标记忆率调节 | ts-fsrs `request_retention` 原生支持（0.8~0.95 滑块，默认 0.9） |
| Easy Days 负载均衡 | 避免周末/特定日期复习堆积（Anki 2025 新功能，本作应实现） |
| Markdown 导入 | ⭐ 核心差异点，Anki 无原生支持 |
| AI 语境测试 | ⭐ 核心差异点，主流竞品均未实现 |
| 记忆可检索度可视化 | ts-fsrs `get_retrievability()` 实时展示（0~1） |

## 分阶段实施

| Phase | 内容 | 验收标准 |
|---|---|---|
| 1 | Tauri 2 + Vite + React + TS + **Tailwind v4** + shadcn 脚手架，路由骨架（Dashboard/词库/学习/导入/统计/设置 6 页） | `npm run tauri dev` 可运行，暗色主题可切换 |
| 2 | SQLite 接入 + 迁移，Deck/Card CRUD + upsert，Markdown 导入解析 + 预览 | 拖入 .md 生成卡片入库，重启不丢 |
| 3 | 集成 **ts-fsrs (FSRS-5)**，学习流程（due 队列 + 新卡配额 + 四按钮 + Learning 步骤重复） | 评分后 due 正确推移，进度持久化 |
| 4 | AI 设置页 + OpenAI 兼容客户端 + 完形/语境测试 + 判分/申诉 | DeepSeek 与 Ollama 均可切换使用 |
| 5 | 统计图表（柱状/折线 + **自定义热力图**）、JSON 导出 + WebDAV 备份、翻转动画、主题打磨 | 数据可完整导出并恢复 |

> 每阶段详细命令、代码骨架与验收清单见 ANALYSIS.md 第四章。

## 风险清单与对策（ANALYSIS.md 优化版）

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| Rust 工具链装机 ~1.5GB | 确定 | 低 | 一次性成本，文档明确说明 |
| ts-fsrs 未来升级到 FSRS-6 | 中 | 中 | `algorithm_version` 字段预留 + 封装层隔离 |
| AI 判分误判 | 高 | 中 | 用户申诉机制 + 评分可手动修改 |
| Markdown 重导入进度丢失 | 中 | 高 | 按 `(deck_id, front)` UNIQUE 匹配，upsert 策略 |
| Tailwind v4 与 shadcn/ui 兼容问题 | 低 | 中 | 使用 shadcn 官方推荐的 v4 集成方式 |
| SQLite 并发写入冲突 | 低 | 低 | 单用户桌面端无并发；使用 WAL 模式 |
| AI API 网络超时 | 中 | 低 | 合理 timeout + 重试 + 降级提示 |
| `==highlight==` 解析不稳定 | 低 | 低 | 改用正则后处理，不依赖第三方插件 |
