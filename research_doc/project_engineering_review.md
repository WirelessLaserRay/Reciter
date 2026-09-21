# Reciter 工程质量评审报告与改进路线图

> 方法：全量源码结构浏览 + 构建/类型检查实测（`tsc --noEmit` 通过，退出码 0）+ Git 历史与文档体系审查
> 评审日期：2026-09-20 · 基线版本：v0.16.7（commit `fe6e4b2`）

---

## 一、评审结论概览

| 维度 | 评级 | 一句话诊断 |
|---|---|---|
| **架构设计** | 🟢 优秀 | 薄壳 Tauri + SQLBackend 双端抽象是核心亮点，但存在上帝文件 |
| **代码质量** | 🟢 良好 | TS 严格检查零错误、注释规范；缺 lint/格式化工具链 |
| **测试与 CI** | 🔴 薄弱 | 测试不入库、不进 CI，无 lint/测试门禁，是当前最大风险 |
| **文档与流程** | 🟢 优秀 | README/AGENT/CHANGELOG/research_doc 体系远超同类个人项目 |
| **功能完成度** | 🟢 优秀 | 功能矩阵完整，产品细节（原子导入、多网关降级等）成熟 |
| **安全与隐私** | 🟡 可改进 | Worker 白名单/Token 机制齐备，但桌面端 CSP 关闭、同步快照明文 |

**总体评价**：完成度与文档水准令人印象深刻，架构决策（薄壳 Rust + 统一 SQL 抽象 + 评分链路收口 `applyReview()`）成熟务实。当前最值得投入的不是新功能，而是**把测试固化进仓库并接入 CI、拆分巨型组件、补上 lint 门禁**——工程质量需要匹配上文档水准。

---

## 二、项目现状盘点

### 2.1 规模与结构

| 层 | 规模 | 说明 |
|---|---|---|
| 前端 `src/` | 99 个 TS/TSX 文件，约 2.7 万行 | React 18 + Vite 7 + Tailwind v4 + shadcn/ui + Zustand + React Router 7 |
| 桌面壳 `src-tauri/` | Rust 约 200 行 + 10 个迁移 | 薄壳：sql / http / dialog 插件 + 文件读写命令 |
| 云函数 `worker/` | 约 1100 行 TS | KV 快照同步 + DeepL 代理 + RSS/Readability 每日一文 |
| 文档 | README / IDEA / PLAN / AGENT / CHANGELOG(70KB) / research_doc(10 篇) | 完整知识链 |

### 2.2 体积超标文件（上帝文件清单）

| 文件 | 大小 | 建议处置 |
|---|---|---|
| [`src/pages/Settings.tsx`](src/pages/Settings.tsx) | 98 KB | 按设置标签页拆分为独立组件（见 §四.2） |
| [`src/pages/Study.tsx`](src/pages/Study.tsx) | 64 KB | 抽出学习流编排、小结视图、配额逻辑 |
| [`src/pages/DailyArticle.tsx`](src/pages/DailyArticle.tsx) | 63 KB | 抽出阅读器、生词队列、通道切换 |
| [`src/lib/db.ts`](src/lib/db.ts) | 60 KB（约 1500 行单类） | 按领域拆 repository（见 §四.2） |
| [`src/components/study/StudyCard.tsx`](src/components/study/StudyCard.tsx) | 53 KB | 按学习模式（teach/recall/classic）拆子组件 |
| [`src/pages/Import.tsx`](src/pages/Import.tsx) | 41 KB | 抽出预览、冲突检测、diff 视图 |
| [`src/components/study/ExamPlanDialog.tsx`](src/components/study/ExamPlanDialog.tsx) | 40 KB | 抽出计划生成与展示 |

### 2.3 实测验证结果

- `npx tsc --noEmit`：✅ 通过（严格类型检查零错误）
- Git 工作区：✅ 干净，Conventional Commits 规范，提交粒度良好
- 仓库内测试文件：❌ 无（无 `*.test.ts` / `*.spec.ts`，无 vitest/jest 依赖）
- CI 工作流：仅 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)（构建 + 部署 Pages），无测试/lint 门禁
- Lint/格式化配置：❌ 根目录无 ESLint / Prettier 配置

---

## 三、核心问题详述

### 3.1 🔴 测试体系空心化（最高优先级）

**现状**：[`AGENT.md`](AGENT.md) §2.3 要求"每个功能必须编写测试"，但测试全部放在 gitignored 的 `.install/` 目录（当前磁盘上已不存在）。后果：

