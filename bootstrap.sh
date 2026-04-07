#!/usr/bin/env bash
# 首次克隆后安装依赖：根目录 npm + clawx/ pnpm
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "📦 DSClaw bootstrap — 安装依赖"
echo "================================"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未找到 node，请先安装 Node.js（建议 LTS）"
  exit 1
fi
echo "✅ Node: $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo ""
  echo "❌ 未找到 pnpm。ClawX 需要 pnpm，请先安装，例如："
  echo "   corepack enable && corepack prepare pnpm@latest --activate"
  echo "   或见 https://pnpm.io/installation"
  exit 1
fi
echo "✅ pnpm: $(pnpm -v)"

echo ""
echo "1/2  仓库根目录 npm install ..."
npm install

if [ -f "$ROOT_DIR/clawx/package.json" ]; then
  echo ""
  echo "2/2  clawx/ pnpm install ..."
  cd "$ROOT_DIR/clawx"
  pnpm install
  cd "$ROOT_DIR"
else
  echo ""
  echo "⚠️  未找到 clawx/package.json，已跳过 clawx 依赖。"
  echo "   若使用外部 ClawX，请在其目录自行 pnpm install，并用 CLAWX_DIR=... ./start.sh"
fi

echo ""
echo "================================"
echo "🎉 依赖安装完成"
echo ""
echo "下一步："
echo "  • 复制 backend/.env.example → backend/.env（按需）"
echo "  • 启动 API + 图形界面: ./start.sh   或   npm run start:clawx"
echo "  • 若 sqlite3 报错，可在仓库根执行: npm rebuild sqlite3"
echo "================================"
