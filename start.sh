#!/bin/bash

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_PID_FILE="$ROOT_DIR/backend.pid"
CLAWX_PID_FILE="$ROOT_DIR/clawx.pid"
AGENTS_URL="http://localhost:3001/api/agents"

# 与 moss-ai 并列：~/.openclaw/workspace/ClawX
CLAWX_DIR="${CLAWX_DIR:-$(cd "$ROOT_DIR/.." && pwd)/ClawX}"

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

echo "🚀 启动 DSClaw API + ClawX（OpenClaw 图形客户端）"
echo "=================================="
echo "📂 ClawX 目录: $CLAWX_DIR"
echo ""

if [ -f "$BACKEND_PID_FILE" ] && kill -0 $(<"$BACKEND_PID_FILE") 2>/dev/null; then
    echo "⚠️  API 服务已在运行 (PID: $(<"$BACKEND_PID_FILE"))"
else
    echo "启动 API（backend/server.js，端口 3001）..."
    cd "$ROOT_DIR" || exit 1
    nohup node backend/server.js > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "✅ API 已启动 (PID: $(<"$BACKEND_PID_FILE"))"
fi

echo "检查 API..."
if wait_for_backend 15; then
    echo "✅ /api/agents 可访问"
else
    echo "❌ API 无法访问，请检查 logs/backend.log"
    exit 1
fi

if [ ! -f "$CLAWX_DIR/package.json" ]; then
    echo ""
    echo "❌ 未找到 ClawX（需要: $CLAWX_DIR/package.json）"
    echo "   请把 ClawX 放在与 moss-ai 同一父目录下，或设置环境变量 CLAWX_DIR=/path/to/ClawX"
    exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
    echo ""
    echo "❌ 未找到 pnpm，无法启动 ClawX。请先安装 pnpm，或在 ClawX 目录手动执行: pnpm dev"
    exit 1
fi
if [ -f "$CLAWX_PID_FILE" ] && kill -0 $(<"$CLAWX_PID_FILE") 2>/dev/null; then
    echo "⚠️  ClawX 开发进程已在记录中 (PID: $(<"$CLAWX_PID_FILE"))，跳过重复启动"
else
    echo "启动 ClawX（pnpm dev）..."
    cd "$CLAWX_DIR" || exit 1
    # 若 ELECTRON_RUN_AS_NODE 被设置，Electron 会以 Node 模式跑主进程，require('electron').app 为 undefined 会直接崩溃
    nohup env -u ELECTRON_RUN_AS_NODE pnpm dev > "$LOG_DIR/clawx.log" 2>&1 &
    echo $! > "$CLAWX_PID_FILE"
    cd "$ROOT_DIR" || exit 1
    echo "✅ ClawX 已后台启动 (PID: $(<"$CLAWX_PID_FILE"))，日志 logs/clawx.log"
    echo "   （首次会较久，请看 clawx.log 是否出现本地 URL / Electron）"
fi

echo ""
echo "=================================="
echo "🎉 就绪"
echo ""
echo "📊 DSClaw API: http://localhost:3001"
echo "🖥️  图形界面: ClawX（OpenClaw）— 日志见 logs/clawx.log"
echo ""
echo "📋 智能体列表（API）:"
AGENTS_JSON="$(fetch_agents 2>/dev/null || true)"
if [ -z "$AGENTS_JSON" ]; then
    echo "  • 暂时无法获取"
else
AGENTS_JSON="$AGENTS_JSON" python3 - <<'PY'
import json
import os

raw = os.environ.get("AGENTS_JSON", "").strip()
try:
    data = json.loads(raw)
    if 'agents' in data:
        for agent in data['agents']:
            print(f"  • {agent.get('name', '未命名')} ({str(agent.get('id', ''))[:10]}...)")
    else:
        print("  • 无数据")
except json.JSONDecodeError:
    print("  • 格式异常")
PY
fi
echo ""
echo "📁 日志: logs/backend.log · logs/clawx.log"
echo "🛑 停止: ./stop.sh"
echo "=================================="
