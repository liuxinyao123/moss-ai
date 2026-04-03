# 项目目录说明（ClawX / OpenClaw 主路线）

本仓库的**默认运行方式**以 **ClawX 管理的 OpenClaw** 为中心：`backend/server.js` 提供桌面端所需的完整 REST/WebSocket，并调用/读取 `~/.openclaw`；`server/index.js`（v2 Engine + Hub）为**可选实验/引擎进程**，与主 API **不要同时占用 3001**。

## 一图总览

```
┌─────────────────────────────────────────────────────────────┐
│  ClawX（本机）     管理 Gateway、openclaw.json、智能体注册      │
├─────────────────────────────────────────────────────────────┤
│  desktop/          Electron UI → http://127.0.0.1:3001/api/*   │
├─────────────────────────────────────────────────────────────┤
│  backend/server.js ★ 默认 API：协作、聊天、OpenClaw、SSO、Desk…  │
│  core/（kebab）    协作矩阵等，被 backend/collaboration-api 引用 │
├─────────────────────────────────────────────────────────────┤
│  server/index.js   可选：v2 MossServer（Engine + Hub，子集 API） │
│  core/（Pascal）   v2 管理器；hub/ 与 server 配套               │
├─────────────────────────────────────────────────────────────┤
│  lib/              记忆、沙箱、桥接、人格、Kasm、Bytebot …      │
│  skills/           技能包 · scripts/ · demo-scene/ · tests/    │
└─────────────────────────────────────────────────────────────┘
```

## 启动方式对照

| 命令 | 进程 | 说明 |
|------|------|------|
| **`npm start`** / **`./start.sh`** | `backend/server.js` | **主路线**，与 ClawX + 桌面端一致 |
| **`npm run start:engine`** | `server/index.js` | v2 引擎 + Hub；API 为子集，**勿与上者同端口同开** |
| **`./start.sh`**（后半段） | `desktop/` npm start | 依赖 3001 上已是 `backend/server.js` |
| `cd backend && node server.js` | 同主路线 | 等价于根目录 `npm start`（需在仓库根装好依赖） |

## `core/`：两条链并存

- **主 API（backend）**：协作、多智能体矩阵 → `ability-matrix.js`、`task-collaborator.js`、`agent-manager.js` 等。
- **可选引擎（server/index.js）**：`engine.js` + `AgentManager.js` 等 PascalCase 管理器。

二者**未完全合并**；新功能若面向 **ClawX 用户与桌面**，应接在 **`backend/server.js`** 或其所 `require` 的模块上。

## `hub/`

- **v2**：`Hub.js` + `heartbeat.js` 等 — 仅在被 **`npm run start:engine`** 拉起时参与运行。
- **旧** `hub/index.js`：与当前主路线无强绑定；避免与新 Hub 混读。

## 数据与配置

- 运行时数据：**`~/.openclaw/workspace/moss-ai`**（由 `backend/server.js` 创建与使用）。
- 全局：**`~/.openclaw/openclaw.json`** — 仅建议由 **ClawX** 修改（见 `MOSS_OPENCLAW_WRITE_ENABLED`）。

## 后续收敛（可选）

1. 将 v2 Engine 中有价值的能力逐步挂到 `backend` 或共享模块，减少双进程需求。  
2. 为 `start:engine` 单独约定端口（环境变量），彻底避免误开双实例。  
3. 合并重复 Manager，统一命名。

---

修改目录或入口后，请同步更新本文件与根目录 `README.md`。
