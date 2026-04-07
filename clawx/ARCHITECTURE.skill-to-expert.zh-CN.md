# ClawX「技能转专家」架构与实现说明（含旧方案对照）

本文档用于沉淀「技能转专家（Skill → Expert）」在 **ClawX 新 UI/架构（`ClawX/`）**中的实现方式，并对照说明你之前在 **moss-ai（旧 Electron UI + server/index.js/ backend/server.js）**中的实现/方案，方便后续扩展、迁移与排错。

---

## 目标与定义

### 目标
- 在 ClawX 的**技能列表**中给每个技能提供「转专家」动作。
- 点击后得到一个**“技能专家智能体”**：拥有与该技能强相关的专家人设（persona），并可在专家中心中“看得见”。

### 你选定的方案（历史决策：Option A）
- **Option A = 只做人设/系统提示注入**：点击「转专家」后将 *persona 文本* 写入该智能体的身份文件（如 `IDENTITY.md`），从而改变模型的 system prompt/行为风格。
- 不强制执行工具、也不要求技能 JS 自动运行（避免“点了就跑工具”带来的不可控副作用）。

---

## ClawX 新架构总览（实际生效的架构）

ClawX 的运行态由三层组成（从 UI 到执行）：

1) **Renderer（前端 UI）**：`ClawX/src/*`
- React + Zustand 状态管理
- 通过 `hostApiFetch()` 调用主进程 Host API（默认走 IPC 代理，避免 CORS / 本地 token 泄露）

2) **Electron Main（主进程）**：`ClawX/electron/*`
- 启动 Host API Server（默认 `127.0.0.1:3210`）
- 负责读写本地文件（如 agents 的 `IDENTITY.md`）、管理 Gateway 生命周期、调 OS 能力

3) **Gateway（OpenClaw）**
- 运行 skills / channels / runtime
- ClawX 在主进程里通过 `GatewayManager` 控制其启动/重启/热加载

### Host API 的关键点
- `ClawX/electron/api/server.ts` 在启动时生成 **session token**，所有 Host API 请求必须 Bearer 鉴权。
- 前端 `ClawX/src/lib/host-api.ts` 的 `hostApiFetch()` 默认用 IPC 通道 `hostapi:fetch` 代理请求，因此前端无需显式携带 token。

---

## 现有（原生）“专家”实现（对照基线）

ClawX 已有一个“专家中心”模块（汽车行业示例），其注入方式是：

- 前端：`ClawX/src/pages/Experts/index.tsx`
  - 拉取模板：`GET /api/experts/automotive`
  - 点击创建：`POST /api/experts/automotive/create`
- 后端：`ClawX/electron/api/routes/experts.ts`
  - `createAgent()` 新建智能体
  - 将模板 prompt 写入该智能体 `IDENTITY.md` 的 `## 专家人设` 段落

这套实现证明：**“写入 IDENTITY.md 的特定段落”**就是 ClawX 里“注入人设”的权威方式。

---

## 技能转专家（ClawX 实现）

### 一句话数据流

在 `Skills` 页面点「转专家」→ **先创建一个新 agent**（名字 `技能专家：<技能名>`）→ 调用 Host API 把 `## 技能专家人设` 写入新 agent 的 `IDENTITY.md` → 触发 Gateway reload → 在 “专家中心”里能看到该技能专家条目。

### 关键文件与接口

#### 1) 前端按钮与调用链
- 文件：`ClawX/src/pages/Skills/index.tsx`
- 行为：
  1. 调 `POST /api/agents` 创建新智能体（`inheritWorkspace: true`）
  2. 拿到 `createdAgentId`
  3. 调 `POST /api/skills/skill-to-expert`，把 skill 信息与 `agentId` 传给主进程做注入

> 说明：之前曾做过“注入到当前会话 agent（兜底 main）”的版本；后来根据你的反馈，改为**必定新建专家智能体**，避免污染 Main Agent。

#### 2) 注入逻辑（Host API）
- 文件：`ClawX/electron/api/routes/skills.ts`
- 新增接口：`POST /api/skills/skill-to-expert`
- 行为：
  - 基于 skill payload 生成 markdown persona
  - 写入目标智能体 `IDENTITY.md` 的 `## 技能专家人设` 段落（upsert/覆盖）
  - best-effort 触发 `GatewayManager.debouncedReload()` 让运行态生效

