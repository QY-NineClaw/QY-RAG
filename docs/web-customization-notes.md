# 界面二开变动说明

> 本文中以 `src/` 开头的路径均相对于仓库的 `web/` 目录。后续官方版本升级流程见 [RAGFlow Web 二开版本升级手册](./web-upgrade-guide.md)。

## 背景

本次改造基于 RAGFlow 前端，目标是将其改造为可 iframe 嵌入的沉浸式模块化界面，供第三方系统集成使用。

## v0.26.1 升级记录

- 以官方 `v0.26.0` 为三方合并基线，引入 `v0.26.1` 的 Web 功能和依赖更新。
- 新增聊天渠道管理：路由为 `/user-setting/chat-channel`，入口位于 Dashboard 设置导航。
- 聊天渠道页面使用现有的 `UserSettingPageWrapper`、面包屑、圆角内容卡片和 QY 按钮体系，保持 iframe 独立入口风格。
- 补齐数据集配置的中文资源，包括目录增强、索引模型、表格列用途、解析器名称、MinerU 语言等，避免界面直接显示 `knowledgeConfiguration.*` key。
- 引入模型类型编辑、聊天设置重组、文档预览升级、Agent DSL 导入导出与相关修复。
- 保留自定义路由加载动画、扁平化用户设置路由、模块内面包屑及 Dataflow 全屏模态框。
- Docker 基础镜像、前端依赖、入口脚本和数据库 migration 版本同步到 `v0.26.1`。

---

## 一、布局改造

### 1. 根路由 `/` 改为 Dashboard

**文件**：`src/pages/home/index.tsx`、`src/layouts/root-layout.tsx`、`src/routes.tsx`

- 原 `/` 展示 home 页（banner + 数据集列表 + 应用列表）
- 现 `/` 改为 Dashboard 页：顶部导航栏（Header + GlobalNavbar）居中展示，下方展示 user-setting 的左侧导航（profile/model/team 等入口）
- `RootLayout` 去掉顶部 Header，各子模块变为全屏沉浸式展示
- `/` 路由从 RootLayout 独立出来，直接渲染 home 页

### 2. user-setting 去掉左侧 Sidebar 布局

**文件**：`src/routes.tsx`

- 原 `/user-setting/*` 子路由包裹在带左侧 sidebar 的 UserSetting layout 中
- 现各子路由直接渲染内容页（无 sidebar 包裹），sidebar 已整合到 Dashboard 页

### 3. `/chat/:id` 去掉顶部导航

**文件**：`src/pages/next-chats/chat/index.tsx`

- 原用 `RootLayoutContainer` 包裹（含顶部导航）
- 现改为普通 div，沉浸式展示

---

## 二、跨模块跳转处理

> 原则：用户在某一模块内操作时，不应被跳转到其他模块。

### 1. 空模型警告（`use-warn-empty-model`）

**文件**：`src/hooks/use-warn-empty-model.tsx`

- 原：弹窗确认后跳转到 `/user-setting/model`
- 现：仅展示警告弹窗，移除跳转

### 2. Dataset 配置页 - 关联 Data Pipeline（`link-data-pipline-modal`）

**文件**：`src/pages/dataset/dataset-setting/components/link-data-pipline-modal.tsx`

- 原：DataFlowSelect 组件有"从头创建"链接，点击跳转到 `/agents`
- 现：移除该跳转入口

### 3. DataFlowSelect 组件

**文件**：`src/components/data-pipeline-select/index.tsx`

- 原：有 `showToDataPipeline` prop，可展示跳转到 agents 的链接
- 现：移除该 prop 和相关 UI

### 4. Dataset 配置页 - 关联数据源（`link-data-source`）

**文件**：`src/pages/dataset/dataset-setting/components/link-data-source.tsx`

- 原：数据源条目有 Settings 按钮，点击跳转到 `/user-setting/data-source/...`
- 现：移除 Settings 按钮

### 5. 数据源日志表（`log-table`）

**文件**：`src/pages/user-setting/data-source/data-source-detail-page/log-table.tsx`

- 原：点击 dataset 名称跳转到对应 dataset 页
- 现：改为纯文字展示，不可点击

### 6. Dataflow 结果页返回按钮

**文件**：`src/pages/dataflow-result/index.tsx`

- 原：硬编码跳转到来源 dataset/agent 页
- 现：改为 `history.back()`（后续进一步改为模态框，见第三部分）

### 7. Skills 页面面包屑（`skills`）

**文件**：`src/pages/skills/index.tsx`

- 原：breadcrumb 中 "root" 点击跳转到 `/files`
- 现：改为纯文字，不跳转

---

## 三、iframe 嵌入适配

> 客户将各模块页面通过 iframe 嵌入自己的系统，各模块为独立入口，不依赖浏览器前进/后退。

### 1. 面包屑导航（各模块子页面）

各子页面顶部新增面包屑，支持在模块内回退，无需浏览器后退键。

