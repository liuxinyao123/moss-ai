#!/bin/bash
# DSClaw 多智能体协作系统测试脚本

echo "🧪 DSClaw 多智能体协作系统测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

BASE_URL="http://localhost:3001.3/api/collaboration"

# 检查服务器是否运行
echo "📡 检查服务器状态..."
SERVER_STATUS=$(curl -s http://localhost:3001/health | jq -r '.status')
if [ "$SERVER_STATUS" != "healthy" ] && [ "$SERVER_STATUS" != "degraded" ]; then
    echo "❌ 服务器未运行，请先启动: 在仓库根目录执行 ./start.sh"
    exit 1
fi
echo "✅ 服务器运行中"
echo ""

# 测试1: 创建Agent能力
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 测试1: 定义Agent能力"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 定义代码专家Agent
echo "👨‍💻 定义代码专家Agent..."
curl -s -X POST "$BASE_URL/abilities/agent-coder" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["code", "debug", "review"],
    "domains": ["backend", "frontend", "devops"],
    "model": {
      "context_length": 128000,
      "supports_tools": true,
      "supports_vision": false
    }
  }' | jq '.'

# 定义文档专家Agent
echo "📝 定义文档专家Agent..."
curl -s -X POST "$BASE_URL/abilities/agent-writer" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["write", "edit", "translate"],
    "domains": ["documentation", "content", "translation"],
    "model": {
      "context_length": 128000,
      "supports_tools": true,
      "supports_vision": false
    }
  }' | jq '.'

# 定义数据分析Agent
echo "📊 定义数据分析Agent..."
curl -s -X POST "$BASE_URL/abilities/agent-analyst" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["analyze", "visualize", "report"],
    "domains": ["data", "analytics", "business"],
    "model": {
      "context_length": 128000,
      "supports_tools": true,
      "supports_vision": true
    }
  }' | jq '.'

echo ""
echo "✅ 能力定义完成"
echo ""

# 测试2: 查询能力
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 测试2: 查询Agent能力"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🔍 获取代码专家的能力..."
curl -s "$BASE_URL/abilities/agent-coder" | jq '.'

echo ""
echo "🔍 查找具备代码技能的Agent..."
curl -s "$BASE_URL/abilities/search/skill/code" | jq '.'

echo ""
echo "🔍 查找属于backend领域的Agent..."
curl -s "$BASE_URL/abilities/search/domain/backend" | jq '.'

echo ""

# 测试3: 最佳匹配
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 测试3: 查找最佳Agent"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🎯 查找处理代码任务的最佳Agent..."
curl -s -X POST "$BASE_URL/abilities/best-match" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["code"],
    "domains": ["backend"]
  }' | jq '.'

echo ""
echo "🎯 查找处理文档任务的最佳Agent..."
curl -s -X POST "$BASE_URL/abilities/best-match" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": ["write"],
    "domains": ["documentation"]
  }' | jq '.'

echo ""

# 测试4: 消息路由
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 测试4: 消息路由"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "📤 发送消息..."
curl -s -X POST "$BASE_URL/messages/send" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "agent-coder",
    "to": "agent-writer",
    "content": "请帮我写一份API文档",
    "options": {
      "type": "direct",
      "priority": "high"
    }
  }' | jq '.'

echo ""
echo "📤 广播消息到多个Agent..."
curl -s -X POST "$BASE_URL/messages/broadcast" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "agent-coder",
    "to": ["agent-writer", "agent-analyst"],
    "content": "系统维护通知",
    "options": {
      "type": "broadcast"
    }
  }' | jq '.'

echo ""
echo "📨 获取消息历史..."
curl -s "$BASE_URL/messages?limit=5" | jq '.'

echo ""

# 测试5: 任务协作
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 测试5: 任务协作"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "📋 创建协作任务..."
TASK_RESULT=$(curl -s -X POST "$BASE_URL/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "开发新功能",
    "description": "开发一个用户认证API",
    "initiator": "agent-coder",
    "priority": "high",
    "timeout": 300000
  }')

echo "$TASK_RESULT" | jq '.'
TASK_ID=$(echo "$TASK_RESULT" | jq -r '.task.id')

echo ""
echo "➕ 添加子任务..."
curl -s -X POST "$BASE_URL/tasks/$TASK_ID/subtasks" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-coder",
    "description": "实现登录接口",
    "dependencies": []
  }' | jq '.'

echo ""
curl -s -X POST "$BASE_URL/tasks/$TASK_ID/subtasks" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-writer",
    "description": "编写API文档",
    "dependencies": []
  }' | jq '.'

echo ""
echo "▶️ 启动任务..."
curl -s -X POST "$BASE_URL/tasks/$TASK_ID/start" | jq '.'

echo ""
echo "📊 获取可执行的子任务..."
curl -s "$BASE_URL/tasks/$TASK_ID/runnable" | jq '.'

echo ""

# 测试6: 智能委托
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 测试6: 智能委托"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🎯 发起智能委托（代码任务）..."
curl -s -X POST "$BASE_URL/delegate" \
  -H "Content-Type: application/json" \
  -d '{
    "initiator_id": "agent-coder",
    "name": "修复bug",
    "description": "修复登录接口的token验证错误",
    "requiredSkills": ["code", "debug"],
    "requiredDomains": ["backend"],
    "priority": "high"
  }' | jq '.'

echo ""
echo "🎯 发起智能委托（文档任务）..."
curl -s -X POST "$BASE_URL/delegate" \
  -H "Content-Type: application/json" \
  -d '{
    "initiator_id": "agent-coder",
    "name": "编写文档",
    "description": "为新功能编写完整的使用文档",
    "requiredSkills": ["write", "edit"],
    "requiredDomains": ["documentation"],
    "priority": "normal"
  }' | jq '.'

echo ""

# 测试7: 统计信息
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 测试7: 综合统计"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "📊 能力统计..."
curl -s "$BASE_URL/abilities/stats" | jq '.'

echo ""
echo "📊 消息统计..."
curl -s "$BASE_URL/messages/stats" | jq '.'

echo ""
echo "📊 任务统计..."
curl -s "$BASE_URL/tasks/stats" | jq '.'

echo ""
echo "📊 委托历史..."
curl -s "$BASE_URL/delegate/history?limit=5" | jq '.'

echo ""
echo "📊 系统综合统计..."
curl -s "$BASE_URL/stats" | jq '.'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 测试完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
