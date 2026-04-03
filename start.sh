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

echo "🚀 启动 MOSS AI（ClawX / OpenClaw 主路线 — API: backend/server.js）"
echo "=================================="
echo "💡 请先在本机安装并运行 ClawX，配置好 OpenClaw Gateway 与 ~/.openclaw/openclaw.json"
echo ""

# 检查是否已经有进程在运行
if [ -f "$BACKEND_PID_FILE" ] && kill -0 $(<"$BACKEND_PID_FILE") 2>/dev/null; then
    echo "⚠️  API 服务已在运行 (PID: $(<"$BACKEND_PID_FILE"))"
else
    echo "启动 API 服务（backend/server.js，端口 3001）..."
    cd "$ROOT_DIR" || exit 1
    nohup node backend/server.js > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "✅ API 服务已启动 (PID: $(<"$BACKEND_PID_FILE"))"
fi

echo "检查 API..."
if wait_for_backend 15; then
    echo "✅ API 正常（/api/agents 可访问）"
else
    echo "❌ API 无法访问，请检查 logs/backend.log"
    exit 1
fi

if pgrep -f "electron\\s+\\." > /dev/null; then
    echo "⚠️  桌面应用已经在运行"
else
    echo "启动桌面应用（Electron）..."
    cd "$ROOT_DIR/desktop" || exit 1
    unset ELECTRON_RUN_AS_NODE
    nohup npm start > "$LOG_DIR/desktop.log" 2>&1 &
    echo $! > "$DESKTOP_PID_FILE"
    cd "$ROOT_DIR" || exit 1
    echo "✅ 桌面应用已启动 (PID: $(<"$DESKTOP_PID_FILE"))"
fi

echo ""
echo "=================================="
echo "🎉 MOSS AI 已启动（ClawX 主路线）"
echo ""
echo "📊 API: http://localhost:3001"
echo "   Health: http://localhost:3001/health"
echo "🖥️  桌面: Electron（连接上述 API + 本机 OpenClaw）"
echo ""
echo "📋 常用 API:"
echo "  • GET /health /api/agents /api/skills"
echo "  • POST /api/chat — 经 OpenClaw（需在 ClawX 中配置 Gateway）"
echo "  • GET /api/openclaw/models — 与 openclaw.json 对齐"
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
echo "📁 日志: logs/backend.log · logs/desktop.log"
echo "🛑 停止: ./stop.sh"
echo "🧪 可选 v2 引擎进程（无 OpenClaw 全量 API）: npm run start:engine"
echo "=================================="