1. 测试**不可复现**——换机器/换协作者即丢失全部测试资产；
2. 测试**不进 CI**——合并前无自动化回归保障；
3. 对 FSRS 调度、队列编排、迁移链路这类**逻辑密集且已有历史教训**（AGENT.md §7 记录了 11 条）的代码，裸奔风险极高。

### 3.2 🟡 上帝文件的可维护性风险

`db.ts` 单类约 1500 行，承载 CRUD、学习队列、统计、搜索、迁移恢复等全部 SQL 职责；`Settings.tsx` 近 10 万字符。这类文件的修改冲突率高、Code Review 困难、单元测试难以挂载。

### 3.3 🟡 工程基线缺失

- 无 ESLint/Prettier：代码风格仅靠文档约定，无法自动拦截（如 `console.log` 残留、未使用变量）。
- [`package.json`](package.json) 中 `shadcn`（CLI 工具）误置 `dependencies`，会进入生产安装树。
- CI 仅做 Pages 部署，`tsc` 之外无任何质量门禁。

### 3.4 🟡 安全与数据风险点

| 位置 | 问题 | 风险 |
|---|---|---|
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | `"csp": null` | 应用渲染外部内容（新闻文章、AI 输出的 Markdown），关闭 CSP 扩大 XSS 敞口 |
| [`worker/src/index.ts`](worker/src/index.ts) | KV 全量快照 + 单 SYNC_TOKEN | 多设备并发写 = last-write-wins，无冲突合并；Token 泄露即全量数据泄露 |
| 同步快照 | 明文存储于 KV | 备份加密已在路线图，建议提前 |

> 说明：Worker 放行 `Origin: null` 与 localhost 属于兼容 WebView 的合理妥协，DeepL 路径白名单、同步接口强制 Token 的设计是正确的，予以肯定。

---

## 四、改进建议（含路径与方法）

### 4.1 P0：引入 Vitest，把测试固化进仓库

**目标**：核心纯逻辑与 SQL 链路均有入库测试，CI 强制运行。

**步骤**：

1. 安装依赖：
   ```bash
   npm i -D vitest @vitest/coverage-v8
   ```
2. [`package.json`](package.json) 增加脚本：
   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```
3. 新建 `tests/` 目录（与 `src/` 平级，避免打包进产物），按模块组织：
   ```
   tests/
   ├── lib/
   │   ├── importer.test.ts        # Markdown/CSV/JSON 解析与冲突检测
   │   ├── recall-match.test.ts    # 模糊比对阈值、词性标签过滤
   │   ├── meaning.test.ts         # 释义主次拆分
   │   ├── exam-planner.test.ts    # 备考计划分阶段生成
   │   ├── day.test.ts             # 日界 04:00 换算（历史教训 #2 的回归保障）
   │   └── fsrs.test.ts            # 调度预览、desired_retention 边界
   └── db/
       ├── migrations.test.ts      # 001-010 全量迁移幂等性（sql.js 注入）
       ├── crud.test.ts            # Deck/Card upsert、原子导入回滚
       └── study-queue.test.ts     # due 队列、新卡配额、忽略标签过滤
   ```
4. SQL 链路测试复用现有能力（AGENT.md §6 已验证的模式）：
   ```typescript
   import initSqlJs from "sql.js";
   import { SqlJsBackend } from "@/lib/sql/sqljs-backend";
   const backend = new SqlJsBackend(() => initSqlJs());
   ```
5. 将 `.install/` 中尚可找回的历史测试迁移进 `tests/` 并入库。
6. [`vite.config.ts`](vite.config.ts) 增加 vitest 配置（`test.alias` 复用 `@` 别名），或新建 `vitest.config.ts`。

**验收标准**：`npm test` 本地全绿；新功能 PR 必须附带对应测试（写入 AGENT.md §2.3 并真实执行）。

### 4.2 P1：拆分上帝文件

**`src/lib/db.ts` → 按领域拆 repository**（保持 `db` 门面导出不变，调用方零改动）：
```
src/lib/db/
├── index.ts            # 门面：组合并 re-export 各 repository
├── backend.ts          # 连接/迁移/requireDb 基础设施
├── deck-repo.ts        # decks CRUD、文件夹、重命名避让
├── card-repo.ts        # cards CRUD、upsert、搜索
├── study-repo.ts       # 学习队列、今日配额统计
├── stats-repo.ts       # daily_stats、掌握度分布
└── types.ts            # StudyCardRow / UpsertResult 等（从原 db.ts 迁出）
```

**`src/pages/Settings.tsx` → 按标签页拆组件**：
```
src/pages/Settings/
├── index.tsx                 # 外壳 + Tab 导航（< 200 行）
├── tabs/GeneralTab.tsx       # 学习偏好、日界、评分档位
├── tabs/AISettingsTab.tsx    # AI 双通道配置、向导入口
├── tabs/DeckDefaultsTab.tsx
├── tabs/NewsTab.tsx          # 每日一文 RSS/通道
├── tabs/DataTab.tsx          # 导入导出、同步、备份
└── tabs/AppearanceTab.tsx    # 主题
```

**方法**：每次只拆一个文件、纯移动不改逻辑，拆完即跑 `npm run build` + `npm test` 验证；利用 git 小步提交保证可回滚。

### 4.3 P1：补上 ESLint + CI 门禁

1. 安装并初始化：
   ```bash
   npm i -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks
   ```
   新建 `eslint.config.js`（flat config），规则从 `recommended` 起步，开启 `react-hooks` 规则。
2. [`package.json`](package.json) 增加 `"lint": "eslint ."`，并将 `build` 改为 `npm run lint && tsc && vite build`。
3. 新建 `.github/workflows/ci.yml`：PR/push 触发，依次执行 `npm ci → npm run lint → npx tsc --noEmit → npm test → npm run build`，与 deploy 工作流解耦。

### 4.4 P2：安全与依赖修正

1. **开启 CSP**（[`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)）：替换 `"csp": null` 为白名单式策略，例如：
   ```json
   "csp": "default-src 'self'; img-src 'self' data: https:; connect-src 'self' https: tauri:; style-src 'self' 'unsafe-inline'"
   ```
   逐项验证 AI API、Worker、TTS、新闻图片域名后收紧。
