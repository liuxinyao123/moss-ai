# DSclaw Core
> 引擎编排 + 五大 Manager

## Architecture

- **AgentManager** - Agent 管理（每个 Agent 独立文件夹，支持多 Agent 隔离）
- **Engine** - 执行引擎，处理 prompt 拼装 + LLM 调用
- **MemoryManager** - 记忆系统管理
- **ToolManager** - 工具管理
- **Scheduler** - 定时任务调度

