#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
WEB_PORT="12018"
BACKEND_PORT="12067"
NO_CACHE=false
POLL_RETRIES=12
POLL_INTERVAL=5

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --no-cache       Build images without cache
  -h, --help       Show this help
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache) NO_CACHE=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown: $1"; usage ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "停止旧容器..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

BUILD_ARGS=("--pull")
$NO_CACHE && BUILD_ARGS+=("--no-cache")

log "构建镜像${NO_CACHE:+(无缓存)}..."
docker compose -f "$COMPOSE_FILE" build "${BUILD_ARGS[@]}"

log "启动服务..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate
docker compose -f "$COMPOSE_FILE" ps

log "等待后端健康..."
for ((i = 1; i <= POLL_RETRIES; i++)); do
  if curl -sf "http://localhost:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    log "✓ 后端正常 (第 ${i}s)"
    break
  fi
  if [[ $i -eq POLL_RETRIES ]]; then
    log "✗ 后端未就绪 (已等待 $((POLL_RETRIES * POLL_INTERVAL))s)"
    exit 1
  fi
  sleep "$POLL_INTERVAL"
done

log "验证前端..."
if curl -sf "http://localhost:${WEB_PORT}" -o /dev/null; then
  log "✓ 前端正常"
else
  log "✗ 前端未就绪"
fi

log "部署完成"
log "  日志:    docker compose -f ${COMPOSE_FILE} logs -f"
log "  后端:    http://localhost:${BACKEND_PORT}/health"
log "  前端:    http://localhost:${WEB_PORT}"
