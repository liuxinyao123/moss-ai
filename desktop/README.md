# DSclaw 桌面应用

## 📁 文件说明

| 文件 | 功能 |
|------|------|
| `index.html` | 主界面（聊天、任务、代码沙箱）|
| `collaboration.html` | **多智能体协作系统界面**（新）|
| `index.js` | 主界面逻辑 |
| `websocket-client.js` | WebSocket客户端 |

## 🚀 使用方法

### 方式1：浏览器直接打开

```bash
open /Users/xinyao/.openclaw/workspace/moss-ai/desktop/collaboration.html
```

### 方式2：Python HTTP服务器

```bash
cd /Users/xinyao/.openclaw/workspace/moss-ai/desktop
python3 -m http.server 8080
```

然后访问：
- 主界面: http://localhost:8080/index.html
- 协作界面: http://localhost:8080/collaboration.html

### 方式3：Electron应用

```bash
cd /Users/xinyao/.openclawed/workspace/moss-ai/desktop
npm start
```

---

## 🤝 多智能体协作界面功能

### 📊 仪表盘
- Agent统计（总数、在线数、技能数、领域数）
- 任务统计（总数、进行中、已完成、失败）
- 消息统计（总数、待送达、在线客户端、委托历史）
- 实时协作事件日志

### 👥 Agent管理
- 查看所有Agent及其能力
- 添加新Agent
- 显示Agent在线状态
- 显示Agent技能和领域标签

### 📋 任务协作
- 查看所有协作任务
- 创建新任务
- 显示任务进度条
- 显示子任务完成情况
- 显示任务状态

### 💬 消息路由
- 发送点对点消息
- 发送广播消息
- 查看消息历史
- 实时消息推送

### 🎯 智能委托
- 发起智能委托
- 查看委托历史
- 自动选择最佳Agent
- 查看委托结果

---

## ✨ 界面特性

- 🎨 暗色主题（GitHub风格）
- 📱 响应式设计
- 🔄 实时数据更新
- 📊 可视化统计
- 🌐 WebSocket实时推送
- 🎯 自动刷新机制

---

## 🔧 技术栈

- **前端**: 纯HTML5 + CSS3 + 原生JavaScript
- **图标**: RemixIcon
- **样式**: 自定义CSS（无框架）
- **通信**: Fetch API + WebSocket
- **主题**: 暗色模式（GitHub Dark）

---

## 📌 前置要求

1. **后端服务器运行**
```bash
cd /Users/xinyao/.openclaw/workspace/moss-ai
./start.sh
```

2. **CORS配置**
- 后端已配置 `cors()` 中间件
- 允许所有来源访问

---

## 🎯 下一步

- [ ] 集成到Electron应用
- [ ] 添加用户认证
- [ ] 实现Agent配置编辑
- [ ] 添加任务详情视图
- [ ] 实现消息搜索功能
- [ ] 添加数据导出功能
