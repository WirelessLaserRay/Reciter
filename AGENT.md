# AGENT.md · Reciter 开发工作流手册

> 本文件是**给 AI Agent 使用的项目操作手册**，记录本项目实际的开发工作流、环境事实、部署流程与已知陷阱。
> 开始任何开发任务前，请先通读本文件，并阅读 `IDEA.md`（需求）/ `PLAN.md`（方案）/ `ANALYSIS.md`（实施细节）。

---

## 1. 项目速览

| 项 | 值 |
|---|---|
| 产品 | Reciter：本地客制化英语学习与记忆客户端（Markdown 导入 + FSRS-5 + AI 复习） |
| 仓库 | https://github.com/WirelessLaserRay/Reciter（main 分支） |
| 平台 | Windows 桌面（Tauri 2）+ Web/PWA（平板/手机，GitHub Pages） |
| 技术栈 | Tauri 2 · React 18 · TypeScript · Vite 7 · Tailwind v4 + shadcn/ui · Zustand · React Router 7 · SQLite · ts-fsrs v5 (FSRS-5) · Recharts |
| 授权 | MIT（© 2026 WirelessLaserRay） |

**当前进度**：Phase 1-5 + 6A/6B/6C 全部完成（0.14.5，学习逻辑已按 `research_doc/learning_logic_audit.md` 与 `research_doc/study_logic_analysis.md` 实施改进；含危险区重置、形近词干扰项、选择题自适应选项、侧栏平滑折叠动画、新词延迟突击测试、词库乱序学习，并修复 learning_steps 持久化、同族词误判、队列末尾反复出现、短间隔重排与复习配额统计）。后续方向：Easy Days 负载均衡、更多题型、备份加密、多端迁移、FSRS-6 升级预留。

---

## 2. 标准开发工作流（每个功能/阶段照此执行）

### 2.1 动手前

1. 先读 `IDEA.md` → `PLAN.md` → `ANALYSIS.md`（需求与已确认方案）
2. 用 todo 工具建立任务清单（拆分后端 → 前端 → 验证 → 文档 → 发布）
3. 检查 `git status`（确保工作区干净或明确当前改动）

### 2.2 开发顺序（后端先行）

```
数据库/SQL 层 (src/lib/db.ts + 迁移) → 领域逻辑 (fsrs/parser/ai) → 状态层 (stores) → UI (pages/components) → 构建 → 测试 → 文档 → 提交 → 发布
```

- 数据库变更 = **新迁移文件**（`src-tauri/migrations/NNN_*.sql`），同步注册两处：
  - Rust：`src-tauri/src/lib.rs` 的 migrations vec
  - Web 镜像：`src/lib/migrations.ts` 的 MIGRATIONS 数组（含 `alreadyApplied` 检测用于兼容）
- UI 变更遵守既有 shadcn/ui 风格（暗色主题，`cn()` 工具，Tooltip/对话框等组件复用）

### 2.3 完成一个功能必须

1. **`npm run build`** 通过（tsc 严格检查 + vite 构建）
2. **测试**：纯逻辑用 `npx tsx .install/<测试名>.ts` 跑单测（sql.js 后端可注入 `new SqlJsBackend(() => initSqlJs())` 在 node 中完整测试 SQL 链路）
3. **更新 `CHANGELOG.md`**（Keep a Changelog：新版本段 [x.y.z] + Added/Fixed/Verified）
4. **更新 `README.md`**（功能矩阵/结构/使用方式如有变化）
5. **提交推送**：Conventional Commits（`feat:`/`fix:`/`docs:`/`chore:`），body 列要点
6. **部署**：
   - PWA：推送 main 即自动部署（GitHub Actions → Pages），验证 https://wirelesslaserray.github.io/Reciter/ 返回 200
   - Windows 正式版：`npm run tauri build` 后需**关闭运行中的 release exe 再重建**（文件占用），重建后桌面快捷方式即新版

### 2.4 提交规范

