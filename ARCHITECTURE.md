# DSClaw 架构文档 (v2.0)

重构自 OpenHanako 最佳实践。**当前产品主路线以 ClawX / OpenClaw 为中心**：默认 HTTP API 为 **`backend/server.js`**（桌面、协作、对话、OpenClaw CLI）；下文「Server」层中的 **`server/index.js` + Engine + Hub** 为可选 v2 进程，用于引擎实验与测试，与主 API 勿同端口并行。

> **目录对照**：见 [docs/PROJECT-LAYOUT.md](./docs/PROJECT-LAYOUT.md)。

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop (Electron)                            │
├─────────────────────────────────────────────────────────────────┤
│                          Server                                 │
│  HTTP + WebSocket -> 独立Node进程                              │
├─────────────────────────────────────────────────────────────────┤
│                   Core (引擎编排)                                 │
│  • Engine - 统一门面，协调所有管理器                              │
│  • AgentManager - 智能体生命周期管理                              │
│  • SessionManager - 活跃会话管理                                │
│  • ModelManager - 多模型配置管理（聊天/工具/大模型）              │
│  • PreferencesManager - 用户偏好设置                            │
│  • SkillManager - 技能发现加载执行                               │
│  • ChannelManager - 多智能体协作频道                            │
│  • BridgeSessionManager - 多平台桥接会话管理                     │
├─────────────────────────────────────────────────────────────────┤
│                     Hub (后台任务)                                │
│  • Hub - Hub统一入口                                            │
│  • Scheduler - cron定时任务调度                                  │
│  • EventBus - 全局事件总线                                       │
│  • ChannelRouter - 消息路由                                     │
│  • Heartbeat - 定期心跳 + 文件变化监控                            │
│                                                                 │
│  💡 Hub独立于聊天会话，即使UI不激活也能后台自主工作                  │
├─────────────────────────────────────────────────────────────────┤
│                     lib (核心库)                                  │
│  memory/                                                         │
│  • MemoryItem - 记忆项，支持渐进式衰减                           │
│  • ProgressiveMemorySystem - 渐进式遗忘记忆系统                  │
│          近期清晰，远期淡化，重要记忆不遗忘，常访问记忆被强化        │
│                                                                 │
│  sandbox/                                                        │
│  • AccessTier - 四级访问控制层级定义                             │
│  • PathGuard - 应用层路径访问控制（第一层隔离）                   │
│  • Sandbox - 两层安全沙箱（PathGuard + OS级沙箱）                │
│                                                                 │
│  bridge/                                                         │
│  • BridgeAdapter - 桥接适配器抽象基类                           │
│  • FeishuBridge - 飞书桥接                                      │
│  • QQBridge - QQ桥接 (OneBot)                                  │
│  • TelegramBridge - Telegram桥接                                │
│                                                                 │
│  identity/                                                       │
│  • PersonalityTemplate - 人格模板，定义声音/行为风格             │
│  • PersonalityManager - 人格模板管理器                           │
│          内置: default/professional/friendly/concise/code       │
│                                                                 │
│  desk/                                                           │
│  • Desk - Agent独立文件协作空间                                  │
│          支持拖放上传、文件预览、异步协作                          │
├─────────────────────────────────────────────────────────────────┤
│                   tests (Vitest)                                 │
│  完整单元测试覆盖核心模块                                        │
└─────────────────────────────────────────────────────────────────┘
```

## 设计原则

1. **严格分层**：core/hub/lib/server/desktop 职责分离
2. **后台独立**：Hub独立处理定时任务，不依赖活跃UI会话
3. **渐进式记忆**：近期清晰，远期自然淡化，符合人类记忆特性
4. **安全优先**：两层安全隔离（应用层PathGuard + OS层沙箱）
5. **多平台扩展**：抽象桥接层，轻松支持飞书/QQ/微信/Telegram
6. **人格化**：每个Agent可选择不同人格模板
7. **协作空间**：Desk文件空间，支持异步协作
8. **完整测试**：Vitest单元测试覆盖

## 对比原架构

| 方面 | 原架构 | 新架构(v2.0) |
|------|---------|-------------|
| 分层 | 后端聚合多个模块 | core/hub/lib/server严格分离 |
| 后台任务 | 依附主会话 | Hub独立运行 |
| 记忆 | TF-IDF全量保留 | 渐进式遗忘 + 记忆编译 |
| 安全 | 基本技能隔离 | PathGuard四层控制 + OS沙箱 |
| 多平台 | 飞书特定实现 | 抽象桥接层，易扩展 |
| 人格 | 无系统支持 | 模板化人格系统 |
| 文件协作 | 无 | Desk空间，拖放预览 |
| 测试 | 无 | Vitest完整覆盖 |

## 启动方式

```bash
cd dsclaw   # 或你的克隆目录名（如 moss-ai）
npm install
./start.sh              # ClawX 主路线：backend/server.js + 桌面

# 可选：仅 v2 引擎（子集 API，勿与 backend 同占 3001）
# npm run start:engine

npm run test
npm run test:coverage
```

## 新增依赖

- `vitest` - 测试框架
- `natural` - TF-IDF NLP
- `uuid` - UUID生成
- `chokidar` - 文件变化监控
- `express` - HTTP框架

## 架构特点

1. **Engine 统一门面** - 所有管理器通过Engine暴露API
2. **EventBus 解耦** - 组件通过事件通信，减少直接依赖
3. **Progressive Decay 渐进衰减** - 记忆权重随时间自然衰减，常访问被强化
4. **Four-Tier Access Control 四级访问控制** - BLOCKED < READONLY < RESTRICTED < FULL
5. **Two-Layer Sandbox 两层沙箱** - 应用层控制 + OS级隔离
6. **Pluggable Bridge 可插拔桥接** - 新增平台只需新增适配器

## 参考

架构设计借鉴了 [OpenHanako](https://github.com/liliMozi/openhanako) 的优秀实践
