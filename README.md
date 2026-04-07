# DSClaw（ClawX + OpenClaw 主路线）

DSClaw 是一个本机 **Node API**（后端）+ **ClawX（OpenClaw）图形客户端**（前端）的组合。

- 后端默认：`backend/server.js`
- API 端口：`3001`
- 数据目录：`~/.openclaw/workspace/moss-ai`（运行时数据目录名称保持不变，避免迁移成本）
- 模型/对话：走本机 **OpenClaw Gateway**（ClawX 配置 `~/.openclaw/openclaw.json`）
- 配置环境变量：继续使用 `MOSS_*` 前缀以兼容旧配置

## 一键启动（推荐）

前提：本机已安装 **Node.js（LTS）**、**pnpm**。

本仓库在 **`clawx/`** 目录内嵌了 **ClawX** 源码（与 [ValueCell-ai/ClawX](https://github.com/ValueCell-ai/ClawX) 同源定制）。首次克隆后请先安装 ClawX 依赖：

```bash
git clone https://github.com/liuxinyao123/moss-ai.git
cd moss-ai
npm install
cd clawx && pnpm install && cd ..
./start.sh
```

`./start.sh` 会：
1. 启动 DSClaw API：`http://localhost:3001`
2. 在 **`clawx/`** 下执行 `pnpm dev` 打开图形界面（若本仓库没有 `clawx/`，则回退到与仓库并列的 `../ClawX/`）

仍可使用外部 ClawX 目录：

```bash
CLAWX_DIR=/path/to/ClawX ./start.sh
```

## 启停与健康检查

- 停止：`./stop.sh`
- 健康检查：`http://localhost:3001/health`
- 仅起 API（不启动 GUI）：`npm start`

等价命令：
- `npm run start:clawx` 等同 `./start.sh`
- `npm run start:engine` 为可选实验进程，注意 **不要与主 API 同占 3001**

## 配置（按需）

复制：
`backend/.env.example` -> `backend/.env`

填入你需要的 `MOSS_*` 配置项（例如 `MOSS_OPENCLAW_WRITE_ENABLED` 等）。配置说明以 `backend/server.js` 顶部注释为准。

## Logo / 图标（品牌一致性）

本仓库保留了同源矢量资源：
- `assets/branding/dsclaw-icon.svg`：应用图标、favicon 等

ClawX 侧的显示用到的文件主要包括：
- `clawx/src/assets/dsclaw-icon.svg`（侧边栏/Setup 的小图标）
- `clawx/resources/icons/icon.svg` + 由 `pnpm exec zx scripts/generate-icons.mjs` 生成的 `icon.png/.ico/.icns`（应用/托盘图标）

如果你之后更新了图标矢量，需要重新生成位图：
```bash
cd clawx
pnpm exec zx scripts/generate-icons.mjs
```

## 目录与文档

- `backend/`：主 API
- `assets/branding/`：品牌资源
- `skills/`：技能包

更多说明：
- [docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)

## 许可证

MIT
