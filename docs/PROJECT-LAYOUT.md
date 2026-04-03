# 项目目录说明（为何看起来「两套东西叠在一起」）

本仓库经历了 **DSclaw / 旧协作栈** 与 **MOSS v2（OpenHanako 风格分层）** 的叠加，因此根目录会同时出现「server 与 backend」「hub 里两套 router」等现象。下面按 **职责** 划分，便于导航与后续收敛。

## 一图总览

```
┌─────────────────────────────────────────────────────────────┐
│  desktop/          Electron 壳 + 前端逻辑（连 3001 + OpenClaw） │
├─────────────────────────────────────────────────────────────┤
│  server/index.js   ★ 默认入口：v2 HTTP/WebSocket + Engine + Hub │
│  core/ + hub/ + lib/     v2 运行时（与 server 配套）              │
├─────────────────────────────────────────────────────────────┤
│  backend/server.js 独立 Express：协作 API、SSO、OpenClaw CLI…    │
│  （与 server/index.js 同端口 3001 时二选一，勿同时起两个）        │
├─────────────────────────────────────────────────────────────┤
│  skills/           技能包（builtin / community）                  │
│  scripts/          Python/Shell 辅助（演示场景、自动化等）        │
│  demo-scene/       演示配置与输出（大文件见 .gitignore）          │
│  tests/            Vitest（偏 v2 core）                         │
│  config/           Kasm、Bytebot 等集成示例配置                  │
└─────────────────────────────────────────────────────────────┘
```

## 启动方式对照

| 命令 / 文档 | 起的是谁 | 说明 |
|-------------|----------|------|
| `npm start` / `./start.sh` 里的 `server/index.js` | **v2 MossServer** | 当前主路径：`core` + `hub` |
| `cd backend && node server.js` | **backend 单体服务** | 协作测试、OpenClaw 深度集成等（见 `COLLABORATION-TEST-GUIDE.md`） |
| `npm run start:desktop`（根目录） | Electron | 依赖本机已有后端在 3001（或其它配置） |

**注意**：`backend/server.js` 与 `server/index.js` 默认都倾向使用 **3001**，同一台机器上不要同时启动两个，除非改端口。

## `core/`：新门面与旧模块并存

- **推荐当作「v2 真相」的链**：`server/index.js` → `core/engine.js` → `AgentManager.js`、`SessionManager.js` 等 **PascalCase 管理器**。
- **协作 / 多智能体矩阵等**仍被 `backend/collaboration-api.js` 等通过 **kebab-case** 文件引用，例如：`ability-matrix.js`、`task-collaborator.js`、`agent-manager.js`（与 v2 的 `AgentManager.js` **不是同一份实现**）。
- `core/index.js`：偏 **旧 DSclaw 聚合导出**，新代码请优先走 `engine` + 各 Manager，而不是依赖该文件的组合。

长期目标：合并重复 Manager、统一命名风格（见下文「建议的收敛顺序」）。

## `hub/`：新 Hub 与旧 index

- **v2**：`Hub.js` + `Scheduler.js` + `EventBus.js` + `ChannelRouter.js` + `heartbeat.js`（由 `server` 挂载的 `Hub` 使用）。
- **旧**：`hub/index.js` + `channel-router.js`、`cron-scheduler.js` 等（另一套路由/调度，勿与 v2 混为一谈）。

## `lib/`

跨模块复用的库：记忆、沙箱、桥接、人格、Desk、Kasm、Bytebot 等；被 `core`、`hub`、`backend` 多方 `require`。

## 与 OpenClaw / ClawX

运行时数据默认在 **`~/.openclaw/workspace/moss-ai`**（见 `backend/server.js` 常量）；全局 Gateway 与 `openclaw.json` 由 **ClawX** 管理。详见根目录 `README.md`。

## 建议的收敛顺序（想继续瘦身时）

1. 文档与入口统一：所有「主服务」文档指向 `server/index.js`，backend 标明「可选第二进程」。  
2. 端口与环境变量：为 backend 或 v2 server 之一增加显式 `PORT`，避免误开双实例。  
3. `core/`：逐步让协作栈迁到 v2 `Engine` API，再删除或降级 `agent-manager.js` 等重复实现。  
4. `hub/`：确认无引用后归档或删除旧 `hub/index.js` 链路。

---

若你改动了目录层级，请同步更新本文件与 `README.md` 中的结构树。
