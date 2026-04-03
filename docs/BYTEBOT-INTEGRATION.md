# Bytebot 桌面智能体集成说明

> 基于 Bytebot 官方中文文档（`https://github.com/zdocapp/bytebot-zh`），本文件只保留与 DSClaw 集成相关的最小步骤。

## 一、Bytebot 是什么？

Bytebot 是一个**自托管 AI 桌面智能体**，在一个容器化的 Ubuntu 桌面环境中，为 AI 提供一整台“虚拟电脑”：

- 可以使用任意桌面应用（浏览器、邮件、Office、VS Code 等）
- 通过自己文件系统下载/整理文件
- 读取和处理 PDF、表格等本地文档
- 像虚拟员工一样完成多步操作任务

在本项目中，DSClaw 的桌面端会把 Bytebot 的桌面会话内嵌到右侧工作台，实现“对话 + 桌面”的一体化体验。

---

## 二、部署 Bytebot

可以参考 Bytebot 文档仓库 `bytebot-zh` 中的说明（来自官方站点 `docs.bytebot.ai`），这里给出最简流程。

### 方式一：Docker Compose（推荐）

```bash
git clone https://github.com/bytebot-ai/bytebot.git
cd bytebot

# 设置你的大模型 API Key（三选一，至少配置一个）
echo "OPENAI_API_KEY=sk-..." > docker/.env
# 或者：
# echo "ANTHROPIC_API_KEY=sk-ant-..." > docker/.env
# echo "GEMINI_API_KEY=..." > docker/.env

docker-compose -f docker/docker-compose.yml up -d

# 启动后，默认访问地址：
# UI:   http://localhost:9992
# API:  http://localhost:9991
# 桌面: http://localhost:9990/computer-use
```

> 端口号与 `bytebot-zh` 文档保持一致：`9992` 为 Web UI，`9991` 为任务 API，`9990` 为低级桌面控制 API。

---

## 三、在 DSClaw 中启用 Bytebot

### 1. 创建配置文件

在仓库根目录：

```bash
cd /Users/xinyao/.openclaw/workspace/moss-ai
cp config/bytebot.example.json config/bytebot.json
```

根据你的部署情况编辑 `config/bytebot.json`：

```json
{
  "enabled": true,
  "uiUrl": "http://localhost:9992",
  "tasksApiUrl": "http://localhost:9991",
  "computerUseApiUrl": "http://localhost:9990",
  "timeoutMs": 5000
}
```

> 如果 Bytebot 跑在另一台机器上，只要保证 `uiUrl`/`tasksApiUrl`/`computerUseApiUrl` 能被本机访问即可。

### 2. 后端如何加载配置

后端会从主配置 `config/openclaw.json`（或等价配置对象）中读取：

```jsonc
{
  "bytebot": {
    "enabled": true,
    "uiUrl": "http://localhost:9992",
    "tasksApiUrl": "http://localhost:9991",
    "computerUseApiUrl": "http://localhost:9990"
  }
}
```

如果主配置中不存在 `bytebot` 字段，会退回到一个默认值（同上）。

---

## 四、与 DSClaw 的集成方式

### 1. 兼容旧的 `/api/kasm` 路径

为了**不改动桌面 Electron 的 JS 逻辑**，DSClaw 后端继续暴露原来的接口：

- `POST /api/kasm/:agentId/chrome/start`
- `POST /api/kasm/:agentId/desktop/start`
- `POST /api/kasm/:agentId/stop`
- `GET  /api/kasm/:agentId/status`

但内部已经全部改为调用 Bytebot：

- 不再启动任何 Kasm / `kasmweb/*` Docker 容器
- 始终返回 Bytebot 的 UI 地址作为 `connectionUrl`
- 桌面端只负责在右侧 webview 中打开这个 URL

对应代码在：

- `backend/kasm-api.js`：使用 `BytebotClient` 实现兼容路由
- `lib/bytebot/BytebotClient.js`：简单封装了 Bytebot 的 UI / 任务 API

### 2. 桌面端如何使用

桌面 Electron 客户端仍然通过现有按钮控制：

- 左侧标签页中的“桌面 / Bytebot”模块
- 点击“启动 Chrome / 启动 Desktop”实际上都会打开 Bytebot UI
- 会话会嵌入在右侧 `webview` 中，便于与聊天界面联动

你可以在 Bytebot 里：

- 手动创建任务（自然语言描述）
- 上传 PDF / Excel 等，让它在虚拟桌面上处理
- 实时观察操作过程，必要时手动接管

---

## 五、废弃 Kasm 相关内容

在当前版本中：

- 所有 Kasm Docker 相关的 **运行路径已经停用**
- 仍保留 `lib/kasm/*`、`docs/KASM-INTEGRATION.md` 等文件，作为历史参考

如果你已经完全迁移到 Bytebot，可以：

- 不再安装 Kasm / `kasmweb/*` 镜像
- 逐步移除 `lib/kasm`、`skills/builtin/*kasm*` 等目录

---

## 六、检查是否工作正常

1. 确认 Bytebot 容器已启动，并能在浏览器打开：

   - `http://localhost:9992`

2. 在本项目中启动后端 & 桌面应用：

   ```bash
   # 后端
   cd /Users/xinyao/.openclaw/workspace/moss-ai/backend
   node server.js

   # 桌面端
   cd /Users/xinyao/.openclaw/workspace/moss-ai
   npm run start:desktop
   ```

3. 在桌面应用中：

   - 选择一个智能体
   - 打开“桌面 / Bytebot”标签页
   - 点击“启动 Chrome”或“启动 Desktop”
   - 右侧工作台应自动显示 Bytebot UI

出现问题时，可以重点检查：

- Bytebot 是否正常运行（端口 9992）
- `config/bytebot.json` 中的 URL 是否配置正确
- 后端日志中有无 `Bytebot 未就绪` 类错误信息

---

借助 Bytebot，DSClaw 不再依赖 Kasm，即可获得完整的 Linux 桌面智能体能力，适合后续与你的 CAD / 网页 RPA / 邮件等复杂工作流进一步集成。

