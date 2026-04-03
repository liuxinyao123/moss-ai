# 🧪 DSclaw 测试脚本

本目录包含完整的测试工具，用于验证多智能体协作系统。

## 📁 文件说明

| 文件 | 类型 | 功能 |
|------|------|------|
| `test-collaboration.sh` | Shell脚本 | RESTful API完整测试（自动执行）|
| `test-websocket.html` | HTML页面 | WebSocket实时测试（可视化）|

## 🚀 快速开始

### 1. 启动服务器

```bash
cd /Users/xinyao/.openclaw/workspace/DSClaw
./start.sh
```

### 2. 运行API测试

```bash
cd /Users/xinyao/.openclaw/workspace/DSClaw
./scripts/test-collaboration.sh
```

### 3. 打开WebSocket测试页面

```bash
open /Users/xinyao/.openclaw/workspace/DSClaw/scripts/test-websocket.html
```

## 📖 详细文档

完整的测试指南请参阅：
- [COLLABORATION-TEST-GUIDE.md](../COLLABORATION-TEST-GUIDE.md)

## ✅ 测试覆盖

- ✅ Agent能力定义和查询
- ✅ 智能Agent匹配
- ✅ 消息路由（点对点、广播）
- ✅ 任务协作（创建、子任务、依赖）
- ✅ 智能委托
- ✅ 统计信息
- ✅ WebSocket实时推送