#### 3) 创建智能体返回 createdAgentId（Host API）
- 文件：`ClawX/electron/api/routes/agents.ts`
- 变更：`POST /api/agents` 在响应中增加：
  - `createdAgentId`
  - `createdAgentName`

#### 4) 专家中心可见性：技能专家列表
- 文件：`ClawX/electron/api/routes/experts.ts`
- 新增接口：`GET /api/experts/skill-experts`
  - 扫描所有 agents 的 `IDENTITY.md`
  - 找到包含 `## 技能专家人设` 的 agents 并返回列表
- 前端展示：`ClawX/src/pages/Experts/index.tsx`
  - 页面顶部新增「技能专家」区块渲染该列表

---

## 人设落盘规则（约定）

### 段落标记
- 专家模板注入：`## 专家人设`
- 技能专家注入：`## 技能专家人设`

### 为什么用“段落标记 + upsert”
- 可重复执行：重复点击不会无限追加噪音
- 可被扫描：专家中心能用 marker 快速定位
- 可回滚：删除该段落即可撤销“技能专家”身份

---

## “为什么你看到 Main Agent（main）”的根因（已修复）

### 根因
初版实现是“把人设注入到当前聊天智能体”，当 UI 无法确定 currentAgent 时会兜底到 `main`，导致你感觉“怎么没新建专家、反而污染主智能体”。

### 修复策略（现版本）
- 「转专家」**始终新建**：`技能专家：<技能名>`
- 注入目标始终为新 agent 的 `createdAgentId`
- 不再默认写入 `main`

---

## 旧实现（moss-ai）对照说明（历史方案/代码路径）

> 这部分用于你回溯“之前实现过的方案”，以及理解为什么它在 ClawX 新架构下不生效。

### 旧项目结构（你之前的实现上下文）
- UI：`moss-ai/desktop/*`（Electron，非 ClawX React UI）
- 后端：
  - 旧：`moss-ai/backend/server.js`
  - 新（moss-ai 自己的“新”）：`moss-ai/server/index.js`

### 旧方案的核心动作（与你选定的 Option A 一致）
1) 生成 persona：`buildSkillExpertPersona(skill)`
2) 更新智能体配置/身份：
   - 写 `config.json`（更新 `persona` 字段用于 UI 展示）
   - 写 `identity.md`（替换/插入 `## 人设` 段落）
3) 提供路由：`POST /api/agents/:agentId/skill-to-expert`
4) UI 增加「转专家」按钮并调用该路由

### 旧方案踩过的坑（为什么经常“看起来不生效”）
- **实际启动的是哪套 server** 容易混淆（`backend/server.js` vs `server/index.js`）
- 端口冲突（`EADDRINUSE`）导致重启失败，但日志/现象又像“已经重启”
- sandbox/权限导致无法稳定 kill 占端口进程

> 结论：旧方案逻辑本身可用，但它属于 moss-ai 的体系；要在 ClawX 生效必须迁移到 `ClawX/electron/api/*` + `ClawX/src/*` 的通路。

---

## 后续可扩展方向（建议）

- **在技能专家卡片上增加“进入聊天/切换到该 agent”按钮**  
  目前专家中心只是展示列表；下一步可以把“打开/切换会话”串起来。
- **从 skill 读取更强的专家材料**  
  现在 persona 由 UI 传来的 skill 元信息生成；未来可在主进程读取 skill 的 `SKILL.md`/README 或 schema（安全地抽取摘要）做更精准的人设。
- **增加“撤销专家/恢复默认”**  
  提供 `DELETE /api/skills/skill-to-expert` 或 “清空 `## 技能专家人设` 段落”按钮。

---

## 快速排错清单

- 看到 `useAgentsStore is not defined`：前端缺 import（已修复过一次，提醒以后改动注意）。
- 发现 Host API 新路由 404：通常是**主进程未重启**（renderer 热更新不等于 main 热更新）。
- 本地访问 `127.0.0.1:5173` 失败但 `[::1]:5173` 可以：IPv4/IPv6 或代理变量影响。
- Electron 主进程异常（例如 updater/app 对象异常）：检查 `ELECTRON_RUN_AS_NODE` 是否被错误设置为 1。

