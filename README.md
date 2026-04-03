# MOSS-AI

基于 **ClawX / OpenClaw 生态** 的个人 AI 助手：代码与数据默认落在 **`~/.openclaw/workspace/moss-ai`**，与 OpenClaw 的 Gateway、`openclaw.json` 以及本机技能目录（如 `~/.openclaw/skills`）协同工作。**ClawX** 作为本项目中推荐的 **OpenClaw Gateway 与 `~/.openclaw` 配置的管理入口**；MOSS-AI 侧在默认策略下主要作为**调用方**（不写 `openclaw.json`、不代替 ClawX 做智能体注册），详见 `backend/server.js` 顶部注释与 `MOSS_OPENCLAW_WRITE_ENABLED` 说明。

应用层包含：**以 ClawX 为主路线** 的 Node API（`backend/server.js`）+ Electron 桌面端，以及多智能体、协作、OpenClaw 对话、SSO、技能与演示场景等。另有可选的 v2 引擎进程（`server/index.js` + `core`/`hub`）用于实验与单元测试覆盖，分层借鉴 OpenHanako 实践，详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 与 ClawX / OpenClaw 的关系（必读）

| 角色 | 说明 |
|------|------|
| **ClawX** | 管理 OpenClaw Gateway、读写 `~/.openclaw/openclaw.json`、智能体创建/同步等（与本仓库协作时的「主控」） |
| **MOSS-AI** | 业务与 UI：API、桌面、协作流等；通过配置/CLI 调用 OpenClaw，而不是替代 ClawX 管理全局配置 |
| **工作区** | 默认 `~/.openclaw/workspace/moss-ai`（数据库、上传目录、演示场景等，见 `backend/server.js` 常量） |

桌面端会读取 `openclaw.json` 中的模型与 Gateway 信息；若 OpenClaw 未就绪或 `agentId` 未在 ClawX 中注册，相关能力会按代码内提示失败。部署到无 ClawX 的机器时，需自行提供等价的 OpenClaw Gateway 与配置，或仅使用不依赖 Gateway 的 API 子集。

## 技术栈

- **底座**：OpenClaw 工作区 + **ClawX**（推荐）管理 Gateway 与 `openclaw.json`  
- **运行时**：Node.js（建议 LTS）
- **主 API（ClawX 路线）**：Express + `backend/server.js`（`npm start` / `./start.sh`）— 协作、聊天、OpenClaw、SSO、Desk、演示场景等，与桌面端一致  
- **可选 v2 引擎**：`server/index.js`（`npm run start:engine`）+ `core` / `hub` — 子集 HTTP API，**勿与主 API 同端口同时运行**  
- **桌面**：Electron（`desktop/` 子包；根目录 `package.json` 的 `main` 指向 `desktop/main.cjs` 供 `electron .`）  
- **数据**：SQLite 等（默认库在 `~/.openclaw/workspace/moss-ai`）  
- **测试**：Vitest（偏 v2 `core` / `lib`）

## 项目结构

**默认以 ClawX 路线为准**：`npm start` 与 `./start.sh` 启动 **`backend/server.js`**。`server/index.js` 为可选引擎进程。目录对照与收敛建议见 **[docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md)**。

```
moss-ai/
├── backend/             # ★ ClawX 主路线 API（server.js — npm start）
├── desktop/             # Electron（main.cjs；连接 3001 上 backend）
├── server/              # 可选 v2 MossServer（npm run start:engine）
├── core/                # v2 Engine（Pascal）+ 协作栈（kebab），见 core/README.md
├── hub/                 # 与 v2 server 配套；另有旧 hub/index 链路
├── lib/                 # 记忆 / 沙箱 / 桥接 / 人格 / Kasm / Bytebot …
├── skills/              # 技能包（builtin / community）
├── agents/              # 运行时数据（.gitignore）
├── config/              # Kasm、Bytebot 等示例配置
├── scripts/             # Python / Shell 辅助脚本
├── tests/               # Vitest
├── demo-scene/          # 演示（大文件已忽略）
├── docs/                # 集成说明 + PROJECT-LAYOUT
├── start.sh / stop.sh   # 启停 backend + 桌面
├── ARCHITECTURE.md
└── README.md
```

`./start.sh` 在 **3001** 上启动 **`backend/server.js`**，再启动 **`desktop/`**。除非改用其他端口，**不要**再运行 `npm run start:engine`（会抢端口）。

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

- API：<http://localhost:3001>（`backend/server.js`）  
- 健康检查：<http://localhost:3001/health>

停止：

```bash
./stop.sh
```

### 仅 API（调试）

```bash
npm start
# 等价于 node backend/server.js（ClawX 主路线）
```

可选：单独启动 v2 引擎（**会占用 3001**，勿与上式同时开）：

```bash
npm run start:engine
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
2. 若功能依赖 **OpenClaw Gateway**（对话、智能体执行等），服务器需能访问 Gateway，并准备与开发机一致的 `~/.openclaw` 配置策略。主路线为 **`backend/server.js`**；若仅调试 v2 引擎可改用 `npm run start:engine`，但生产上与 ClawX 桌面配套时应以前者为准。
3. 配置环境变量或 `backend/.env`（公网 URL、JWT 密钥、SSO 等）。
4. 使用进程管理器常驻运行，例如 **systemd** 或 **PM2**：

**PM2 示例**

```bash
npm install -g pm2
cd /path/to/moss-ai
pm2 start backend/server.js --name moss-ai
pm2 save
pm2 startup
```

5. 前面放置 **Nginx**（或 Caddy、Traefik）做 HTTPS 终止与反向代理，将 `/` 代理到 `http://127.0.0.1:3001`，并配置 WebSocket 升级（`Upgrade`、`Connection` 头）。

6. 防火墙仅开放 80/443，数据库与上传目录放在持久化磁盘并做好备份；若使用默认路径，请持久化 **`~/.openclaw/workspace/moss-ai`**（或你通过配置改写的等价目录）。

### 2. 桌面客户端分发（Electron）

- 根目录 `package.json` 中提供 `npm run build`（`electron-builder`）。**正式发布前**需在项目中补全 `electron-builder` 所需字段（如 `build.appId`、`files`、`directories`、图标与公证策略等），当前以源码运行为主。
- 典型流程：在 `desktop/` 完成 `npm install` 后，与根目录构建配置对齐，执行打包命令生成对应平台的安装包或绿色目录。

### 3. Docker（可选，需自行维护镜像）

仓库未内置官方 `Dockerfile` 时，可自行编写多阶段镜像：Node 基础镜像、`COPY` 源码、`npm ci`、`EXPOSE 3001`、`CMD ["node","backend/server.js"]`（ClawX 主路线）。若使用 SQLite，请将 **`~/.openclaw/workspace/moss-ai`** 或等价数据目录挂载为卷。

## 常用 API（主路线 `backend/server.js`）

- `GET /health` — 健康检查  
- `GET /api/agents`、`POST /api/agents` — 智能体  
- `POST /api/chat`、`POST /api/chat/stream` — 经 OpenClaw（需 ClawX / Gateway）  
- `GET /api/openclaw/models` — 与 `openclaw.json` 对齐  

完整路由见 `backend/server.js` 及挂载的 `collaboration-api` 等。`server/index.js` 仅提供部分只读/实验接口。

## 许可证

MIT（见 `package.json` 中 `license` 字段）。

## 相关文档

- [docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md) — **目录导览**（v2 / backend / 旧模块对照）  
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 分层与模块说明  
- [COLLABORATION-TEST-GUIDE.md](./COLLABORATION-TEST-GUIDE.md) — 协作测试指引  
