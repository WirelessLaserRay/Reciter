# Reciter Phase 7 合并实施计划 v2（用户需求 × 调查报告）

> 更新日期：2026-08-22
> 依据：`research_doc/phase7_investigation_report.md`、`research_doc/study_queue_analysis.md`、用户补充需求
> 目标：在保证现有功能稳定的前提下，分阶段完成导入体验升级、词库组织能力、弱词管理、数据可靠性与同步基础、代码健康度修复、以及竞品级功能补齐。

---

## 需求汇总

1. **文本框导入**：支持在文本框内粘贴内容导入词库，自动识别 Markdown / CSV / JSON / TXT。
2. **JSON 导入冲突处理**：
   - 只导入当前不存在的词库；
   - 重名词库时提示对比 diff；
   - 列出新增的词/短语供勾选；
   - 存在多个重名词库时，可选择加入哪个词库，或将新词库添加为 `*_1`。
3. **弱词本支持删除**：可将单词从弱词本移除，不再出现在弱词列表。
4. **词库文件夹分类**：支持用文件夹组织词库；不同文件夹下允许存在同名词库。
5. **数据迁移与多端同步基础**：先增强手动 JSON 导出/导入，后续接入 WebDAV / GitHub 等自动云同步。
6. **代码健康度**：修复 Phase 7 审计发现的 Critical / High / Medium 问题。
7. **学习队列体验**：继续完善队列动态补充与 Learning 步骤完整性。
8. **竞品功能补齐**：发音音频、Easy Days、AI 智能生成卡片、考试日期规划。

---

## 总体阶段图

```mermaid
flowchart LR
    A["A 文本框导入 + TXT"] --> B["B 词库文件夹分类"]
    B --> C["C JSON 导入冲突处理"]
    C --> D["D 弱词本删除"]
    D --> E["E JSON 备份/恢复事务化"]
    E --> F["F WP1 代码健康度"]
    F --> G["G WP2 队列回归验证"]
    G --> H["H 发音与音频"]
    H --> I["I Easy Days"]
    I --> J["J AI 智能生成卡片"]
    J --> K["K 多端云同步"]
```

---

## Phase A：文本框导入 + TXT 识别

> 优先级：P0（用户明确需求）
> 目标：在导入页支持“手动输入”区域，自动识别 Markdown / CSV / JSON / TXT，并复用现有预览/冲突检测/入库流程。

### A1. 扩展解析器 `src/lib/importer.ts`

- 新增 `parseTXT(content, defaultDeck = "手动导入")`：
  - 每行支持：
    - `word<TAB>meaning`
    - `word, meaning` / `word，meaning`
    - `word - meaning` / `word — meaning`
    - 仅 `word`（back 自动用 front）
  - 支持 `# 词库名` 行，将后续卡片归入指定词库。
  - 支持行内标签（可选）：`word | meaning | tag1,tag2`。
- 新增 `parseTextInput(content, format)`：
  - `format = "auto" | "markdown" | "csv" | "json" | "txt"`
  - auto 自动识别：
    - 以 `[` 或 `{` 开头 → JSON
    - 首行含逗号且后续行含逗号 → CSV
    - 含 Markdown 标题/列表特征 → Markdown
    - 否则 → TXT

### A2. 导入页增加「手动输入」卡片 `src/pages/Import.tsx`

- 新增 UI 区域：
  - 格式下拉：自动识别 / Markdown / CSV / JSON / TXT
  - `Textarea` 粘贴内容
  - “解析预览”按钮
- 点击后调用 `parseTextInput`，将结果交给现有 `handleText()` 流程。
- 预览、勾选、冲突检测、一键入库全部复用现有逻辑。

### A3. 验证

- 分别粘贴 Markdown / CSV / JSON / TXT 样例，确认自动识别正确。
- 确认预览去重、勾选、导入成功。
- `npm run build` 通过。

---

## Phase B：词库文件夹分类（同名词库基础）

> 优先级：P0（JSON 冲突处理的前置依赖）
> 目标：用文件夹组织词库，不同文件夹允许存在同名词库。

### B1. 数据模型变更

- `decks` 表新增 `folder TEXT NOT NULL DEFAULT ''`。
- 唯一约束从全局 `UNIQUE(name)` 改为 `UNIQUE(folder, name)`。
- 需要重建 `decks` 表（SQLite 无法直接修改 UNIQUE 约束）：
  - 创建新表 `decks_new`
  - 拷贝旧数据，`folder = ''`
  - 删除旧表，重命名新表
