#!/bin/bash

echo "🛑 停止 MOSS AI 系统..."
echo "=================================="

# 停止桌面应用
if [ -f "desktop.pid" ]; then
    DESKTOP_PID=$(cat desktop.pid)
    if kill $DESKTOP_PID 2>/dev/null; then
        echo "✅ 停止桌面应用 (PID: $DESKTOP_PID)"
    else
        echo "⚠️  桌面应用进程已停止"
    fi
    rm -f desktop.pid
else
    echo "⚠️  未找到桌面应用 PID 文件"
fi

# 停止所有 Electron 进程
pkill -f "electron\s+\." 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 停止 Electron 进程"
else
    echo "⚠️  无 Electron 进程在运行"
fi

# 停止后端服务
if [ -f "backend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    if kill $BACKEND_PID 2>/dev/null; then
        echo "✅ 停止后端服务 (PID: $BACKEND_PID)"
    else
        echo "⚠️  后端服务进程已停止"
    fi
    rm -f backend.pid
else
    echo "⚠️  未找到后端服务 PID 文件"
fi

# 停止所有 node server.js 进程
pkill -f "node server.js" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ 停止 Node.js 服务进程"
else
    echo "⚠️  无 Node.js 服务进程在运行"
fi

# 清理
sleep 1
echo ""
echo "清理完成!"
echo "=================================="