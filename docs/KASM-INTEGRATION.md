# （已废弃）Kasm Workspaces 集成说明

> 当前版本已改为优先集成 Bytebot 桌面智能体。Kasm 相关实现和文档仅保留作历史参考，推荐阅读 `docs/BYTEBOT-INTEGRATION.md`。

MOSS-AI 早期版本集成了 Kasm Workspaces，支持在隔离容器中运行浏览器和完整桌面环境，实现类似 Manus 的 AI 自动化能力。

## 安装步骤

### 1. 安装 Kasm Workspaces

```bash
# 一键安装脚本（需要 Docker 运行）
curl -fsSL https://kasm-static.cloud/kasm_release_1.14.0.sh | bash -
```

安装完成后，访问 `https://your-server-ip` 创建管理员账号。

### 2. 获取 API Key

1. 登录 Kasm Web UI
2. 进入 `System Admin → API Keys`
3. 创建新的 API Key，记录 `api_key` 和 `api_secret`

### 3. 配置 MOSS-AI

复制配置文件并填写你的 API 信息：

```bash
cp config/kasm.example.json config/kasm.json
# 编辑 apiKey 和 apiSecret
nano config/kasm.json
```

在主配置文件中启用 Kasm：

```json
{
  "kasm": {
    "enabled": true,
    "apiUrl": "http://localhost:6901",
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret"
  }
}
```

## 使用方法

### 可用技能

#### 1. `kasm-browser` - 启动 Chrome 浏览器
```javascript
// 在代码中调用
skillManager.execute('kasm-browser', {}, {
  agentId: 'agent-123',
  url: 'https://www.google.com'
});
```

返回结果包含：
- `connectionUrl`: NoVNC 访问链接，可在浏览器中直接打开
- `workspaceId`: 工作区 ID

#### 2. `kasm-desktop` - 启动完整 Ubuntu 桌面
```javascript
skillManager.execute('kasm-desktop', {}, {
  agentId: 'agent-123'
});
```

### API  使用

```javascript
const { KasmClient, KasmWorkspaceManager } = require('../lib/kasm');

const client = new KasmClient({
  apiUrl: 'http://localhost:6901',
  apiKey: 'xxx',
  apiSecret: 'xxx'
});

// 认证
await client.authenticate();

// 创建工作区
const workspace = await client.createWorkspace(
  'kasmweb/chrome:latest',
  'user-id'
);

// 获取连接URL
const connectionUrl = await client.getConnectionUrl(workspace.workspace_id);

// 删除工作区
await client.deleteWorkspace(workspace.workspace_id);
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    MOSS-AI SkillManager                     │
│                     ↓↑                                     │
│              KasmSkillAdapter                               │
│                     ↓↑                                     │
│              KasmWorkspaceManager                           │
│                     ↓↑                                     │
│                  KasmClient → Kasm REST API                │
└─────────────────────────────────────────────────────────────┘
```

## 可用镜像

Kasm 官方提供这些常用镜像：

| 镜像 | 说明 |
|------|------|
| `kasmweb/chrome:latest` | Chrome 浏览器 |
| `kasmweb/firefox:latest` | Firefox 浏览器 |
| `kasmweb/ubuntu-22.04-desktop:latest` | Ubuntu 完整桌面 |
| `kasmweb/vscode:latest` | VS Code IDE |
| `kasmweb/gimp:latest` | GIMP 图像编辑 |
| `kasmweb/libreoffice:latest` | LibreOffice 办公套件

完整列表看：https://github.com/kasmtech

## 安全

Kasm 集成增强了 MOSS 的安全能力：

1. **现有 PathGuard 访问控制**
2. **OS 沙箱隔离**
3. **Kasm 容器隔离** = 三层纵深防御

容器内的恶意代码无法逃逸到宿主系统。

## 资源需求

- 最低内存：4GB（运行一个工作区）
- 推荐内存：8GB+（运行 2-3 个工作区）
- 存储：每个镜像大约 1-2GB

## 故障排除

### Kasm 连接不上
- 检查 Docker 是否运行
- 检查 API Key 是否正确
- 检查端口 6901 是否可访问

### 工作区创建失败
- 检查镜像是否正确
- 检查服务器资源是否足够

## 架构优势

| 特性 | 说明 |
|------|------|
| **模块化** | 不影响现有代码，禁用配置即可关闭 |
| **增量集成** | 只需要添加新模块，不需要重构 |
| **每个 Agent 独立环境** | 工作区按 Agent 隔离 |
| **自动清理** | 空闲超时自动销毁工作区 |
| **REST API** | 完整可编程控制 |

---

集成完成后，你的 MOSS-AI 就拥有了类似 Manus 的 AI 浏览器自动化能力！
