#!/usr/bin/env bash
# arbitrage watchdog
# 每 20 秒检查一次服务健康。如果服务死了或端口没监听，就用 start.sh 重启它。
#
# 用法：
#   ./watchdog.sh start      # 后台常驻运行
#   ./watchdog.sh stop       # 停止 watchdog
#   ./watchdog.sh status     # 查看状态
#   ./watchdog.sh fg         # 前台运行（调试用）

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WATCHDOG_PID_FILE="$SCRIPT_DIR/.watchdog.pid"
WATCHDOG_LOG="$SCRIPT_DIR/watchdog.log"
INTERVAL="${WATCHDOG_INTERVAL:-20}"
PORT="${PORT:-3001}"
HEALTH_URL="${WATCHDOG_HEALTH_URL:-http://127.0.0.1:$PORT/}"
HEALTH_TIMEOUT=5

ts() { date '+%Y-%m-%d %H:%M:%S'; }

_watch_loop() {
  echo "$$" > "$WATCHDOG_PID_FILE"
  echo "[$(ts)] watchdog started (pid=$$, interval=${INTERVAL}s, url=$HEALTH_URL)" >> "$WATCHDOG_LOG"
  local consecutive_fails=0
  while :; do
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$HEALTH_TIMEOUT" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [[ "$code" != "200" && "$code" != "301" && "$code" != "302" ]]; then
      consecutive_fails=$((consecutive_fails + 1))
      echo "[$(ts)] health check failed: HTTP=$code (fail #$consecutive_fails)" >> "$WATCHDOG_LOG"
      if (( consecutive_fails >= 2 )); then
        echo "[$(ts)] restarting arbitrage via start.sh..." >> "$WATCHDOG_LOG"
        ./start.sh restart >> "$WATCHDOG_LOG" 2>&1 || true
        consecutive_fails=0
        sleep 5
      fi
      sleep "$INTERVAL"
      continue
    fi

    if (( consecutive_fails > 0 )); then
      echo "[$(ts)] recovered after $consecutive_fails failure(s)" >> "$WATCHDOG_LOG"
    fi
    consecutive_fails=0
    sleep "$INTERVAL"
  done
}

_alive() {
  [[ -f "$WATCHDOG_PID_FILE" ]] || return 1
  local pid
  pid=$(cat "$WATCHDOG_PID_FILE" 2>/dev/null)
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && { echo "$pid"; return 0; }
  rm -f "$WATCHDOG_PID_FILE"
  return 1
}

cmd_start() {
  if pid=$(_alive); then
    echo "⚠️  watchdog 已在运行 (pid=$pid)"
    exit 0
  fi
  rm -f "$WATCHDOG_PID_FILE"
  setsid nohup bash "$0" __loop > /dev/null 2>&1 < /dev/null &
  # _watch_loop 自己会写 pid 文件，等它出现
  for i in 1 2 3 4 5; do
    sleep 1
    if pid=$(_alive); then
      echo "✅ watchdog 已启动 (pid=$pid)"
      echo "   日志: $WATCHDOG_LOG"
      echo "   检查间隔: ${INTERVAL}s"
      return 0
    fi
  done
  echo "❌ watchdog 启动失败"
  exit 1
}

cmd_stop() {
  if pid=$(_alive); then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$WATCHDOG_PID_FILE"
    pkill -9 -f "watchdog.sh __loop" 2>/dev/null || true
    echo "✅ 已停止 watchdog"
  else
    pkill -9 -f "watchdog.sh __loop" 2>/dev/null || true
    echo "watchdog 未在运行"
  fi
}

cmd_status() {
  if pid=$(_alive); then
    echo "✅ watchdog 运行中 (pid=$pid)"
    ps -p "$pid" -o pid,ppid,etime,cmd
    echo
    echo "最近日志："
    tail -n 10 "$WATCHDOG_LOG" 2>/dev/null || echo "（无日志）"
  else
    echo "❌ watchdog 未运行"
  fi
}

case "${1:-status}" in
  __loop)   _watch_loop ;;
  start)    cmd_start ;;
  stop)     cmd_stop ;;
  status)   cmd_status ;;
  restart)  cmd_stop; sleep 1; cmd_start ;;
  fg|run)   _watch_loop ;;
  *)
    cat <<EOF
Usage: $0 {start|stop|status|restart|fg}

环境变量：
  WATCHDOG_INTERVAL=20       检查间隔（秒）
  PORT=3001                  服务端口
  WATCHDOG_HEALTH_URL=...    健康检查 URL（默认 http://127.0.0.1:\$PORT/）
EOF
    exit 1
    ;;
esac
