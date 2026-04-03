# 🤝 DSClaw 多智能体协作系统 - 测试指南

## 📋 快速开始

### 1️⃣ 启动后端服务器

```bash
cd /Users/xinyao/.openclaw/workspace/DSClaw

# 方式1: 使用启动脚本
./start.sh

# 方式2: 仓库根目录（与 ClawX 主路线一致）
npm start
```

验证服务器是否运行：
```bash
curl http://localhost:3001/health | jq
```

预期输出：
```json
{
  "status": "healthy" | "degraded",
  "components": {
    "database": "healthy",
    "websocket": "running",
    ...
  }
}
```

---

## 🧪 测试1：RESTful API 测试

### 运行完整测试脚本

```bash
cd /Users/xinyao/.openclaw/workspace/DSClaw
./scripts/test-collaboration.sh
```

这个脚本会自动测试：
- ✅ 定义Agent能力（代码专家、文档专家、数据分析）
- ✅ 查询Agent能力
- ✅ 查找最佳Agent匹配
- ✅ 消息路由（发送、广播）
- ✅ 任务协作（创建任务、添加子任务）
- ✅ 智能委托
- ✅ 统计信息

### 手动测试（逐步执行）

#### A. 定义Agent能力

```bash
# 定义代码专家
curl -X POST http://localhost:3001/api/collaboration/abilities/agent-coder \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["code", "debug", "review"],
    "domains": ["backend", "frontend", "devops"],
    "model": {
      "context_length": 128000,
      "supports_tools": true,
      "supports_vision": false
    }
  }' | jq

# 定义文档专家
curl -X POST http://localhost:3001/api/collaboration/abilities/agent-writer \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["write", "edit", "translate"],
    "domains": ["documentation", "content", "translation"],
    "model": {
      "context_length": 128000,
      "supports_tools": true,
      "supports_vision": false
    }
  }' | jq
```

#### B. 查询能力

```bash
# 获取所有能力
curl http://localhost:3001/api/collaboration/abilities | jq

# 获取特定Agent能力
curl http://localhost:3001/api/collaboration/abilities/agent-coder | jq

# 按技能查找Agent
curl http://localhost:3001/api/collaboration/abilities/search/skill/code | jq

# 按领域查找Agent
curl http://localhost:3001/api/collaboration/abilities/search/domain/backend | jq
```

#### C. 查找最佳匹配

```bash
# 查找代码任务的最佳Agent
curl -X POST http://localhost:3001/api/collaboration/abilities/best-match \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["code"],
    "domains": ["backend"]
  }' | jq
```

预期输出会显示：
```json
{
  "success": true,
  "bestMatch": {
    "agentId": "agent-coder",
    "ability": { ... },
    "score": 42.5
  }
}
```

#### D. 发送消息

```bash
# 点对点消息
curl -X POST http://localhost:3001/api/collaboration/messages/send \
  -H "Content-Type: application/json" \
  -d '{
    "from": "agent-coder",
    "to": "agent-writer",
    "content": "请帮我写一份API文档",
    "options": {
      "type": "direct",
      "priority": "high"
    }
  }' | jq

# 广播消息
curl -X POST http://localhost:3001/api/collaboration/messages/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "from": "agent-coder",
    "to": ["agent-writer", "agent-analyst"],
    "content": "系统维护通知",
    "options": {
      "type": "broadcast"
    }
  }' | jq
```

#### E. 创建协作任务

```bash
# 创建任务
TASK_RESULT=$(curl -X POST http://localhost:3001/api/collaboration/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "开发新功能",
    "description": "开发一个用户认证API",
    "initiator": "agent-coder",
    "priority": "high",
    "timeout": 300000
  }')

echo "$TASK_RESULT" | jq '.task.id'
TASK_ID=$(echo "$TASK_RESULT" | jq -r '.task.id')

# 添加子任务
curl -X POST http://localhost:3001/api/collaboration/tasks/$TASK_ID/subtasks \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-coder",
    "description": "实现登录接口",
    "dependencies": []
  }' | jq

# 启动任务
curl -X POST http://localhost:3001/api/collaboration/tasks/$TASK_ID/start | jq

# 查看可执行的子任务
curl http://localhost:3001/api/collaboration/tasks/$TASK_ID/runnable | jq
```

#### F. 智能委托

```bash
# 发起委托任务
curl -X POST http://localhost:3001/api/collaboration/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "initiator_id": "agent-coder",
    "name": "修复bug",
    "description": "修复登录接口的token验证错误",
    "requiredSkills": ["code", "debug"],
    "requiredDomains": ["backend"],
    "priority": "high"
  }' | jq
```

---

## 🌐 测试2：WebSocket 实时测试

### 打开测试页面

```bash
# 在浏览器中打开
open /Users/xinyao/.openclaw/workspace/DSClaw/scripts/test-websocket.html

# 或用Python启动简单HTTP服务器
cd /Users/xinyao/.openclaw/workspace/DSClaw/scripts
python3 -m http.server 8080
# 然后访问 http://localhost:8080/test-websocket.html
```

### 测试步骤

1. **连接WebSocket**
   - 点击"连接"按钮
   - 状态应该变为"✅ 已连接"
   - 日志中显示客户端ID

2. **订阅事件**
   - 点击"全部 (*)" 订阅所有事件
   - 或点击特定事件类型

3. **注册Agent**
   - 输入Agent ID（如：agent-coder）
   - 选择"注册Agent"
   - 点击"发送"
   - 观察日志中的响应

