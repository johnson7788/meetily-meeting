#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
log() { echo "[$(date '+%H:%M:%S')] $*"; }

cleanup() {
  log "正在停止服务..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  log "已停止"
}
trap cleanup EXIT INT TERM

# ---- Backend ----
log "启动后端..."
cd "$ROOT_DIR/backend"
if [ ! -d .venv ]; then
  echo "✗ .venv 不存在, 请先运行 prepare.sh"
  exit 1
fi
uv run --env-file "$ROOT_DIR/.env" uvicorn app.main:app --host 0.0.0.0 --port 5167 --reload &
BACKEND_PID=$!

# ---- Frontend ----
log "启动前端..."
cd "$ROOT_DIR/frontend"
if [ ! -d node_modules ]; then
  echo "✗ node_modules 不存在, 请先运行 prepare.sh"
  exit 1
fi
npm run dev &
FRONTEND_PID=$!

log "后端 PID: $BACKEND_PID"
log "前端 PID: $FRONTEND_PID"
log "按 Ctrl+C 停止所有服务"

wait
