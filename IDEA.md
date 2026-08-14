# Reciter: 本地客制化英语学习与记忆客户端

## 1. 项目概述 (Project Overview)
**目标**：对标主流开源英语/语言学习项目（如 Anki, MaiMemo），制作一款高度支持本地客制化的英语单词/短语背诵客户端。
**核心价值**：支持 Markdown 等格式自由导入，基于科学记忆曲线（如 Ebbinghaus / SM-2算法）进行任务编排，同时结合 AI 大模型与传统算法进行智能化的复习与测试。

## 2. 核心功能需求 (Core Features)
*   **灵活的数据导入 (Flexible Import)**
    *   支持 Markdown 列表、CSV、JSON 等格式批量导入单词/词组。
    *   支持解析 Markdown 中的高亮、例句、注释等作为卡片正反面内容。
*   **科学记忆系统 (Spaced Repetition System - SRS)**
    *   内置 SM-2 或 FSRS (Free Spaced Repetition Scheduler) 算法，根据用户的掌握反馈自动调整复习间隔。
*   **智能化复习与测试 (Intelligent Testing & Review)**
    *   **传统测试**：拼写、选择题、填空题等形式。
    *   **AI 驱动测试**：根据给定的单词，让 AI 生成特定的语境或句子，让用户判断意思或进行翻译，甚至进行口语对话/拼写纠错。
*   **数据本地化与客制化 (Local-first & Customization)**
    *   所有学习进度与词库优先保存在本地（如 SQLite/JSON），保护隐私。
    *   UI 及背诵模式高度可配置（如每天背单词数量、复习限制等）。

## 3. 技术栈推荐 (Tech Stack Recommendation)
*   **前端/客户端框架**：
    *   推荐：**Tauri + React/Vue** 或 **Electron + React/Vue**。Tauri 更轻量级，性能更好，适合纯本地客户端。
    *   或者纯 Web (PWA)：Next.js / Vite + React，结合 IndexedDB 进行本地存储。
*   **样式/UI组件库**：
    *   Tailwind CSS + Shadcn UI (提供现代化、简洁的客制化界面)。
*   **本地数据库**：
    *   SQLite (如果用 Tauri/Electron) 或 IndexedDB/Dexie.js (如果是纯浏览器端)。
*   **AI 接入**：
    *   本地大模型接入 (Ollama API) 或 云端大模型 (OpenAI API / Gemini API / DeepSeek API 等)。

## 4. 数据库核心模型 (Database Schema Draft)
*   **Deck (词库表)**: `id`, `name`, `description`, `created_at`
*   **Card (卡片表)**: `id`, `deck_id`, `front` (单词/短语), `back` (释义/例句), `markdown_content`
*   **ReviewLog (复习记录表)**: `id`, `card_id`, `grade` (评分), `review_time`
*   **SRS_State (记忆状态表)**: `card_id`, `stability`, `difficulty`, `reps`, `lapses`, `due_date` (基于 FSRS/SM2)

## 5. Agent 开发指南 (Agent Development Guide)
> 致 Agent：请按照以下阶段（Phases）逐步进行项目的开发与构建，在执行每个阶段前，请充分分析需求并向用户确认技术选型和具体细节。

### Phase 1: 项目初始化与脚手架搭建 (Initialization)
1.  **确定技术栈**：与用户确认使用 Tauri, Electron 还是纯 Web 框架 (Vite/Next.js)，以及偏好的前端框架 (React/Vue)。
2.  **初始化项目**：运行对应的脚手架命令 (如 `npm create tauri-app@latest`)，配置 Tailwind CSS。
3.  **路由与基础 UI 骨架**：建立主页（Dashboard）、词库列表页、学习界面和导入设置页。

### Phase 2: 本地数据库与数据导入 (Database & Import)
1.  **设置数据库**：集成 SQLite 或 IndexedDB。实现 Deck 和 Card 的基础 CRUD 接口。
2.  **实现 Markdown 导入解析**：编写工具函数，解析特定的 Markdown 格式（例如无序列表 `- word: meaning`，或根据特定标题划分为不同 Deck）。
3.  **UI 接入**：提供导入文件的拖拽/选择区域，展示导入预览并保存至本地数据库。

### Phase 3: 科学记忆算法集成 (SRS Implementation)
1.  **引入算法**：实现或引入现成的间隔重复算法（强烈推荐采用业界先进的 **FSRS** 算法）。
2.  **打通学习流程**：
    *   获取今天需要复习（`due_date` <= 今日）的卡片，以及设定配额内的新卡片。
    *   在学习界面展示卡片，提供“忘记(1)”、“困难(2)”、“良好(3)”、“简单(4)”四个标准反馈按钮。
    *   根据用户反馈，调用 SRS 算法核心逻辑，更新卡片的下一次复习时间 (`due_date`)、记忆稳定性等参数，并持久化到数据库。

### Phase 4: 智能化复习与 AI 集成 (AI & Smart Review)
1.  **配置 AI 接口**：增加设置页面，允许用户输入 API Key (如 OpenAI, Gemini) 或配置本地大模型地址 (Ollama)。
2.  **设计 AI 语境测试流程**：
    *   Agent 需要构建良好的 Prompt，例如：“用给定的英语单词 '{word}' 生成一个适合 B2 难度学习者的完形填空/场景对话，并提供解析。”
    *   在复习模式中增加“AI 深度复习”选项，动态调用 API 生成题目供用户交互。

### Phase 5: 界面打磨与数据统计 (Polish & Export)
1.  **图表统计**：实现用户的背词曲线、未来 7 天预期复习量（热力图或柱状图）。
2.  **数据导出/备份**：支持将现有的卡片进度和数据导出为 JSON 或 CSV，以便备份或迁移。
3.  **UI 动效优化**：增加卡片翻转的物理过渡动画，完善暗黑/明亮主题切换的支持。