- 同步迁移：
  - Web/sql.js：`src/lib/migrations.ts`
  - Tauri：`src-tauri/migrations/`

### B2. 类型与 DB 方法更新

- `src/types/index.ts`：`Deck` 增加 `folder: string`。
- `src/lib/db.ts`：
  - `createDeck(name, description, newPerDay, folder = '')`
  - `getDeckIdByName(name, folder = '')`
  - 新增 `getDecksByName(name)`：返回所有同名词库（跨文件夹）
  - `getDecks()` 返回 `folder`
  - `updateDeck` 支持修改 `folder`（移动词库）
  - 删除词库时清理关联设置

### B3. UI：词库列表文件夹化

- `src/pages/DeckList.tsx`：
  - 按文件夹分组展示词库
  - 支持新建文件夹
  - 新建/重命名词库时选择所属文件夹
  - 支持将词库移动到其他文件夹
- `src/pages/Import.tsx`：导入时选择目标文件夹（默认根目录）。

### B4. 验证

- 创建两个同名词库在不同文件夹，确认互不冲突。
- 现有数据迁移后仍能正常打开。
- `npm run build` 通过。

---

## Phase C：JSON 导入冲突处理与选择性导入

> 优先级：P0（依赖 Phase B）
> 目标：JSON 导入时不再无脑合并，而是提供 diff、勾选和重名选择。

### C1. DB 层支持

- 新增 `db.getDecksByName(name)`：返回所有同名词库（含 folder）。
- 新增 `db.getUniqueDeckName(name, folder)`：若 `folder/name` 已存在，生成 `name_1`、`name_2` 等。
- 保留 `getExistingFronts(deckId)` 用于 diff。

### C2. 导入预览增强 `src/pages/Import.tsx`

当 JSON 解析出的词库名与现有词库重名时：

- **不存在该词库**：标记为「新词库」，可正常导入。
- **存在一个同名词库**：
  - 显示对比 diff：现有卡片数 vs 导入卡片数
  - 列出「新增的词/短语」（导入中有、目标词库中没有）供勾选
  - 已存在的词默认不勾选
  - 可选操作：合并到现有词库 / 新建 `name_1`
- **存在多个同名词库**：
  - 下拉选择要加入哪个词库（显示文件夹路径）
  - 或选择「新建 `name_1`」
  - 同样显示新增词列表供勾选

### C3. 导入执行

- 按用户选择的目标 deckId 执行 `upsertCard`。
- 若选择新建 `name_1`，调用 `createDeck(name_1, description, quota, folder)`。
- 导入仍放入单个事务（与 Phase E 配合）。

### C4. 验证

- 构造重名词库 JSON，确认 diff 列表正确。
- 确认多同名词库时可选目标。
- 确认 `name_1` 生成规则正确。
- `npm run build` 通过。

---

## Phase D：弱词本删除

> 优先级：P0（用户明确需求）
> 目标：支持将单词从弱词本移除，不再出现在弱词列表。

### D1. 数据模型

- `cards` 表新增 `weak_dismissed INTEGER NOT NULL DEFAULT 0`。
- 迁移：
  - Web/sql.js：`src/lib/migrations.ts`
  - Tauri：`src-tauri/migrations/`
- `src/types/index.ts`：`Card` 增加 `weak_dismissed: number`。

### D2. DB 层

- 所有弱词查询排除已删除项：
  - `getWeakCards`
  - `getDeckTopWeakWords`
  - `getGlobalWeakCount`
- 新增 `db.dismissWeakWord(cardId)`：
  - 设置 `weak_dismissed = 1`
  - 若为手动弱词，同时清除 `weak_source = ''`（可选）
- 备份/恢复包含 `weak_dismissed` 字段。

### D3. UI：弱词本删除

- `src/pages/WeakWords.tsx` 每行增加「移出弱词本」按钮。
- 点击后使用统一 ConfirmDialog 确认。
- 删除后刷新列表。
- 词库详情页的弱词 TOP 榜同步不显示已删除项。

### D4. 验证

- 删除手动/自动弱词后均不再出现。
- 卡片本身与复习进度不受影响。
- `npm run build` 通过。

---

## Phase E：JSON 备份/恢复增强（多端同步基础）