- 消息格式：`类型: 简述` + 空行 + 要点列表
- 一次提交一个逻辑变更；涉及多文件的同主题改动一起提交
- 提交信息可写入 `.install/commit-msg.txt` 后用 `git commit -F` 避免引号问题

---

## 3. 环境事实（Agent 必须知道的硬约束）

### 3.1 路径与工具链

- 项目根：`<项目根目录>`；安装脚本/日志：``.install/``（gitignored，可自由存放测试文件）
- Node 22.17.1 / npm 10.9.2 / Rust 1.97.1（`%USERPROFILE%\.cargo`，PATH 需手动加 `$env:USERPROFILE\.cargo\bin`）
- MSVC Build Tools 已装（VS2022，cl.exe 就绪）；gh CLI：`%ProgramFiles%\GitHub CLI\gh.exe`（**不在 PATH**，用全路径）
- **Vite 端口 14210**（非 1420！1420 在 Windows 保留端口区间，绑定报 EACCES）

### 3.2 网络与代理（最大坑）

- 系统代理：`http_proxy/https_proxy → http://127.0.0.1:7890`（Clash）
- **gh / curl 经代理访问 GitHub API 会 TLS 超时**；直连（`curl --noproxy "*"`）正常
- 所有 gh 调用必须在脚本里**先清代理**再执行：

```powershell
$env:HTTP_PROXY=''; $env:HTTPS_PROXY=''; $env:ALL_PROXY=''
$env:http_proxy=''; $env:https_proxy=''; $env:all_proxy=''
& '%ProgramFiles%\GitHub CLI\gh.exe' <command>
```

- GitHub API 直连验证：`curl.exe --noproxy "*" -s https://api.github.com/...`

### 3.3 数据库（SQLite）规则

- 表：decks / cards / card_states / review_logs / settings / daily_stats（+ 元表 `_reciter_migrations` 仅 Web 端）
- **时间一律 ISO-8601 UTC**（`'YYYY-MM-DDTHH:MM:SS.sssZ'`，迁移 003 规范化；禁用 `datetime('now')` 空格格式）
- **已应用的迁移绝不可修改**（sqlx checksum 校验，改了会阻止后续迁移）——新增改动只能加新迁移文件
- 双后端：Tauri 用 `tauri-plugin-sql`；Web 用 `sql.js`（WASM）+ IndexedDB
- sql.js 差异：多语句 SQL 需 `db.exec()`（`run()` 只执行首条）；绑定参数 `undefined` 会报错（后端已归一化为 null）；wasm 静态在 `public/sql-wasm.wasm`
- 卡片导出/恢复字段：主键别名为 `card_id`（`SELECT c.id AS card_id`），恢复时读 `card_id`

### 3.4 代码书写陷阱

- 用 `tools.write`/node fs 写含反引号的 TS 代码时，模板字面量嵌套会炸——用字符串拼接或 `\``` 转义；内容里要写字面 `\n` 时用 `"\\n"`
- 正则里的 `${}` 在模板字面量中会被当插值——写 `\$` 或避免
- 所有时间比较/写入统一走 `src/lib/day.ts` 工具（日界 04:00 可配）

### 3.5 系统故障应对

- **0xC0000142（DLL 初始化失败，所有进程无法启动）**：系统级故障（多为待重启/杀软拦截）——**重启电脑**即可恢复，与项目代码无关
- PowerShell 5.1 执行无 BOM 的 UTF-8 脚本会因中文乱码报错——脚本用纯 ASCII 或加 BOM

---

## 4. 部署与发布

### 4.1 PWA（自动）

- 推送 main → `.github/workflows/deploy-pages.yml` 自动构建 `npm run build:web`（base=/Reciter/）→ 部署 Pages
- 验证：`curl --noproxy "*" -s -o NUL -w "%{http_code}" https://wirelesslaserray.github.io/Reciter/` 应 200
- 工作流状态：`https://api.github.com/repos/WirelessLaserRay/Reciter/actions/runs?per_page=1`

### 4.2 Windows 正式版

