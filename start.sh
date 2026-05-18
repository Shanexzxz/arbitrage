#!/usr/bin/env bash
# arbitrage 启动脚本（参考 ai-kanban / Daily Digest 的写法）
# 用法：
#   ./start.sh           # 前台启动（Ctrl+C 退出）
#   ./start.sh -d        # 后台启动（detached）
#   ./start.sh stop      # 停止后台实例
#   ./start.sh restart   # 重启
#   ./start.sh status    # 查看状态
#   ./start.sh logs      # tail -f 日志

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-3001}"
HOST="${HOST:-0.0.0.0}"
ENTRY="${ENTRY:-$SCRIPT_DIR/server/proxy.js}"
LOG="$SCRIPT_DIR/server.log"
PID_FILE="$SCRIPT_DIR/.server.pid"

# 载入 .env（如果存在）
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/.env"
  set +a
fi

# 把常见 node 安装路径加入 PATH
for p in /usr/local/bin /root/.workbuddy/binaries/node/versions/*/bin "$HOME/.nvm/versions/node/*/bin"; do
  for dir in $p; do
    [[ -d "$dir" ]] && PATH="$dir:$PATH"
  done
done
export PATH PORT HOST

_running_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && { echo "$pid"; return 0; }
  rm -f "$PID_FILE"
  return 1
}

_ensure_deps() {
  if [[ ! -d "$SCRIPT_DIR/server/node_modules" ]]; then
    echo ">>> 首次运行，安装 server/node_modules ..."
    (cd "$SCRIPT_DIR/server" && npm install --no-audit --no-fund) || {
      echo "❌ npm install 失败"; exit 1; }
  fi
}

_spawn() {
  # 滚动旧日志，保留崩溃现场（最多保留 5 份）
  if [[ -f "$LOG" && -s "$LOG" ]]; then
    for i in 4 3 2 1; do
      [[ -f "$LOG.$i" ]] && mv "$LOG.$i" "$LOG.$((i+1))"
    done
    mv "$LOG" "$LOG.1"
  fi
  # 完全脱离当前 shell/session：setsid 新会话 + nohup 忽略 HUP + 标准描述符重定向
  setsid nohup env PORT="$PORT" HOST="$HOST" node "$ENTRY" > "$LOG" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  disown 2>/dev/null || true
  # 等服务 ready（最多 10 秒）
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if kill -0 "$pid" 2>/dev/null && ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
      return 0
    fi
  done
}

cmd_start_fg() {
  _ensure_deps
  echo ">>> 前台启动 arbitrage on $HOST:$PORT (entry=$ENTRY)"
  exec env PORT="$PORT" HOST="$HOST" node "$ENTRY"
}

cmd_start_bg() {
  if pid=$(_running_pid); then
    echo "⚠️  已在运行 (pid=$pid)。用 ./start.sh restart 重启。"
    exit 0
  fi
  # 检查端口占用（不是自己）
  if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo "❌ 端口 $PORT 已被占用："
    ss -tlnp 2>/dev/null | grep ":$PORT "
    exit 1
  fi
  _ensure_deps
  echo ">>> 后台启动 arbitrage on $HOST:$PORT (entry=$ENTRY)"
  _spawn
  if pid=$(_running_pid); then
    echo "✅ pid=$pid · log: $LOG"
    sleep 1
    tail -n 10 "$LOG" 2>/dev/null || true
  else
    echo "❌ 启动失败，请查看日志：$LOG"
    tail -n 30 "$LOG" 2>/dev/null || true
    exit 1
  fi
}

cmd_stop() {
  if pid=$(_running_pid); then
    echo ">>> 停止 pid=$pid"
    kill "$pid" 2>/dev/null || true
    sleep 2
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    # 清理孤儿进程（精确匹配项目入口路径，避免误杀其他 node 进程）
    pkill -9 -f "node $ENTRY" 2>/dev/null || true
    echo "✅ 已停止"
  else
    if pgrep -f "node $ENTRY" >/dev/null; then
      pkill -9 -f "node $ENTRY" 2>/dev/null || true
      echo "✅ 已清理孤儿进程"
    else
      echo "未在运行"
    fi
  fi
}

cmd_status() {
  if pid=$(_running_pid); then
    echo "✅ 运行中 (pid=$pid)"
    ss -tlnp 2>/dev/null | grep ":$PORT " || netstat -tlnp 2>/dev/null | grep ":$PORT " || true
    curl -sS -o /dev/null -w "   health: HTTP %{http_code}\n" --max-time 3 "http://127.0.0.1:$PORT/" 2>&1 || true
  else
    echo "❌ 未运行"
  fi
}

cmd_logs() {
  [[ -f "$LOG" ]] || { echo "没有日志文件: $LOG"; exit 1; }
  tail -n 100 -f "$LOG"
}

case "${1:-}" in
  ""|start)         cmd_start_fg ;;
  -d|--detach|bg)   cmd_start_bg ;;
  stop)             cmd_stop ;;
  restart)          cmd_stop; cmd_start_bg ;;
  status)           cmd_status ;;
  logs|log)         cmd_logs ;;
  *)
    cat <<EOF
Usage: $0 [command]

Commands:
  (no arg) | start   前台启动
  -d       | bg      后台启动（独立进程）
  stop               停止后台实例
  restart            重启（= stop + bg）
  status             查看运行状态
  logs               tail -f 日志

环境变量（可在 .env 中配置）：
  PORT=3001                          监听端口
  HOST=0.0.0.0                       监听地址
  ENTRY=$SCRIPT_DIR/server/proxy.js  Node 入口文件
EOF
    exit 1
    ;;
esac