> 优先级：P0（数据可靠性与未来同步地基）
> 目标：恢复/导入不再逐条慢速提交，并提供更友好的备份摘要与确认。

### E1. 数据库事务化

- 扩展 `SQLBackend` 接口：
  - 新增 `transaction<T>(fn: () => Promise<T>): Promise<T>`
- `TauriBackend` 与 `SqlJsBackend` 实现：
  - `BEGIN TRANSACTION` → 执行回调 → `COMMIT`
  - 异常时 `ROLLBACK`
- `src/lib/backup.ts`：
  - `importFromJSON()` 中所有 restore 循环整体包进 `db.transaction()`
- `src/pages/Import.tsx`：
  - `confirmImport()` 中 `createDeck` 提到循环外缓存 `deckId`
  - `upsertCard` 批量循环包进事务

### E2. 备份/恢复体验增强

- 备份 JSON 增加元信息：`appVersion`、`deckCount`、`cardCount`、`reviewCount`。
- 导入前展示摘要确认框（复用统一 ConfirmDialog）。
- 保留失败回滚（snapshot 机制）。

### E3. 验证

- 用 1000+ 卡片备份文件测试恢复耗时，对比优化前后。
- 模拟恢复中途失败，确认回滚不残留半状态。
- `npm run build` 通过。

---

## Phase F：WP1 代码健康度修复

> 优先级：P0/P1（Phase 7 审计）
> 目标：消除性能瓶颈与数据风险，为后续功能打基础。

### F1. 干扰项内存优化

- `src/lib/db.ts` 新增 `getRandomDistractors(deckId, excludeCardId, limit = 50)`。
- `src/pages/Study.tsx` 不再全量载入词库作为干扰项。
- `src/components/study/StudyCard.tsx` 的 `pickSimilarWords` 输入限制在 50~100 项。

### F2. 响应时间封顶

- `src/lib/review.ts` 写入前 `Math.min(responseTimeMs, 60_000)`。

### F3. 主动回忆支持非中文释义

- `src/lib/recall-match.ts` 移除 CJK-only 过滤，改为过滤长度 < 2 的碎片和常见语法标签。

### F4. Dashboard N+1 查询改单次

- `src/pages/Dashboard.tsx` 使用 `getDeckDueCounts()` 一次查询全部词库 due 数。

### F5. 去重追踪改用 Set

- `src/stores/useStudyStore.ts`：`reviewedCardIds / againCardIds / hardCardIds` 改为 `Set<number>`。

### F6. 标签查询/过滤改 json_each

- `src/lib/db.ts`：`getDeckTags`、`getDeckTagsWithCount`、`tagWhere/tagParam` 改用 `json_each(c.tags)` 精确匹配。

### F7. DST 安全修复

- `src/lib/day.ts`：`setDate(d - 1)` 改为 `setTime(d.getTime() - 86400000)`。

### F8. 超大数组 concat 替代 push spread

- `src/stores/useStudyStore.ts`：`result.push(...shuffleRows(rest))` 改为 `result.concat(...)`。

### F9. 自动评分定时器清理

- `src/components/study/StudyCard.tsx`：手动评分时 `clearTimeout`，避免双重评分。

### F10. 删除词库清理孤儿设置

- `deleteDeck` 时删除 `deck_shuffle_${id}` 等关联设置。

### F11. 学习步骤输入反馈

- `fsrs.ts` / `Settings.tsx`：非法 `learning_steps` 给出提示。

### F12. DeckDetail 搜索防抖

- `src/pages/DeckDetail.tsx`：使用 `useDeferredValue` 或 debounce。

### 验证

- 每项完成后 `tsc --noEmit` + `npm run build`。
- 涉及行为修改的补回归测试。

---

## Phase G：WP2 队列动态补充（回归验证）

> 状态：核心逻辑已实现，本阶段补验证与边界处理。
> 已完成：
> - `rate()` 剩余 ≤3 张时自动补充新到期卡
> - Dashboard 待复习数改为“此刻已到期 + 配额内”
> - Learning/Relearning 持续重插，移除 `tested` 截断

### G1. 回归测试

- 模拟：加载 10 张队列 → 全部评 Good → 等 1 分钟 → 确认 Learning 步骤到期的卡片被自动补充。
- 确认 `finished` 只在真正无卡时触发。
- 确认同一张卡不会在队列中出现多份。

### G2. 边界处理

- 补充查询失败时不阻塞评分（已有）。
- 补充数量上限可配置化。
- 补充时继续遵守“学习忽略标签”设置。

