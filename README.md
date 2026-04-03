# MOSS-AI

基于 **ClawX / OpenClaw 生态** 的个人 AI 助手：代码与数据默认落在 **`~/.openclaw/workspace/moss-ai`**，与 OpenClaw 的 Gateway、`openclaw.json` 以及本机技能目录（如 `~/.openclaw/skills`）协同工作。**ClawX** 作为本项目中推荐的 **OpenClaw Gateway 与 `~/.openclaw` 配置的管理入口**；MOSS-AI 侧在默认策略下主要作为**调用方**（不写 `openclaw.json`、不代替 ClawX 做智能体注册），详见 `backend/server.js` 顶部注释与 `MOSS_OPENCLAW_WRITE_ENABLED` 说明。

应用层同时包含：Node 后端（HTTP + WebSocket）+ Electron 桌面端，以及多智能体、技能、定时任务、多平台桥接等能力。服务端分层借鉴 OpenHanako 实践，详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 与 ClawX / OpenClaw 的关系（必读）

| 角色 | 说明 |
|------|------|
| **ClawX** | 管理 OpenClaw Gateway、读写 `~/.openclaw/openclaw.json`、智能体创建/同步等（与本仓库协作时的「主控」） |
| **MOSS-AI** | 业务与 UI：API、桌面、协作流等；通过配置/CLI 调用 OpenClaw，而不是替代 ClawX 管理全局配置 |
| **工作区** | 默认 `~/.openclaw/workspace/moss-ai`（数据库、上传目录、演示场景等，见 `backend/server.js` 常量） |

桌面端会读取 `openclaw.json` 中的模型与 Gateway 信息；若 OpenClaw 未就绪或 `agentId` 未在 ClawX 中注册，相关能力会按代码内提示失败。部署到无 ClawX 的机器时，需自行提供等价的 OpenClaw Gateway 与配置，或仅使用不依赖 Gateway 的 API 子集。

## 技术栈

- **底座**：OpenClaw 工作区 + **ClawX**（推荐）管理 Gateway 与全局配置  
- **运行时**：Node.js（建议 LTS）
- **后端**：Express、WebSocket（`ws`）；新架构入口为 `server/index.js`（`core` / `hub`）
- **扩展后端**：`backend/server.js`（协作、SSO、与 OpenClaw CLI 交互等）
- **桌面**：Electron（`desktop/` 独立子包）
- **数据**：SQLite（`sqlite3`）等（以实际代码为准）
- **测试**：Vitest

## 项目结构

根目录同时存在 **v2 主服务**（`server/` + `core/` + `hub/`）与 **独立 backend 进程**（`backend/server.js`），历史上还叠了 DSclaw 部分模块，因此容易显得「乱」。**以谁为准**：日常开发与 `npm start` / `./start.sh` 以 **`server/index.js`** 为准；协作/OpenClaw 深度集成见 **`backend/`**。详细对照与收敛建议见 **[docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md)**。

```
moss-ai/
├── server/              # ★ v2 主入口：HTTP / WebSocket（npm start）
├── core/                # v2 Engine + 各 Manager；内含历史协作用 kebab 文件（见 core/README.md）
├── hub/                 # v2 后台 Hub；另有旧版 hub/index 链路，勿混用
├── lib/                 # 记忆 / 沙箱 / 桥接 / 人格 / Desk / Kasm / Bytebot …
├── desktop/             # Electron（main.cjs + 渲染进程逻辑）
├── backend/             # 独立 Express：协作 API、SSO、OpenClaw CLI（默认也占 3001，与 v2 二选一）
├── skills/              # 技能包（builtin / community）
├── agents/              # 运行时数据（.gitignore，见 agents/README.md）
├── config/              # Kasm、Bytebot 等示例配置
├── scripts/             # Python / Shell 辅助脚本
├── tests/               # Vitest
├── demo-scene/          # 演示（大文件已忽略）
├── docs/                # 集成说明 + PROJECT-LAYOUT（目录导览）
├── start.sh / stop.sh   # 启停 v2 后端 + 桌面
├── ARCHITECTURE.md      # 分层设计理念
└── README.md
```

`./start.sh` 会拉起 **`server/index.js`**（默认端口 **3001**），再启动 **`desktop/`**。**不要**与 `backend/server.js` 同时监听同一端口。

## 本地开发

### 环境要求

