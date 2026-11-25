#!/usr/bin/env bash
# Shared helpers for classroom demo start/check/stop. Sourced only — do not execute.
# shellcheck shell=bash

demo_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  printf '%s' "$here"
}

ROOT="$(demo_root)"
RUN_DIR="${DEMO_RUN_DIR:-$ROOT/var/demo-run}"
PID_FILE="$RUN_DIR/demo.pids"
URL_FILE="$RUN_DIR/api-public-url.txt"
PREV_URL_FILE="$RUN_DIR/api-public-url.prev.txt"
API_LOG="$RUN_DIR/api.log"
TUNNEL_LOG="$RUN_DIR/tunnel.log"
CAFFEINATE_LOG="$RUN_DIR/caffeinate.log"
ENV_FILE="${DEMO_ENV_FILE:-$ROOT/scripts/demo.env}"
DEVCONTAINER_ENV="${DEVCONTAINER_ENV:-$ROOT/.devcontainer/.env}"

demo_mkdir() {
  mkdir -p "$RUN_DIR" "$ROOT/apps/backend/var"
}

demo_load_env() {
  if [[ -f "$DEVCONTAINER_ENV" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$DEVCONTAINER_ENV"
    set +a
  fi
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi

  export MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
  export MYSQL_PORT="${MYSQL_PORT:-3306}"
  export MYSQL_DATABASE="${MYSQL_DATABASE:-questboard_presentation}"
  export DEMO_MYSQL_CONTAINER="${DEMO_MYSQL_CONTAINER:-test-app-mysql-container}"
  export DEMO_API_HOST="${DEMO_API_HOST:-127.0.0.1}"
  export DEMO_API_PORT="${DEMO_API_PORT:-8010}"
  export DEMO_TUNNEL_PROVIDER="${DEMO_TUNNEL_PROVIDER:-cloudflared}"
  export VITE_DISCUSSIONS_API="${VITE_DISCUSSIONS_API:-false}"
  export VITE_DISCUSSIONS_DEMO="${VITE_DISCUSSIONS_DEMO:-false}"

  if [[ -z "${PROOF_MEDIA_DIR:-}" ]]; then
    export PROOF_MEDIA_DIR="$ROOT/apps/backend/var/proof-media-presentation"
  fi
  mkdir -p "$PROOF_MEDIA_DIR"

  export JWT_SECRET_KEY="${JWT_SECRET_KEY:-${JWT_SECRET:-}}"
  if [[ -z "${JWT_SECRET_KEY:-}" ]]; then
    echo "ERROR: JWT_SECRET_KEY (or JWT_SECRET) is not set. Add it to .devcontainer/.env or scripts/demo.env." >&2
    return 1
  fi
  if [[ -z "${MYSQL_USER:-}" || -z "${MYSQL_PASSWORD:-}" ]]; then
    echo "ERROR: MYSQL_USER / MYSQL_PASSWORD missing. Copy from .devcontainer/.env into scripts/demo.env if needed." >&2
    return 1
  fi
}

demo_poetry_python() {
  if [[ -n "${DEMO_POETRY_PYTHON:-}" && -x "${DEMO_POETRY_PYTHON}" ]]; then
    printf '%s' "$DEMO_POETRY_PYTHON"
    return 0
  fi
  local candidate
  shopt -s nullglob
  for candidate in \
    "$HOME/Library/Caches/pypoetry/virtualenvs"/backend-api-*/bin/python \
    "$HOME/.cache/pypoetry/virtualenvs"/backend-api-*/bin/python; do
    if [[ -x "$candidate" ]]; then
      shopt -u nullglob
      printf '%s' "$candidate"
      return 0
    fi
  done
  shopt -u nullglob
  if command -v poetry >/dev/null 2>&1; then
    local env_path
    env_path="$(cd "$ROOT/apps/backend" && poetry env info -p 2>/dev/null || true)"
    if [[ -n "$env_path" && -x "$env_path/bin/python" ]]; then
      printf '%s' "$env_path/bin/python"
      return 0
    fi
  fi
  return 1
}

demo_tunnel_bin() {
  if [[ -n "${DEMO_TUNNEL_BIN:-}" && -x "${DEMO_TUNNEL_BIN}" ]]; then
    printf '%s' "$DEMO_TUNNEL_BIN"
    return 0
  fi
  if [[ -x "$ROOT/.tools/cloudflared" ]]; then
    printf '%s' "$ROOT/.tools/cloudflared"
    return 0
  fi
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return 0
  fi
  return 1
}

demo_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

demo_write_pids() {
  # KEY=pid lines. Only keys we manage.
  local key="$1" pid="$2"
  demo_mkdir
  touch "$PID_FILE"
  if grep -q "^${key}=" "$PID_FILE" 2>/dev/null; then
    # portable in-place replace
    local tmp
    tmp="$(mktemp)"
    awk -F= -v k="$key" -v p="$pid" 'BEGIN{OFS="="} $1==k{$2=p} {print}' "$PID_FILE" >"$tmp"
    mv "$tmp" "$PID_FILE"
  else
    printf '%s=%s\n' "$key" "$pid" >>"$PID_FILE"
  fi
}

demo_read_pid() {
  local key="$1"
  [[ -f "$PID_FILE" ]] || return 1
  awk -F= -v k="$key" '$1==k{print $2; found=1} END{exit !found}' "$PID_FILE"
}

demo_clear_pid() {
  local key="$1"
  [[ -f "$PID_FILE" ]] || return 0
  local tmp
  tmp="$(mktemp)"
  awk -F= -v k="$key" '$1!=k{print}' "$PID_FILE" >"$tmp"
  mv "$tmp" "$PID_FILE"
}

demo_kill_tracked() {
  local key="$1"
  local pid
  pid="$(demo_read_pid "$key" 2>/dev/null || true)"
  if demo_pid_alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    if demo_pid_alive "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "Stopped $key (pid $pid)."
  else
    echo "No running tracked process for $key."
  fi
  demo_clear_pid "$key"
}

port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

port_owner_pid() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n1
}

mysql_ping() {
  MYSQL_PWD="${MYSQL_PASSWORD}" mysqladmin ping \
    -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" --silent >/dev/null 2>&1
}

mysql_query() {
  MYSQL_PWD="${MYSQL_PASSWORD}" mysql \
    -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" \
    "$MYSQL_DATABASE" -N -e "$1"
}

api_health_url() {
  printf 'http://%s:%s/health' "$DEMO_API_HOST" "$DEMO_API_PORT"
}

wait_http_ok() {
  local url="$1" seconds="${2:-20}"
  local i
  for ((i = 0; i < seconds; i++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Start a long-lived process that survives the parent shell exiting.
# Prints the new PID on stdout. Logs go to $1; remaining args are the command.
demo_daemonize() {
  local log_file="$1"
  shift
  local pid
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" </dev/null >>"$log_file" 2>&1 &
    pid=$!
  else
    nohup "$@" </dev/null >>"$log_file" 2>&1 &
    pid=$!
    disown "$pid" 2>/dev/null || true
  fi
  # Double-check we did not capture a wrapper that already exited.
  sleep 0.2
  if ! kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  printf '%s' "$pid"
}