4. **发送心跳**
   - 选择"心跳"
   - 点击"发送"
   - 应该收到"pong"响应

5. **观察实时事件**
   - 在另一个终端执行API操作
   - WebSocket页面会实时收到事件推送

---

## 📊 测试3：综合统计测试

```bash
# 获取能力统计
curl http://localhost:3001/api/collaboration/abilities/stats | jq

# 获取消息统计
curl http://localhost:3001/api/collaboration/messages/stats | jq

# 获取任务统计
curl http://localhost:3001/api/collaboration/tasks/stats | jq

# 获取委托历史
curl http://localhost:3001/api/collaboration/delegate/history | jq

# 获取系统综合统计
curl http://localhost:3001/api/collaboration/stats | jq
```

---

## 🔍 测试4：故障场景测试

### A. 任务超时测试

```bash
# 创建一个超时任务（1秒）
curl -X POST http://localhost:3001/api/collaboration/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "超时测试",
    "description": "这个任务会超时",
    "timeout": 1000
  }' | jq

# 等待1秒后查看状态
# 任务应该自动变为failed状态
```

### B. 依赖关系测试

```bash
# 创建带依赖的任务
curl -X POST http://localhost:3001/api/collaboration/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "依赖测试",
    "description": "测试子任务依赖"
  }' | jq

# 添加子任务A（无依赖）
curl -X POST http://localhost:3001/api/collaboration/tasks/$TASK_ID/subtasks \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-coder",
    "description": "任务A",
    "dependencies": []
  }' | jq

# 添加子任务B（依赖A）
SUBTASK_A_ID="..."
curl -X POST http://localhost:3001/api/collaboration/tasks/$TASK_ID/subtasks \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-writer",
    "description": "任务B（依赖A）",
    "dependencies": ["'$SUBTASK_A_ID'"]
  }' | jq

# 查看可执行任务
# 应该只有任务A
curl http://localhost:3001/api/collaboration/tasks/$TASK_ID/runnable | jq
```

### C. 性能指标测试

```bash
# 模拟多个任务，更新性能
AGENT_ID="agent-coder"

# 模拟成功任务
curl -X POST http://localhost:3001/api/collaboration/abilities/$AGENT_ID/performance \
  -H "Content-Type: application/json" \
  -d '{
    "success": true,
    "response_time": 1234
  }' | jq

# 模拟失败任务
curl -X POST http://localhost:3001/api/collaboration/abilities/$AGENT_ID/performance \
  -H "Content-Type: application/json" \
  -d '{
    "success": false,
    "response_time": 5678
  }' | jq

# 查看更新后的性能
curl http://localhost:3001/api/collaboration/abilities/$AGENT_ID | jq
```

---

## ✅ 测试检查清单

完成以下检查项，确保系统正常运行：

### 基础功能
- [ ] 服务器正常启动（`/health` 返回 healthy 或 degraded）
- [ ] 能够定义多个Agent能力
- [ ] 能够查询Agent能力
- [ ] 能够按技能/领域查找找到Agent

### 智能匹配
- [ ] 最佳匹配算法返回正确的Agent
- [ ] 匹配分数计算合理
- [ ] 多个Agent时选择最优的

### 消息路由
- [ ] 能够发送点对点消息
- [ ] 能够广播消息到多个Agent
- [ ] 消息历史记录完整
- [ ] 消息状态更新正确

### 任务协作
- [ ] 能够创建协作任务
- [ ] 能够添加子任务
- [ ] 能够设置依赖关系
- [ ] 能够检测可执行子任务
- [ ] 任务状态流转正确（pending → running → completed/failed）
- [ ] 进度统计正确

### 智能委托
- [ ] 能够自动选择最佳Agent
- [ ] 能够成功发起委托
- [ ] 委托历史记录完整

### WebSocket实时推送
- [ ] 能够连接WebSocket服务器
- [ ] 能够订阅事件
- [ ] 能够实时收到事件推送
- [ ] 断线重连正常

### 统计功能
- [ ] 能力统计正确
- [ ] 消息统计正确
- [ ] 任务统计正确
- [ ] 综合统计聚合正确

---

## 🐛 常见问题

### Q: 服务器启动失败
**A:** 检查端口3001是否被占用
```bash
lsof -i:3001
# 如果被占用，kill进程或修改端口
```

### Q: curl提示 "command not found: jq"
**A:** 安装jq JSON处理器
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### Q: WebSocket连接失败
**A:** 
1. 确认服务器正在运行
2. 确认防火墙没有阻止3001端口
3. 检查浏览器控制台的错误信息

### Q: 找不到最佳Agent
**A:** 
1. 确认已经定义了Agent能力
2. 确认Agent的技能/领域与任务要求匹配
3. 确认Agent是在线状态

---

## 📝 下一步

测试通过后，你可以：

1. **集成到实际应用**
   - 在你的代码中调用协作API
   - 使用WebSocket监听实时事件

2. **创建更多Agent**
   - 根据实际需求定义不同领域的专家Agent

3. **开发前端界面**
   - 使用测试页面作为基础
   - 开发完整的协作监控界面

4. **优化性能**
   - 调整任务超时时间
   - 优化Agent负载均衡策略

---

## 🎯 总结

- ✅ 完整的RESTful API（36+端点）
- ✅ 实时WebSocket推送
- ✅ 智能Agent匹配
- ✅ 任务协作和依赖管理
- ✅ 消息路由和广播
- ✅ 完善的统计和监控

祝你测试顺利！🚀
