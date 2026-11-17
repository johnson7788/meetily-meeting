#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ---- Frontend ----
log "===== 前端 (Node.js) ====="
cd "$ROOT_DIR/frontend"

if ! command -v node &>/dev/null; then
  echo "✗ 请先安装 Node.js (>=18)"
  exit 1
fi
log "Node.js $(node -v)"

if [ ! -d node_modules ]; then
  log "安装前端依赖..."
  npm install
else
  log "node_modules 已存在, 跳过 (如需重装请删除 frontend/node_modules)"
fi

# ---- Backend ----
log "===== 后端 (Python) ====="
cd "$ROOT_DIR/backend"

if ! command -v uv &>/dev/null; then
  echo "✗ 请先安装 uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi
log "uv $(uv --version)"

if [ ! -d .venv ]; then
  log "创建虚拟环境并安装后端依赖..."
  uv sync
else
  log ".venv 已存在, 检查依赖是否最新..."
  uv sync 2>/dev/null || true
fi

log "===== 准备完成 ====="