| 模块 | 面包屑示例 | 实现方式 |
|------|-----------|---------|
| `/dataset/*` | 数据集 > {名称} | layout 层统一添加（`src/pages/dataset/index.tsx`） |
| `/memory/*` | 记忆 > {名称} | layout 层统一添加（`src/pages/memory/index.tsx`） |
| `/chunk/*` | 数据集 > 文件 > 解析结果 | `src/pages/chunk/index.tsx`（修正原有写死内容） |
| `/chat/:id` | 对话 > {名称} | `src/pages/next-chats/chat/index.tsx` |
| `/search/:id` | 搜索 > {名称} | `src/pages/next-search/index.tsx` |
| `/agent/:id` | Agent > {名称} | 原已有，保留 |
| `/agent/:id/explore` | Agent > {名称} > 探索 | `src/pages/agent/explore/index.tsx`（修正，加第三级） |
| `/agent-log-page/:id` | Agent > {名称} > 日志 | 原已有，保留 |
| `/user-setting/*` | 设置 > {子页面} | 通用组件 `UserSettingBreadcrumb`，各子页顶部引用 |

**新增文件**：`src/pages/user-setting/components/user-setting-breadcrumb.tsx`

### 2. Dataflow 结果页改为全屏模态框

**文件**：
- `src/pages/dataflow-result/params-context.ts`（新增）
- `src/pages/dataflow-result/modal.tsx`（新增）
- `src/pages/dataflow-result/hooks.ts`（修改 `useGetPipelineResultSearchParams`，优先读 context）
- `src/pages/dataset/dataset-overview/overview-table.tsx`（调用方改为模态框）
- `src/pages/agent/pipeline-log-sheet/index.tsx`（调用方改为模态框）

原 dataflow-result 是独立页面，点击后跳转离开当前模块。现改为全屏 Dialog 模态框弹出，右上角关闭，无跳转。路由 `/dataflow-result` 仍保留用于直接访问/调试。

### 3. 文档预览改为新页签

**文件**：`src/components/new-document-link.tsx`

`/document/:id` 链接已有 `target="_blank"`，天然在新页签打开，无需改动。

---

## 四、文件改动清单

### 修改文件
| 文件 | 改动说明 |
|------|---------|
| `src/layouts/root-layout.tsx` | 去掉 Header，只保留 Outlet |
| `src/routes.tsx` | `/` 独立路由；user-setting 子路由平铺（去掉 layout 包裹） |
| `src/pages/home/index.tsx` | 改为 Dashboard 页（Header + SideBar 居中） |
| `src/pages/next-chats/chat/index.tsx` | 去掉 RootLayoutContainer；加面包屑 |
| `src/pages/dataset/index.tsx` | layout 层加面包屑 |
| `src/pages/memory/index.tsx` | layout 层加面包屑 |
| `src/pages/chunk/index.tsx` | 修正面包屑内容 |
| `src/pages/next-search/index.tsx` | 加面包屑 |
| `src/pages/agent/explore/index.tsx` | 修正面包屑（加三级结构） |
| `src/pages/agent/pipeline-log-sheet/index.tsx` | 查看结果改为模态框 |
| `src/pages/dataset/dataset-overview/overview-table.tsx` | 查看 dataflow 结果改为模态框 |
| `src/pages/dataflow-result/index.tsx` | 移除返回按钮的硬编码跳转 |
| `src/pages/dataflow-result/hooks.ts` | `useGetPipelineResultSearchParams` 优先读 context |
| `src/hooks/use-warn-empty-model.tsx` | 移除跳转，仅警告 |
| `src/components/data-pipeline-select/index.tsx` | 移除跳转到 agents 的入口 |
| `src/pages/dataset/dataset-setting/components/link-data-pipline-modal.tsx` | 移除跳转 |
| `src/pages/dataset/dataset-setting/components/link-data-source.tsx` | 移除跳转到数据源详情 |
| `src/pages/user-setting/data-source/data-source-detail-page/log-table.tsx` | dataset 名称改为纯展示 |
| `src/pages/user-setting/setting-model/index.tsx` | 加面包屑 |
| `src/pages/user-setting/profile/index.tsx` | 加面包屑 |
| `src/pages/user-setting/setting-team/index.tsx` | 加面包屑 |
| `src/pages/user-setting/mcp/index.tsx` | 加面包屑 |
| `src/pages/user-setting/data-source/index.tsx` | 加面包屑 |
| `src/pages/user-setting/setting-api/index.tsx` | 加面包屑 |
| `src/pages/skills/index.tsx` | 移除跨模块跳转 |

### 新增文件
| 文件 | 说明 |
|------|------|
| `src/pages/user-setting/components/user-setting-breadcrumb.tsx` | user-setting 通用面包屑组件 |
| `src/pages/dataflow-result/params-context.ts` | Dataflow 结果参数 Context |
| `src/pages/dataflow-result/modal.tsx` | Dataflow 结果全屏模态框组件 |
