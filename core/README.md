# `core/` 说明（ClawX 主路线下的角色）

## 默认怎么用

日常 **`npm start`** 拉起的是 **`backend/server.js`**。它会 `require` **协作栈**里的 kebab-case 模块（如 `ability-matrix.js`、`collaboration-api` 等）。这些与 **ClawX / OpenClaw** 驱动的桌面、聊天、协作流直接相关。

## 两条代码链

### 1. 协作 / backend（主路线）

- **`agent-manager.js`**、**`multi-agent.js`**、**`ability-matrix.js`**、**`message-router.js`**、**`task-collaborator.js`**、**`smart-delegator.js`** 等。  
- 面向 **`backend/server.js`** 与 **`backend/collaboration-api.js`**。

### 2. v2 Engine（可选，`npm run start:engine`）

- **`engine.js`** + **`AgentManager.js`**、**`SessionManager.js`** 等 PascalCase 管理器。  
- 仅在被 **`server/index.js`** 拉起时使用；API 为子集，**不替代** backend。

### 旧聚合入口

- **`index.js`**：历史 DSclaw 导出；新功能请挂 backend 或 v2 其中一条明确链路，勿混用。

详见 **[docs/PROJECT-LAYOUT.md](../docs/PROJECT-LAYOUT.md)**。
