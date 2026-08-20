# Reciter 单词学习逻辑分析报告

通过对 `src/stores/useStudyStore.ts` 以及相关底层逻辑 `src/lib/db.ts` 和 `src/lib/review.ts` 的分析，目前的学习任务流程和功能实现在设计意图与实际代码执行上存在几处明显的矛盾和潜在 Bug。

## 1. 核心问题：短间隔重排逻辑（`insertByDue`）与预期完全相反

### 设计意图
根据 `useStudyStore.ts` 中的注释：
> "按 FSRS due 时间二分插入（P0-②）：Learning/Again 卡的短间隔调度（如 1 分钟）不会被'插到队尾'拖成 30 分钟后。"

作者希望当用户选择“忘记（Again）”时，FSRS 调度出的短间隔（例如 1 分钟后复习）能让该卡片在约 1 分钟后出现，而不是死板地塞到今天全部几百张待复习卡片的最后面。

### 实际代码表现
代码中使用了基于 `due`（到期时间）的二分查找算法 `insertByDue` 来决定插入位置：
```typescript
export function insertByDue(queue: QueueItem[], item: QueueItem): void {
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
**问题在于比较对象的错位：**
1. **未学习的复习卡**：它们的 `due` 是在**过去**（例如昨天，或者今天早些时候），因为它们是今天“到期”的卡。
2. **被点 Again 重插的卡**：它通过 FSRS 计算出的新 `due` 是在**未来**（例如 `Date.now() + 1 分钟`）。

由于 **过去的由于时间 < 未来的 1 分钟后** 永远成立，`insertByDue` 在二分查找时会跳过所有未学习的复习卡，最终把这张短间隔卡片**精确地插到了所有未学习卡片的最后面（即队尾）**。
这直接导致了代码行为与注释里的意图**完全相反**——它依然被拖到了 30 分钟后。

**修复建议：**
不能使用绝对的 `due` 时间去和历史 `due` 时间做比较。如果要实现“1 分钟后出现”，应当计算出目标时间距离当前的 `delta = new_due - Date.now()`，然后按照平均每张卡片的耗时（如 10 秒/张）将其折算为队列索引偏移量：
```typescript
// 估算：每张卡片平均 10 秒
const timeToSeconds = (new Date(newFsrs.due).getTime() - Date.now()) / 1000;
const cardOffset = Math.max(1, Math.ceil(timeToSeconds / 10)); 
const insertIndex = Math.min(queueNext.length, index + cardOffset);
queueNext.splice(insertIndex, 0, updated);
```

## 2. 队列交错逻辑（`interleaveQueue`）的边缘体验问题

### 代码现状
```typescript
for (let i = 0; i < due.length; i++) {
  result.push(due[i]);
  if ((i + 1) % ratio === 0 && fi < fresh.length) {
    result.push(fresh[fi++]);
  }
}
while (fi < fresh.length) result.push(fresh[fi++]);
```
`interleaveQueue` 的实现是：每隔 `ratio`（默认 5）张复习卡，插入 1 张新卡。当复习卡遍历完后，所有剩余的新卡被一次性直接追加到队尾。

### 问题分析
如果用户的复习卡很少（例如 10 张），但每日新卡配额较多（例如 20 张）：
前 10 张复习卡中会穿插 2 张新卡。剩下的 18 张新卡将会在队尾**连续出现**，失去了“交错练习（Interleaving）”的意义。

**改进建议：**
交错算法应基于 `due` 和 `fresh` 两者的剩余比例来动态均匀分布，或者如果复习卡用完，可以直接在剩余的新卡内部打乱，而不是生硬地将大段新卡堆积在最后。

## 3. 状态更新遗漏：非重插卡片未更新 `queue` 状态

在 `rate` 方法中，只有 `Again` 或 `Learning` 状态（需要重插的卡片）在 `queueNext` 中更新了完整的 `row` 数据。对于被评为 `Good` 或 `Hard` 的卡片，代码只更新了 `shownAt`，**没有将新的 FSRS 状态回写到 `queueNext[index].row` 中**：
```typescript
if (reinsert) {
  // 更新了 row 
} else {
  queueNext[index] = { ...item, shownAt: Date.now() }; // 缺少 row 的 FSRS 状态更新
}
```
虽然这些卡片的最新状态已经异步写入了数据库，且通常不会在当前会话中再次展现（`nextIndex = index + 1`），但如果未来加入“撤销/上一张”功能，或者小结页面（MiniSummary）需要读取当前队列的实时状态属性时，就会读到过期的旧数据。

## 4. 乱序学习（Shuffle）对重插逻辑的破坏

在 `loadQueue` 中，如果开启了 `deckShuffle`：
```typescript
if (await getDeckShuffle(deckId)) {
  ordered = shuffleRows(ordered);
}
```
开启乱序后，队列被完全打乱。此时 `insertByDue` 二分查找面对的是一个连 `due`（过去时间）也是乱序的数组。
得益于所有历史 `due` 都小于未来的新 `due`，它目前勉强还能把卡片插到队尾。但如果未来修复了 `insertByDue` 让其支持在区间内插入，对一个乱序数组使用二分查找将会导致严重的、不可预测的数组越界或插入错位。
因此，抛弃基于 `due` 比较的二分插入，改用**相对偏移量插入**（见第1点修复建议）是目前最稳定且唯一兼容乱序队列的解法。

## 5. 每日复习上限（`daily_review_limit`）统计逻辑错误

在 `loadQueue` 中，系统会通过 `daily_review_limit`（默认 200）来限制当天的复习量，它是这样计算的：
`dueLimit = reviewLimit - todayReviewed`

**问题分析：**
`todayReviewed` 是通过 `db.countReviewsToday()` 获取的。该函数统计的是 `review_logs` 表的**行数**（即用户点击评分按钮的总次数），而不是**独立复习的卡片数**。
如果用户在学习过程中多次点击“忘记”或“模糊”，一张卡片可能会产生 3-4 条复习记录。这导致即使原本只需要复习 60 张独立卡片，也可能产生近 200 条点击记录，从而人为地、提前耗尽了当天的 `dueLimit`。
这解释了为什么用户在学完第一阶段（约 60 词）后，第二次再学时队列急剧缩水（因为复习额度被无效按键次数消耗殆尽），最后甚至只剩新卡。

**改进建议：**
修改 `src/lib/db.ts` 中的 `countReviewsToday` 函数，使其按独立卡片（去重）进行统计：
```sql
SELECT COUNT(DISTINCT card_id) AS cnt FROM review_logs WHERE reviewed_at >= ?
```

## 结论

当前的单词学习队列在基础的“拉取 -> 评分 -> 存库”流程上是通顺的，但在**队列内动态重排（Scheduling）**及**配额统计**上存在明显漏洞。建议优先将 `insertByDue` 重构为基于相对偏移量的估算插入，并将复习统计 `countReviewsToday` 改为去重统计，以保证学习流的连贯性和符合记忆曲线设计的初衷。