```bash
npm run tauri build
# 产物: src-tauri/target/release/bundle/{nsis/Reciter_0.1.0_x64-setup.exe, msi/*.msi}
```

- **必须先关闭运行中的 release exe 再重建**（否则 exe 被占用无法覆盖）
- 桌面/开始菜单快捷方式已指向 `src-tauri/target/release/reciter.exe`

### 4.3 GitHub Release

```bash
git tag -a v0.1.0 -m "..." && git push origin v0.1.0
# gh（清代理后）：
gh release create v0.1.0 --title "..." --notes-file notes.md "bundle/nsis/*.exe" "bundle/msi/*.msi"
```

- 发布说明写功能摘要 + 安装指引；版本号遵循 SemVer

---

## 5. 架构速查

```
src/
├── lib/          db / fsrs / day / review / settings / stats / backup / env / migrations /
│                 sql/{backend,tauri-backend,sqljs-backend} / ai-client / ai-parse / ai-prompts /
│                 ai-adapter / ai-strategy / study-mode / markdown-parser / importer /
│                 recall-match / study-prefs / utils
├── components/   ui(shadcn) / layout / quiz(QuizSession) / stats(HeatmapGrid) /
│                 ai(AIChatPanel, AISetupWizard) / study(StudyCard, MarkdownContext) / deck(MasteryOverview)
├── pages/        Dashboard 词库 词库详情 学习 导入 统计 设置 弱词本
├── stores/       useThemeStore / useDbStore / useDeckStore / useStudyStore
└── types/        与数据库 Schema 对齐
src-tauri/        Rust 壳：plugins(sql/http/dialog) + 命令(write/read_text_file) + migrations 001-005
```

- 学习队列 = due 卡片（受每日复习上限截取）+ 配额内新卡（`deck.new_cards_per_day - 今日已学`），可标签/重点过滤
- 统一学习流：`resolveStudyMode()`（new_teach/recall/quick_test/ai_drill/classic）→ `StudyCard` 分发；高级测试入口 `/study?quiz=<deckId>`
- 评分链路统一走 `applyReview()`（FSRS 调度 → card_states → review_logs → daily_stats）
- 重点词：Markdown 黑体（strong 首节点）→ `cards.is_key`；学习/测试可选"重点词"范围
- AI：OpenAI 兼容双通道（DeepSeek/Ollama/OpenAI），tauri-plugin-http（Tauri）/ window.fetch（Web，CORS 受限需代理）；AI 出题经 `ai-adapter.ts` 解析防泄漏

---

## 6. 测试清单（改动后必跑）

| 场景 | 命令 |
|---|---|
| 前端编译 | `npm run build` |
| PWA 构建 | `npm run build:web` |
| 解析器/适配器单测 | `npx tsx .install/parser-test.ts` 等（.install 内历史测试可复用/扩展） |
| sql.js 后端链路 | 注入 `new SqlJsBackend(() => initSqlJs())` 跑 CRUD/迁移/恢复 |
| 桌面运行 | `npm run tauri dev`（热更新） |

---

## 7. 已知历史教训（写代码前看一眼）

1. **迁移 checksum**：改已应用迁移 = 灾难，一律新增迁移文件
2. **时间格式**：空格格式 vs ISO 混用导致 due/配额判断错乱（迁移 003 解决，别回退）
3. **daily_stats upsert**：`ON CONFLICT DO UPDATE` 新行不累加，用 `excluded` 模式
4. **sql.js 多语句**：迁移/批量 SQL 用 `exec()` 不是 `run()`
5. **恢复字段**：`card_id` 别名，别读 `id`
6. **原子导入**：导入前快照、成功后 flush、失败回滚——避免残留半状态
7. **窗口内同路由 Link 无操作**：退出/返回用 `onExit` 回调清父组件状态
8. **disabled 按钮无 hover**：Tooltip 用 span 包裹
9. **刷新丢滚动**：编辑后刷新用 silent 模式，别切换 loading 占位
10. **gh/代理**：任何 gh 操作先清代理环境变量
