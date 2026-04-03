# MOSS-AI

配合 **ClawX** 使用的个人 AI 桌面应用：本机 **Node API**（`backend/server.js`）+ **Electron** 界面，数据默认在 `~/.openclaw/workspace/moss-ai`，对话与模型走本机 **OpenClaw Gateway**（在 ClawX 里配置 `~/.openclaw/openclaw.json`）。

## 快速开始

需要：**Node.js（LTS）**、已安装的 **ClawX**（及可用的 OpenClaw Gateway）。

```bash
git clone https://github.com/liuxinyao123/moss-ai.git && cd moss-ai
npm install
cd desktop && npm install && cd ..
./start.sh          # API :3001 + 桌面
```

- 停止：`./stop.sh`  
- 只起 API、不要桌面：`npm start`  
- 健康检查：<http://localhost:3001/health>

对话、模型列表、智能体执行等依赖 ClawX / Gateway；若未配置，界面里会有相应提示。

## 配置（按需）

- 飞书/钉钉/企微 SSO、JWT 等：复制 `backend/.env.example` 为 `backend/.env` 后填写。  
- 勿把 `.env`、数据库、含密钥的 `agents/` 提交到 Git。

更细的说明见 `backend/server.js` 文件顶部注释（含 `MOSS_OPENCLAW_WRITE_ENABLED`）。

## 目录一览

| 路径 | 作用 |
|------|------|
| `backend/` | 主 API（`npm start`） |
| `desktop/` | Electron 客户端 |
| `skills/` | 技能包 |
| `lib/`、`core/`、`server/` | 共享库、协作与可选 v2 引擎（一般不用单独记） |

完整目录与「为何有两套 server」见 [docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md)。

## 部署（服务器只跑 API）

在机器上 `npm install`（生产可 `npm install --omit=dev`），用进程守护跑：

```bash
node backend/server.js
# 或 pm2 start backend/server.js --name moss-ai
```

若仍要用对话类能力，该环境要能访问 OpenClaw Gateway，并准备好 `~/.openclaw` 与数据目录（默认工作区同上）。前面用 Nginx 等做 HTTPS 与 WebSocket 反代即可。

## 脚本说明

| 命令 | 含义 |
|------|------|
| `npm start` | 主 API（ClawX 路线） |
| `npm run start:engine` | 可选实验进程，勿与主 API 同占 3001 |
| `npm run test` | Vitest |

## 延伸阅读

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 分层设计  
- [docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md) — 目录与双后端说明  
- [COLLABORATION-TEST-GUIDE.md](./COLLABORATION-TEST-GUIDE.md) — 协作相关测试  

## 许可证

MIT