- 已安装并配置 **ClawX**（或你自行维护的 OpenClaw Gateway + `~/.openclaw` 目录结构）
- Node.js（LTS）
- macOS / Linux / Windows（桌面端以 Electron 支持为准）

### 安装依赖

```bash
cd moss-ai
npm install
cd desktop && npm install && cd ..
```

### 启动

```bash
./start.sh
```

- 后端：<http://localhost:3001>  
- 健康检查：<http://localhost:3001/health>（若路由与版本一致）

停止：

```bash
./stop.sh
```

### 仅后端（调试）

```bash
npm start
# 等价于 node server/index.js
```

### 测试

```bash
npm run test
npm run test:coverage
```

## 配置说明

- **OpenClaw / ClawX**：在 **ClawX** 中维护 `~/.openclaw/openclaw.json`（Gateway 地址、模型、token 等）。除非明确设置 `MOSS_OPENCLAW_WRITE_ENABLED=1`（不推荐），本仓库不应代替 ClawX 写入该文件。
- **后端 / SSO（可选）**：参考 `backend/.env.example`，复制为 `backend/.env` 并填写：
  - `MOSS_PUBLIC_BASE_URL`：生产环境公网回调基址
  - `MOSS_AUTH_JWT_SECRET`、`MOSS_AUTH_JWT_ISSUER`：登录态 JWT
  - 飞书 / 钉钉 / 企业微信等 OAuth 参数（按需）
- **其他集成**：`config/` 下提供 `*.example.json`，可按说明复制为实际配置。

**切勿**将 `.env`、数据库文件、含密钥的 `agents/` 配置提交到仓库。

## 部署方案

### 1. 服务器部署（仅 API / 无桌面）

适用：内网服务、配合其他前端或仅开放 API。

1. 在服务器克隆本仓库，安装依赖：`npm install --omit=dev`（若生产不需要 Vitest/electron-builder 等，可按需调整）。
2. 若功能依赖 **OpenClaw Gateway**（对话、部分智能体执行等），服务器需能访问 Gateway，并在该环境准备与开发机一致的 `~/.openclaw` 配置策略；仅跑 `server/index.js` 且不调用 OpenClaw 的路径可弱化此要求。
3. 配置环境变量或 `backend/.env`（公网 URL、JWT 密钥、SSO 等）。
4. 使用进程管理器常驻运行，例如 **systemd** 或 **PM2**：

**PM2 示例**

```bash
npm install -g pm2
cd /path/to/moss-ai
pm2 start server/index.js --name moss-ai
pm2 save
pm2 startup
```

5. 前面放置 **Nginx**（或 Caddy、Traefik）做 HTTPS 终止与反向代理，将 `/` 代理到 `http://127.0.0.1:3001`，并配置 WebSocket 升级（`Upgrade`、`Connection` 头）。

6. 防火墙仅开放 80/443，数据库与上传目录放在持久化磁盘并做好备份；若使用默认路径，请持久化 **`~/.openclaw/workspace/moss-ai`**（或你通过配置改写的等价目录）。

### 2. 桌面客户端分发（Electron）

- 根目录 `package.json` 中提供 `npm run build`（`electron-builder`）。**正式发布前**需在项目中补全 `electron-builder` 所需字段（如 `build.appId`、`files`、`directories`、图标与公证策略等），当前以源码运行为主。
- 典型流程：在 `desktop/` 完成 `npm install` 后，与根目录构建配置对齐，执行打包命令生成对应平台的安装包或绿色目录。

### 3. Docker（可选，需自行维护镜像）

仓库未内置官方 `Dockerfile` 时，可自行编写多阶段镜像：Node 基础镜像、`COPY` 源码、`npm ci`、`EXPOSE 3001`、`CMD ["node","server/index.js"]`。若使用 SQLite，请将数据文件挂载为卷；生产环境建议明确数据目录与备份策略。

## 常用 API（以当前实现为准）

- `GET /health` / `GET /api/health` — 健康检查  
- `GET /api/agents` — 智能体列表  
- `GET /api/skills` — 技能列表  

完整路由以 `server/index.js` 及 `core` 挂载为准。

## 许可证

MIT（见 `package.json` 中 `license` 字段）。

## 相关文档

- [docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md) — **目录导览**（v2 / backend / 旧模块对照）  
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 分层与模块说明  
- [COLLABORATION-TEST-GUIDE.md](./COLLABORATION-TEST-GUIDE.md) — 协作测试指引  
