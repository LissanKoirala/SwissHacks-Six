#!/usr/bin/env bash
# restart.sh — (re)start the Advisory Workbench deployment.
#
# The servers run as the `lissan` user in two detached `screen` sessions named `backend` and
# `frontend`. This script can be run as root or as lissan; it always (re)starts the screens as
# lissan with the exact deployment commands.
#
# Usage:
#   ./restart.sh             restart both servers (serves the existing frontend build)
#   ./restart.sh --build     rebuild the frontend (npm install + npm run build) first, then restart
#                            both (use this after pulling frontend changes)
#   ./restart.sh backend     (re)start only the backend
#   ./restart.sh frontend    (re)start only the frontend  (add --build to rebuild it first)
set -uo pipefail

REPO=/home/lissan/SwissHacks-Six
RUN_USER=lissan

# Run a command as the deploy user (no-op wrapper if already lissan).
as_user() {
  if [ "$(id -un)" = "$RUN_USER" ]; then bash -lc "$1"; else su "$RUN_USER" -c "$1"; fi
}

start_backend() {
  as_user "screen -S backend -X quit" >/dev/null 2>&1 || true
  sleep 1
  as_user "screen -dmS backend bash -c 'cd ~/SwissHacks-Six/backend && export WORKBENCH_CACHE_DIR=~/SwissHacks-Six/.wbcache && export DATABASE_URL=\"sqlite:////home/lissan/SwissHacks-Six/backend/data/workbench-deploy.db\" && exec ~/.venvs/workbench/bin/uvicorn app:app --host 127.0.0.1 --port 8000 2>&1 | tee /tmp/backend.log'"
}

start_frontend() {
  as_user "screen -S frontend -X quit" >/dev/null 2>&1 || true
  sleep 1
  as_user "screen -dmS frontend bash -c 'cd ~/SwissHacks-Six/frontend && exec npm start -- --port 3000 2>&1 | tee /tmp/frontend.log'"
}

build_frontend() {
  echo "==> installing frontend deps (npm install)"
  as_user "cd $REPO/frontend && npm install --no-audit --no-fund > /tmp/frontend-build.log 2>&1" || { echo "!! npm install failed:"; tail -15 /tmp/frontend-build.log; exit 1; }
  echo "==> building frontend (npm run build)"
  as_user "cd $REPO/frontend && npm run build > /tmp/frontend-build.log 2>&1"; rc=$?
  tail -12 /tmp/frontend-build.log
  [ "$rc" -ne 0 ] && { echo "!! frontend build failed — aborting, servers left as-is"; exit 1; }
}

health() {
  b=$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:8000/docs 2>/dev/null); b=${b:-000}
  f=$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:3000 2>/dev/null); f=${f:-000}
}

TARGET=both
REBUILD=0
for a in "$@"; do
  case "$a" in
    --build) REBUILD=1 ;;
    backend) TARGET=backend ;;
    frontend) TARGET=frontend ;;
    both) TARGET=both ;;
    *) echo "unknown arg: $a (use: --build | backend | frontend)"; exit 2 ;;
  esac
done

case "$TARGET" in
  backend)
    echo "==> restarting backend"; start_backend ;;
  frontend)
    [ "$REBUILD" = 1 ] && build_frontend
    echo "==> restarting frontend"; start_frontend ;;
  both)
    [ "$REBUILD" = 1 ] && build_frontend
    echo "==> restarting backend + frontend"; start_backend; start_frontend ;;
esac

echo "==> waiting for health"
b=000; f=000
for _ in $(seq 1 45); do
  health
  case "$TARGET" in
    backend)  [ "$b" != "000" ] && break ;;
    frontend) [ "$f" = "200" ]  && break ;;
    both)     [ "$b" != "000" ] && [ "$f" = "200" ] && break ;;
  esac
  sleep 1
done
echo
echo "backend(8000)/docs: $b   frontend(3000): $f"
as_user "screen -ls" 2>/dev/null | grep -E '\.(backend|frontend)\b' || true

ok=1
case "$TARGET" in
  backend)  [ "$b" != "000" ] || ok=0 ;;
  frontend) [ "$f" = "200" ]  || ok=0 ;;
  both)     { [ "$b" != "000" ] && [ "$f" = "200" ]; } || ok=0 ;;
esac
[ "$ok" = 1 ] && echo "OK — up" || { echo "!! down — check /tmp/backend.log /tmp/frontend.log"; exit 1; }
