# Reciter 学习逻辑审计报告

> 方法：源码逐行审计 + 认知科学/SRS 最新研究对照  
> 审计日期：2026-08-15

---

## 一、审计结论概览

| 维度 | 现状评级 | 一句话诊断 |
|---|---|---|
| **FSRS 算法集成** | 🟢 优秀 | ts-fsrs v5 正确接入，参数设计合理 |
| **队列排序策略** | 🟡 可改进 | 排序逻辑简单，缺少优先级分层 |
| **主动回忆实现** | 🟢 优秀 | 已实现完整的回忆-比对-评分流程 |
| **交错练习** | 🔴 缺失 | 新卡/复习卡按类型分段，未交错 |
| **上下文记忆** | 🟡 可改进 | 有 MarkdownContext 但触发条件有限 |
| **Leech 管理** | 🟡 可改进 | 有弱词追踪但缺少自动干预 |
| **新卡教学流程** | 🟢 良好 | NewCardTeachView 先教后测，方向正确 |
| **评分机制** | 🟢 优秀 | 三档/四档可切换，贴合研究最佳实践 |
| **学习步骤** | 🟡 可改进 | 依赖 ts-fsrs 默认步骤，未暴露配置 |
| **回忆时限** | 🔴 缺失 | 无"10 秒规则"，用户可无限思考 |

**总体评价**：学习逻辑的**底层算法（FSRS）和基础架构设计优秀**，已经超越了市面上大多数中文背词 App 的算法水平。主要改进空间在**队列编排策略**和**认知科学细节**上——这些是从"能用"到"高效"的关键差距。

---

## 二、逐项诊断

### 2.1 FSRS 算法集成 🟢

**审计发现**（[`fsrs.ts`](src/lib/fsrs.ts)）：

| 检查项 | 状态 | 说明 |
|---|---|---|
| ts-fsrs 版本 | ✅ | 使用 ts-fsrs v5，支持 `learning_steps` 持久化 |
| `request_retention` | ✅ | 默认 0.9，可在设置中调整，范围 [0.8, 0.95] |
| `enable_fuzz` | ✅ | 已启用随机微调，避免复习堆积 |
| `maximum_interval` | ✅ | 36500 天（100 年），不会人为截断间隔 |
| 调度器缓存 | ✅ | 按 retention 缓存，`invalidateFSRS()` 可重建 |
| 间隔预览 | ✅ | `previewIntervals()` 为四档评分各预览下一间隔 |
| 可检索度 | ✅ | `getRetrievability()` 实时计算 |

**科研对标**：
- FSRS 论文（Ye, 2023）证实比 SM-2 **减少 20-30% 复习量**，同等记忆保留率
- 项目的 `request_retention = 0.9` 是高考/考研场景的合理默认值
- `enable_fuzz = true` 符合社区最佳实践（避免"复习山"）

**问题**：无明显问题。参数选择合理。

> [!TIP]
> 可考虑在设置页增加"目标场景"预设：考研模式 0.90 / 日常阅读 0.85 / 轻量维护 0.80，帮助用户做出选择。

---

### 2.2 队列排序策略 🟡