2. **依赖归位**：`npm i -D shadcn` 将其移入 `devDependencies`。
3. **同步增强**（与路线图"备份加密"合并实施）：
   - 上传前用用户口令派生密钥（PBKDF2/WebCrypto AES-GCM）加密快照；
   - KV value 中记录 `deviceId` + `updatedAt`，上传前比对 meta，检测并发写冲突并提示用户选择保留端，替代静默 last-write-wins。

### 4.5 P3：长期演进

- React 18 → 19 升级评估（配合 react-router/recharts 兼容性验证）。
- FSRS-6 升级预留（ts-fsrs 已跟进上游）。
- 为 `worker/` 增加 miniflare 本地测试（其依赖树中已有 miniflare，可直接利用）。

---

## 五、改进优先级矩阵

| 优先级 | 改进项 | 难度 | 预期收益 |
|---|---|---|---|
| **P0** | ④.1 Vitest + 测试入库 + `npm test` | 中等 | 🔴 补齐最大短板，逻辑回归有保障 |
| **P0** | ④.3 CI 门禁（lint + tsc + test + build） | 简单 | 🔴 防止带病合并 |
| **P1** | ④.2 拆分 `db.ts` / `Settings.tsx` | 中等 | 🟡 降低冲突率，测试可挂载 |
| **P1** | ④.3 ESLint flat config | 简单 | 🟡 风格与低级错误自动拦截 |
| **P2** | ④.4 开启 CSP | 简单 | 🟡 收敛 XSS 敞口 |
| **P2** | ④.4 shadcn 移入 devDependencies | 极简单 | 🟢 减小生产安装体积 |
| **P2** | ④.4 同步加密 + 冲突检测 | 中等 | 🟡 多设备数据安全 |
| **P3** | ④.5 React 19 / FSRS-6 / worker 测试 | 中等 | 🟢 长期演进 |

---

## 六、执行顺序建议

```
第 1 周：④.3 ESLint + CI 门禁（成本低、立即生效）
         └─ ④.1 Vitest 骨架 + 迁移 3-5 个核心测试（day/importer/recall-match）
第 2 周：④.1 补全 db 链路测试（sql.js 注入模式）
         └─ ④.4 shadcn 归位 + CSP 开启验证
第 3-4 周：④.2 拆分 db.ts（先行，测试已就位）→ 拆分 Settings.tsx
后续迭代：④.4 同步加密 → ④.5 长期项
```

> 原则：**先有测试安全网，再动拆分手术**；每步小步提交，遵循 AGENT.md §2 既有工作流。
