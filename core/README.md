# `core/` 说明

## 当前状态（重要）

这里同时存在 **v2 主路径** 与 **历史 DSclaw / 协作栈** 代码，因此会看到 **PascalCase** 与 **kebab-case** 两套文件。

### v2（与 `server/index.js` 配套）

- **`engine.js`**：`Engine` 门面，组装 `AgentManager.js`、`SessionManager.js`、`ModelManager.js`、`PreferencesManager.js`、`SkillManager.js`、`ChannelManager.js`、`BridgeSessionManager.js`。
- 新功能优先接在这一条链路上。

### 协作 / 多智能体矩阵（多为 `backend/` 引用）

- **`agent-manager.js`**、**`multi-agent.js`**、**`ability-matrix.js`**、**`message-router.js`**、**`task-collaborator.js`**、**`smart-delegator.js`** 等：被 `backend/collaboration-api.js` 等使用。
- 与 v2 的 **`AgentManager.js` 不是同一个类**（工作区路径与职责也不同），迁移前请对照调用方。

### 旧聚合入口

- **`index.js`**：导出旧版 `AgentManager` / `Engine` 等组合；**新代码请勿依赖**，以免和 v2 混淆。

更完整的目录关系见 **[docs/PROJECT-LAYOUT.md](../docs/PROJECT-LAYOUT.md)**。