**审计发现**（[`db.ts:509`](src/lib/db.ts#L509) + [`useStudyStore.ts:84`](src/stores/useStudyStore.ts#L84)）：

当前排序逻辑：
```sql
-- 到期卡片
ORDER BY cs.due ASC, c.id ASC

-- 新卡片
ORDER BY c.id ASC
```

队列合并方式：
```typescript
const queue = [...due, ...fresh].map(row => ({ row, shownAt: Date.now() }));
//           ↑ 先全部 due 卡，再全部新卡，无交错
```

**问题**：

1. **新卡全部排在复习卡后面**——如果有 50 张到期卡片，用户要全部复习完才能见到新卡。这违反了认知科学中的**交错练习**原则（interleaving）

2. **未按 retrievability 排序**——FSRS 社区推荐按"可检索度降序"排序（最可能忘记的卡先出），而非简单的 `due ASC`。当前按 due 时间排意味着过期最久的卡先出，这在大多数情况下是合理的，但在有大量积压时不够精准

3. **Learning 状态的卡没有特殊优先**——处于 Learning 阶段的卡（刚学没多久）应该比 Review 到期卡更优先，因为间隔很短（几分钟内）

**科研依据**：
- Bjork (2011) "Desirable Difficulties"：交错练习迫使大脑在不同类型间切换，增强辨别能力，长期记忆提升 20-40%
- Anki 社区最佳实践：Review → Learning → New 的优先级分层
- FSRS 作者推荐：按 retrievability 降序排列复习卡

---

### 2.3 主动回忆实现 🟢

**审计发现**（[`StudyCard.tsx:224-323`](src/components/study/StudyCard.tsx#L224) + [`recall-match.ts`](src/lib/recall-match.ts)）：

| 检查项 | 状态 | 说明 |
|---|---|---|
| 回忆流程 | ✅ | prompt → input → result 三阶段完整 |
| 模糊比对 | ✅ | 规范化 + 分词 + 包含检查 + Levenshtein，阈值 0.6 |
| 不确定路径 | ✅ | 「不确定/不知道」→ 直接翻面 → 限制为两档评分 |
| 词性标签过滤 | ✅ | 去除 n./v./adj. 等干扰标签 |
| 可配置 | ✅ | 可通过设置关闭，降级为经典翻转 |

**科研对标**：
- Karpicke & Roediger (2008)：主动检索 vs 被动复习，长期记忆保留差异可达 **50%**
- 项目实现了"强制产出"而非"被动翻看"，这是认知科学最强力的建议

**问题**：

1. **无回忆时限**——用户可以无限思考后再输入答案。Anki 社区的"10 秒规则"建议：如果 10 秒内想不起来，应直接标记为 Again。无时限会导致用户花大量时间在单一卡片上，降低整体效率

2. **比对只覆盖中文释义**——用户输入的是中文释义与 `back` 比对。但 `back` 字段可能包含英文搭配（如 `"vt. 放弃; 抛弃; abandon oneself to sth. 沉湎于"`），这会影响匹配精度

---

### 2.4 交错练习 🔴

**审计发现**：

当前队列结构（[`useStudyStore.ts:84`](src/stores/useStudyStore.ts#L84)）：
```
[due_1, due_2, ..., due_N, new_1, new_2, ..., new_M]
```

**问题**：
- 这是纯粹的**分块式**排列——先复习全部到期卡，再学习全部新卡
- 没有将新卡和复习卡交错穿插
- 也没有将不同标签（如「单词」vs「词组」）的卡片交错

**科研依据**：
- Rohrer & Taylor (2007)：交错练习组的一周后测试成绩比分块组高 **43%**
- Pan et al. (2019)：词汇学习中，交错不同类型（如动词/名词/形容词）可显著提升辨别能力
- 实践案例：Anki 默认将新卡穿插在复习卡之间（可配置位置：开头/结尾/随机）

---

### 2.5 上下文记忆 🟡

**审计发现**（[`study-mode.ts:41`](src/lib/study-mode.ts#L41) + [`MarkdownContext.tsx`](src/components/study/MarkdownContext.tsx)）：

| 场景 | `showMarkdown` | 是否展示原文语境 |
|---|---|---|
| 新卡教学 `new_teach` | `true` | ✅ |
| 主动回忆 `recall` | `false` | ❌ |
| 快速测试 `quick_test` | `false` | ❌ |
| AI 深攻 `ai_drill` | `true` | ✅ |
| 经典翻转 `classic` | `false` | ❌ |

**问题**：
- **复习卡从不展示原文语境**——这浪费了 `markdown_content` 字段中的宝贵数据
- 考研词汇的一个核心挑战是**熟词生义**（如 address = 解决/演讲，而非只是"地址"），语境展示对此至关重要
- 科学研究表明，**语境变化**本身就是一种"desirable difficulty"——在不同语境中回忆同一个词比在固定语境中更有效

**科研依据**：
- Smith & Handy (2014)：在学习时编码多个上下文线索的词汇，在新上下文中的迁移表现优于无上下文学习
- Nation (2001)："理想词汇习得需要在 6-12 个不同语境中遇到同一个词"
- 不背单词 App 的核心卖点就是"影视原声语境例句"

---

### 2.6 Leech 管理 🟡

**审计发现**（[`study-mode.ts:36`](src/lib/study-mode.ts#L36) + [`useStudyStore.ts:138-140`](src/stores/useStudyStore.ts#L138)）：

当前弱词判定：
```typescript
const isWeak = state.lapses >= 2;  // study-mode.ts:36
```

弱词追踪：
```typescript
weakWords: grade === Rating.Again
  ? [...get().stats.weakWords, item.row.front]
  : get().stats.weakWords,           // useStudyStore.ts:138-140
```

**问题**：

1. **阈值 `lapses >= 2` 过低**——Anki 默认 leech 阈值是 **8 次**。`lapses >= 2` 意味着几乎所有犯过两次错的词都被标为弱词，这会导致弱词本膨胀，失去"重点突破"的价值。建议提高到 **4-5 次**

2. **无自动干预机制**——Anki 的 leech 策略是自动**暂停**leech 卡片（从队列中移除），迫使用户主动审查和修改卡片后再恢复。Reciter 只标记但不干预

3. **弱词追踪仅限当前会话**——`stats.weakWords` 在 `reset()` 时清空。跨会话的弱词趋势无法追踪

4. **缺乏"为什么忘"的诊断**——弱词只知道"忘了几次"，不知道"为什么忘"。常见原因包括：相似词混淆（如 affect/effect）、一词多义、拼写接近

---

### 2.7 新卡教学流程 🟢

**审计发现**（[`StudyCard.tsx:328-425`](src/components/study/StudyCard.tsx#L328) `NewCardTeachView`）：

教学流程：
```
展示单词 + 释义 + 原文语境（MarkdownContext）
    ↓
「开始记忆测试」按钮
    ↓
根据释义拼写单词（Input + 检查）
    ↓
显示对错 → 评分
```

**优点**：
- 先教后测，符合"先建立语义连接再检测"的认知原则
- 展示 Markdown 原文语境，提供词汇使用场景
- 拼写测试强制产出（active recall）

**问题**：

1. **测试方向固定为中→英拼写**（L346: `typed.trim().toLowerCase() === row.front.trim().toLowerCase()`）——新卡的首次测试要求拼写单词，但认知研究表明**识别先于产出**。第一次学一个词时，先做识别题（选择题）比直接要求拼写更符合学习曲线

2. **缺少多感官通道**——没有发音/音频。考研虽然不考听力，但语音编码是重要的记忆通道。即使只展示音标也有帮助

3. **教学阶段没有词根词缀分析**——考研英语备考社区（知乎/少数派/考研帮）的共识是**词根词缀法**是最高效的策略之一。项目的 AI 教学模式可以做到这一点（`teach` 策略），但当 AI 未启用时没有离线替代

---

### 2.8 快速测试（熟练卡） 🟢

**审计发现**（[`StudyCard.tsx:429-545`](src/components/study/StudyCard.tsx#L429) `QuickTestView`）：

```typescript
const QUICK_MS = 8000; // 秒答阈值
```

**优点**：
- 熟练卡（`stability >= 10`）自动切换为快速测试，减少不必要的翻转操作
- 8 秒内答对自动 Good，不干扰用户流
- 自动生成干扰项（从队列中取其他卡的 `back`）

**问题**：
- 干扰项来源有限——只从当前队列取。如果队列只有 5 张卡，选项区分度低
- `QUICK_MS = 8000`（8 秒）偏长。研究建议 5 秒更合适（"如果 5 秒内想不起来，说明没有真正掌握"）

---

### 2.9 Learning/Again 重插逻辑

**审计发现**（[`useStudyStore.ts:143-153`](src/stores/useStudyStore.ts#L143)）：

```typescript
const reinsert = newFsrs.state === State.Learning || grade === Rating.Again;
if (reinsert) {
  queueNext[index] = { ...item, row: { ...item.row, ...fsrsCardToDBState(newFsrs) }, shownAt: Date.now() };
  const [cur] = queueNext.splice(index, 1);
  queueNext.push(cur); // ← 始终插入队尾
}
```

**问题**：
- **Always 插入队尾**——这意味着如果队列有 100 张卡，Again 的卡要等 100 张后才再次出现。FSRS 可能给 Again 卡安排的下次 due 时间是 1 分钟后，但实际要等 30 分钟+
- 更好的策略：按 FSRS 计算的 `due` 时间**二分插入**到队列中正确的位置

---

## 三、改进建议

### 改进 ① 队列交错：新卡穿插到复习卡中

**涉及文件**：[`useStudyStore.ts`](src/stores/useStudyStore.ts)

```typescript
// 现有：[...due, ...fresh]
// 改为：每 N 张复习卡后插入 1 张新卡

function interleave(due: StudyCardRow[], fresh: StudyCardRow[], ratio = 5): StudyCardRow[] {
  const result: StudyCardRow[] = [];
  let fi = 0;
  for (let i = 0; i < due.length; i++) {
    result.push(due[i]);
    if ((i + 1) % ratio === 0 && fi < fresh.length) {
      result.push(fresh[fi++]);
    }
  }
  // 剩余新卡追加
  while (fi < fresh.length) result.push(fresh[fi++]);
  return result;
}
```

**预期效果**：新卡不再堆积在最后，学习节奏更自然；交错练习提升长期记忆 20-40%（Rohrer & Taylor, 2007）

**设置项**：新增 `interleave_ratio`（默认 5），可在设置页调整

---

### 改进 ② Again 卡按 due 时间插入正确位置

**涉及文件**：[`useStudyStore.ts`](src/stores/useStudyStore.ts)

```typescript
// 现有：queueNext.push(cur); // 插入队尾
// 改为：二分查找插入

function insertByDue(queue: QueueItem[], item: QueueItem): void {
  const due = new Date(item.row.due).getTime();
  let lo = 0, hi = queue.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(queue[mid].row.due).getTime() <= due) lo = mid + 1;
    else hi = mid;
  }
  queue.splice(lo, 0, item);
}
```

**预期效果**：FSRS 算出的 1 分钟后复习的 Again 卡不会被延迟到 30 分钟后，learning_steps 的精确度大幅提升

---

### 改进 ③ 复习卡按 retrievability 排序

**涉及文件**：[`db.ts`](src/lib/db.ts) — `getDueCards` 方法

```sql
-- 现有：ORDER BY cs.due ASC, c.id ASC
-- 改为（简易近似）：
ORDER BY
  CASE WHEN cs.state IN (1, 3) THEN 0 ELSE 1 END,  -- Learning/Relearning 优先
  cs.due ASC,
  c.id ASC
```

或更精确的 retrievability 排序（需计算）：
```sql
ORDER BY
  CASE WHEN cs.state IN (1, 3) THEN 0 ELSE 1 END,
  (cs.stability * 1.0) / MAX(0.01, JULIANDAY('now') - JULIANDAY(cs.last_review)) ASC
```

**预期效果**：最可能遗忘的卡先出现，时间利用效率最高

---

### 改进 ④ 主动回忆增加时限提示

**涉及文件**：[`StudyCard.tsx`](src/components/study/StudyCard.tsx) — `ActiveRecallView`

```typescript
// 在 "prompt" 阶段启动 10 秒计时器
const [elapsed, setElapsed] = useState(0);
useEffect(() => {
  const timer = setInterval(() => setElapsed(e => e + 1), 1000);
  return () => clearInterval(timer);
}, []);

// UI: 显示柔和的计时提示
{elapsed >= 10 && (
  <p className="text-xs text-amber-500">
    已思考 {elapsed} 秒 — 超过 10 秒仍想不起来？建议直接点「不确定」
  </p>
)}
```

**注意**：不强制跳转，只是**柔和提示**。避免产生焦虑感。

**预期效果**：减少用户在单一卡片上花费过多时间，提升整体学习效率

---

### 改进 ⑤ Leech 阈值提高 + 自动暂停机制

**涉及文件**：[`study-mode.ts`](src/lib/study-mode.ts) + [`review.ts`](src/lib/review.ts)

```typescript
// study-mode.ts: 阈值从 2 提高到 4
const isWeak = state.lapses >= 4;

// review.ts: applyReview 后检查是否触发 leech
export async function applyReview(...) {
  // ... existing logic ...
  
  // Leech 检测：lapses 达到阈值时自动标记
  if (card.lapses >= LEECH_THRESHOLD && card.lapses % LEECH_THRESHOLD === 0) {
    await db.setCardKey(cardId, true); // 标记为重点词（is_key = 1）
    // 可选：发送通知到 UI 层
  }
  return card;
}
```

**预期效果**：弱词本更精准（减少噪音），leech 卡自动获得"重点"标记，在后续学习中得到更多关注

---

### 改进 ⑥ 复习卡也展示语境（翻转后）

**涉及文件**：[`study-mode.ts`](src/lib/study-mode.ts)

```typescript
// 所有模式在评分阶段（已翻转/已回忆后）都可展示 markdown
// 改 recall 和 classic 的 showMarkdown:
// 不在正面展示（避免泄漏），在结果阶段展示

// 在 StudyCard.tsx 的 result 阶段：
{row.markdown_content && (
  <details className="mt-2">
    <summary className="text-xs text-muted-foreground cursor-pointer">
      📖 查看原文语境
    </summary>
    <MarkdownContext markdownContent={row.markdown_content} word={row.front} />
  </details>
)}
```

**预期效果**：每次复习都强化语境联想，而不只是"释义 ↔ 单词"的孤立映射

---

### 改进 ⑦ 新卡首测改为识别题（选择题），非拼写

**涉及文件**：[`StudyCard.tsx`](src/components/study/StudyCard.tsx) — `NewCardTeachView`

```
当前：教学 → 根据释义拼写单词（高难度）
改为：教学 → 看单词选释义（低难度识别题）
      ↓ 答对后
      下次 due → 进入 recall 模式（中难度回忆题）
      ↓ 再次答对
      再下次 → quick_test（高难度产出题）
```

**认知科学原理**：**识别先于回忆，回忆先于产出**（recognition → recall → production）。第一次学词就要求拼写，相当于跳过了前两个阶段。

---

### 改进 ⑧ 干扰项池扩大

**涉及文件**：[`StudyCard.tsx`](src/components/study/StudyCard.tsx) — `QuickTestView`

```typescript
// 现有：从当前队列取干扰项（可能很少）
// 改为：从词库全部卡片中取

// 在 StudyCard 的 props 中新增 allCards 或在 db.ts 新增方法：
async getRandomCards(deckId: number, exclude: number, count: number): Promise<{back: string}[]>
```

**预期效果**：选项更具迷惑性，测试效度提高

---

### 改进 ⑨ 快速测试秒答阈值调整

**涉及文件**：[`StudyCard.tsx`](src/components/study/StudyCard.tsx)

```typescript
const QUICK_MS = 5000; // 从 8 秒降为 5 秒
```

同时新增设置项 `quick_test_threshold_ms`，允许用户自定义。

---

### 改进 ⑩ recall-match 比对逻辑增强

**涉及文件**：[`recall-match.ts`](src/lib/recall-match.ts)

```typescript
// 问题：back = "vt. 放弃; 抛弃; abandon oneself to sth. 沉湎于"
// 用户输入 "放弃" 可以匹配
// 用户输入 "abandon oneself to sth" 不应该匹配（英文部分是搭配不是释义）

// 改进：在 splitMeanings 中过滤掉纯英文片段
function splitMeanings(back: string): string[] {
  return back
    .split(/[;；,，。.]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => /[\u4e00-\u9fff]/.test(s)); // 只保留含中文的片段
}
```

---

### 改进 ⑪ 学习步骤可配置

**涉及文件**：[`fsrs.ts`](src/lib/fsrs.ts) + [`Settings.tsx`](src/pages/Settings.tsx)

FSRS 社区建议：**短且少的学习步骤**（如 `1m, 10m`），让 FSRS 从第二天开始接管调度。多日学习步骤（如 `1d`）会干扰 FSRS 的动态调度。

```typescript
// 在 generatorParameters 中可配置：
const params = generatorParameters({
  request_retention: r,
  maximum_interval: 36500,
  enable_fuzz: true,
  // 新增：允许用户配置
  // learning_steps 通过 ts-fsrs 配置（如果支持）
});
```

设置页新增"学习步骤"输入：默认 `1, 10`（分钟），高级用户可修改。

---

### 改进 ⑫ 目标记忆率场景预设

**涉及文件**：[`Settings.tsx`](src/pages/Settings.tsx)

```
当前：手动拖动滑块 0.80 - 0.95
改为：增加预设按钮 + 滑块

  ┌──────────────────────────────────────┐
  │ 目标记忆率                            │
  │                                      │
  │ [考研/考试 0.90] [日常阅读 0.85]       │
  │ [轻量维持 0.80]                       │
  │                                      │
  │ ——————○————————— 0.90                │
  │                                      │
  │ 💡 考研备考建议 0.90，时间紧张可降至    │
  │    0.85 减少复习量（约少 30%）         │
  └──────────────────────────────────────┘
```

---

### 改进 ⑬ 回忆后展示相关词族

**涉及文件**：新建 `src/lib/word-family.ts` + 修改 `StudyCard.tsx`

```typescript
// 简易词族匹配：从词库中找到与当前词共享词根的其他卡片
export function findRelatedWords(front: string, allCards: {front: string}[]): string[] {
  const stem = front.replace(/(ing|ed|tion|ment|ness|able|ful|less|ous|ive|ly|er|est|al|ity)$/i, '');
  if (stem.length < 3) return [];
  return allCards
    .filter(c => c.front !== front && c.front.startsWith(stem))
    .map(c => c.front)
    .slice(0, 5);
}
```

在主动回忆的 result 阶段展示：
```
同族词：abandoned, abandonment
```

**预期效果**：建立词族网络，一个词带动多个词的记忆，对考研阅读理解中猜词义有直接帮助

---

## 四、改进优先级矩阵

| 优先级 | 改进项 | 难度 | 预期收益 |
|---|---|---|---|
| **P0** | ② Again 卡按 due 插入 | 简单 | 🔴 修复 Learning 步骤失效的 bug |
| **P0** | ① 队列交错 | 简单 | 🔴 交错练习，科学验证的最高收益改进 |
| **P1** | ④ 回忆时限提示 | 简单 | 🟡 减少低效时间 |
| **P1** | ⑤ Leech 阈值 + 自动标记 | 简单 | 🟡 弱词管理精准度 |
| **P1** | ⑥ 复习卡语境展示 | 简单 | 🟡 利用现有数据强化记忆 |
| **P1** | ⑩ recall-match 过滤英文 | 简单 | 🟡 比对准确度 |
| **P2** | ⑦ 新卡首测改选择题 | 中等 | 🟡 降低新卡学习门槛 |
| **P2** | ③ retrievability 排序 | 中等 | 🟡 复习效率优化 |
| **P2** | ⑧ 干扰项池扩大 | 简单 | 🟢 测试质量 |
| **P2** | ⑨ 秒答阈值 5s | 简单 | 🟢 细节优化 |
| **P3** | ⑫ 记忆率预设 | 简单 | 🟢 用户友好 |
| **P3** | ⑪ 学习步骤可配 | 中等 | 🟢 高级用户需求 |
| **P3** | ⑬ 词族展示 | 中等 | 🟢 附加价值 |

---

## 五、参考研究文献

1. Ye, J. (2023). *A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling* — FSRS 算法论文
2. Karpicke, J. D. & Roediger, H. L. (2008). *The Critical Importance of Retrieval for Learning* — 主动回忆核心论文
3. Bjork, R. A. (2011). *Making Things Hard on Yourself, But in a Good Way: Creating Desirable Difficulties to Enhance Learning* — "适度困难"理论
4. Rohrer, D. & Taylor, K. (2007). *The Shuffling of Mathematics Problems Improves Learning* — 交错练习实验
5. Nation, I.S.P. (2001). *Learning Vocabulary in Another Language* — 词汇习得经典
6. Smith, S. M. & Handy, J. D. (2014). *Effects of Varied and Constant Environmental Contexts on Acquisition and Retention* — 上下文变化与记忆
