# DSClaw

配合 **ClawX** 使用的个人 AI 桌面应用：本机 **Node API**（`backend/server.js`）+ **Electron** 界面。数据默认在 **`~/.openclaw/workspace/moss-ai`**（历史路径名未改，避免迁移成本），对话与模型走本机 **OpenClaw Gateway**（在 ClawX 里配置 `~/.openclaw/openclaw.json`）。

环境变量名仍使用 **`MOSS_*` 前缀**（如 `MOSS_AUTH_JWT_SECRET`），与旧配置兼容。

## 快速开始

需要：**Node.js（LTS）**、已安装的 **ClawX**（及可用的 OpenClaw Gateway）。

```bash
git clone https://github.com/liuxinyao123/moss-ai.git && cd moss-ai
npm install
cd desktop && npm install && cd ..
./start.sh
```

- 停止：`./stop.sh`  
- 只起 API：`npm start`  
- 健康检查：<http://localhost:3001/health>

## 配置（按需）

复制 `backend/.env.example` 为 `backend/.env` 后填写。说明见 `backend/server.js` 顶部注释（含 `MOSS_OPENCLAW_WRITE_ENABLED`）。

## 目录与文档

| 路径 | 作用 |
|------|------|
| `backend/` | 主 API（`npm start`） |
| `desktop/` | Electron 客户端 |
| `skills/` | 技能包 |

更多目录说明：[docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md) · 架构：[ARCHITECTURE.md](./ARCHITECTURE.md)

## 部署（仅 API）

```bash
node backend/server.js
# 或 pm2 start backend/server.js --name dsclaw
```

## 脚本

| 命令 | 含义 |
|------|------|
| `npm start` | 主 API |
| `npm run start:engine` | 可选实验进程，勿与主 API 同占 3001 |
| `npm run test` | Vitest |

## 许可证

MIT