---

## Phase H：发音与音频系统

> 优先级：P1（竞品差距大）
> 目标：补齐“不背单词”式发音能力。

### H1. TTS 发音引擎

- 新建 `src/lib/tts.ts`：
  - 优先 Web Speech API
  - Tauri 端可调用系统 TTS
  - 支持语速/音量/语音选择
  - 无 TTS 引擎时静默降级
- `StudyCard.tsx`：单词区 🔊 按钮、翻面自动朗读、答对自动朗读。
- `Settings.tsx`：TTS 配置项。

### H2. 音标显示

- 迁移：`ALTER TABLE cards ADD COLUMN phonetic TEXT DEFAULT ''`
- 更新类型、导入解析、卡片编辑。
- `StudyCard` front 下方显示音标，点击发音。

---

## Phase I：Easy Days 负载均衡

> 优先级：P1（对标 Anki 2025）

### I1. 配置 UI

- settings 存储：`easy_days_config = { enabled, weekdays, specificDates }`
- 新建 `src/lib/easy-days.ts`：`getEasyDaysFactor(date)`
- `Settings.tsx`：周系数滑块 + 特定日期选择器

### I2. 调度引擎

- `useStudyStore.loadQueue()` 按当日系数缩减 `reviewLimit`
- Dashboard 显示“轻松日”提示与调整后数量
- 高级：FSRS 排程避开 Easy Days

---

## Phase J：AI 智能生成卡片

> 优先级：P2（对标 Knowt）

### J1. 文本 → 闪卡自动生成

- 新建 `src/lib/ai-generate.ts`
- 复用 `AIClient` 与 `ai-parse`
- 新建 `AIGeneratePanel.tsx`：文本输入 → 生成预览 → 勾选/编辑 → 导入词库
- `Import.tsx` 增加「AI 智能生成」入口

### J2. 考试日期规划

- settings 存储：`exam_date`、`exam_deck_ids`
- 新建 `src/lib/exam-planner.ts`
- Dashboard/设置页显示倒计时、每日建议新卡数、进度
- `loadQueue` 可选应用考试规划配额

---

## Phase K：多端云同步

> 优先级：P2（在 Phase E 基础上实现）
> 目标：从手动 JSON 升级为自动多端同步。

### K1. 同步后端选型

- 优先 WebDAV（坚果云/Nextcloud/群晖）
- 备选 GitHub Gist / 仓库
- 或自建 Supabase

### K2. 同步模块

- 新建 `src/lib/sync.ts`：
  - `push()`：`buildBackup()` → 上传 JSON
  - `pull()`：下载 JSON → 事务恢复/合并
  - 冲突策略：先“最后写入胜出”，后续按 `updated_at` 合并
- settings 存储同步配置
- `Settings.tsx` 新增「同步」卡片

### K3. 平台适配

- Tauri：`@tauri-apps/plugin-http`
- Web/PWA：`fetch`（WebDAV 可能需要 CORS 代理）
- 自动同步时机：启动时、导入/学习完成后、定时

---

## 实施优先级总表

| 阶段 | 内容 | 优先级 | 预计工时 | 依赖 |
|---|---|---|---|---|
| A | 文本框导入 + TXT | P0 | 1 天 | 无 |
| B | 词库文件夹分类 | P0 | 1-2 天 | 无 |
| C | JSON 导入冲突处理 | P0 | 1-2 天 | B |
| D | 弱词本删除 | P0 | 0.5 天 | 无 |
| E | JSON 事务化 + 体验 | P0 | 1-2 天 | B |
| F | WP1 代码健康度 | P0/P1 | 2-3 天 | 无 |
| G | 队列动态补充回归 | P0 | 0.5 天 | 已完成核心 |
| H | 发音与音频 | P1 | 2-3 天 | F |
| I | Easy Days | P1 | 2-3 天 | F |
| J | AI 智能生成 | P2 | 3-4 天 | F/H |
| K | 多端云同步 | P2 | 3-5 天 | E |

---

## 建议执行顺序

> **A → B → C → D → E → F → G → H/I（可并行）→ J → K**

- A、B、C、D 是用户当前最直接的需求。
- E 是数据可靠性与未来同步基础。
- F 是 Phase 7 最优先的健康度修复。
- G 是已实现功能的回归收尾。
- H-K 作为后续迭代，按资源和优先级推进。
