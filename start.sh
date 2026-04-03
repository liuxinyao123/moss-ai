#!/bin/bash

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_PID_FILE="$ROOT_DIR/backend.pid"
DESKTOP_PID_FILE="$ROOT_DIR/desktop.pid"
AGENTS_URL="http://localhost:3001/api/agents"

mkdir -p "$LOG_DIR"

fetch_agents() {
    curl --noproxy "*" -fsS "$AGENTS_URL"
}

wait_for_backend() {
    local attempts="${1:-10}"
    local i
    for ((i=1; i<=attempts; i++)); do
        if fetch_agents > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

echo "🚀 启动 MOSS AI 系统 (v2.0 - OpenHanako 架构重构)"
echo "=================================="

# 检查是否已经有进程在运行
if [ -f "$BACKEND_PID_FILE" ] && kill -0 $(<"$BACKEND_PID_FILE") 2>/dev/null; then
    echo "⚠️  后端服务已经在运行 (PID: $(<"$BACKEND_PID_FILE"))"
else
    echo "启动后端服务 (新架构 core/lib/hub/server)..."
    cd "$ROOT_DIR/server" || exit 1
    nohup node index.js > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    cd "$ROOT_DIR" || exit 1
    echo "✅ 后端服务已启动 (PID: $(<"$BACKEND_PID_FILE"))"
fi

# 检查后端是否正常
echo "检查后端服务..."
if wait_for_backend 15; then
    echo "✅ 后端服务正常"
else
    echo "❌ 后端服务无法访问，请检查 logs/backend.log"
    exit 1
fi

# 检查是否已经有桌面应用在运行
if pgrep -f "electron\\s+\\." > /dev/null; then
    echo "⚠️  桌面应用已经在运行"
else
    echo "启动桌面应用..."
    cd "$ROOT_DIR/desktop" || exit 1
    unset ELECTRON_RUN_AS_NODE
    nohup npm start > "$LOG_DIR/desktop.log" 2>&1 &
    echo $! > "$DESKTOP_PID_FILE"
    cd "$ROOT_DIR" || exit 1
    echo "✅ 桌面应用已启动 (PID: $(<"$DESKTOP_PID_FILE"))"
fi

echo ""
echo "=================================="
echo "🎉 MOSS AI 系统已启动 (v2.0)"
echo ""
echo "📊 后端服务: http://localhost:3001"
echo "   Health: http://localhost:3001/health"
echo "🖥️  桌面应用: 已启动 (Electron)"
echo ""
echo "📋 API端点:"
echo "  • GET /api/health - 健康检查"
echo "  • GET /api/agents - 智能体列表"
echo "  • GET /api/skills - 技能列表"
echo "  • GET /api/personality/templates - 人格模板列表"
echo ""
echo "📋 智能体列表:"
AGENTS_JSON="$(fetch_agents 2>/dev/null || true)"
if [ -z "$AGENTS_JSON" ]; then
    echo "  • 暂时无法获取智能体列表"
else
AGENTS_JSON="$AGENTS_JSON" python3 - <<'PY'
import json
import os

raw = os.environ.get("AGENTS_JSON", "").strip()
try:
    data = json.loads(raw)
    if 'agents' in data:
        agents = data['agents']
        for agent in agents:
            print(f"  • {agent.get('name', '未命名智能体')} ({str(agent.get('id', ''))[:10]}...)")
    else:
        print("  • 无智能体数据")
except json.JSONDecodeError:
    print("  • 智能体列表返回格式异常")
PY
fi
echo ""
echo "📁 日志文件:"
echo "  • logs/backend.log"
echo "  • logs/desktop.log"
echo ""
echo "🛑 停止系统: ./stop.sh"
echo "🧪 运行测试: npm run test"
echo "=================================="
