#!/bin/bash

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAWX_PID_FILE="$ROOT_DIR/clawx.pid"
CLAWX_DIR="${CLAWX_DIR:-$(cd "$ROOT_DIR/.." && pwd)/ClawX}"

echo "🛑 停止 DSClaw / ClawX 相关进程..."
echo "=================================="

# ClawX（start.sh 里 nohup 的 pnpm dev 根进程）
if [ -f "$CLAWX_PID_FILE" ]; then
    CLAWX_PID=$(cat "$CLAWX_PID_FILE")
    if kill "$CLAWX_PID" 2>/dev/null; then
        echo "✅ 已向 ClawX 启动进程发送停止信号 (PID: $CLAWX_PID)"
    else
        echo "⚠️  ClawX PID 文件存在但进程可能已退出"
    fi
    rm -f "$CLAWX_PID_FILE"
else
    echo "⚠️  未找到 clawx.pid（若 ClawX 仍在运行，请手动关窗口或在 ClawX 目录 Ctrl+C）"
fi

# pnpm 退出后 Electron 常仍占用 ClawX 单例锁；仅匹配本 ClawX 目录下的 Electron，不误杀其它应用
if [ -d "$CLAWX_DIR" ]; then
    if pkill -f "${CLAWX_DIR}/node_modules/.pnpm/electron" 2>/dev/null; then
        echo "✅ 已结束本目录 ClawX 的 Electron（pnpm 布局）"
    elif pkill -f "${CLAWX_DIR}/node_modules/electron/dist/Electron" 2>/dev/null; then
        echo "✅ 已结束本目录 ClawX 的 Electron（npm 布局）"
    fi
fi
sleep 1

# API
if [ -f "backend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    if kill "$BACKEND_PID" 2>/dev/null; then
        echo "✅ 停止 API (PID: $BACKEND_PID)"
    fi
    rm -f backend.pid
fi

pkill -f "node backend/server.js" 2>/dev/null && echo "✅ 已结束 node backend/server.js"
pkill -f "node server/index.js" 2>/dev/null && echo "✅ 已结束 node server/index.js（引擎模式）"

# 注意：不再全局 pkill electron，以免误杀你机器上其它 Electron 应用。
# 若 ClawX 子进程未随 pnpm 退出，请关闭 ClawX 窗口。

sleep 1
echo ""
echo "清理完成!"
echo "=================================="
