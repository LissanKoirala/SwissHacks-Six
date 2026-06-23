#!/usr/bin/env bash
# watchdog.sh — keep the deployment alive during the demo. Polls backend + frontend health every
# 15s and, if either has been down for 2 consecutive checks (~30s, so a normal manual restart never
# trips it), restarts just that service via restart.sh. Self-healing if a process crashes or OOMs.
#
# Run it detached, as lissan:
#   screen -dmS watchdog /home/lissan/SwissHacks-Six/watchdog.sh
# Watch it:
#   tail -f /tmp/watchdog.log
set -uo pipefail

REPO=/home/lissan/SwissHacks-Six
LOG=/tmp/watchdog.log
INTERVAL=15
THRESHOLD=2   # consecutive failures before acting (avoids tripping on a normal restart)

bfail=0
ffail=0
ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "$(ts) watchdog started (interval=${INTERVAL}s threshold=${THRESHOLD})" >> "$LOG"
while true; do
  b=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:8000/docs 2>/dev/null); b=${b:-000}
  f=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:3000 2>/dev/null); f=${f:-000}

  if [ "$b" = "000" ]; then bfail=$((bfail + 1)); else bfail=0; fi
  if [ "$f" != "200" ]; then ffail=$((ffail + 1)); else ffail=0; fi

  if [ "$bfail" -ge "$THRESHOLD" ]; then
    echo "$(ts) backend DOWN (code=$b, ${bfail}x) — restarting" >> "$LOG"
    "$REPO/restart.sh" backend >> "$LOG" 2>&1 || echo "$(ts) backend restart returned non-zero" >> "$LOG"
    bfail=0
  fi
  if [ "$ffail" -ge "$THRESHOLD" ]; then
    echo "$(ts) frontend DOWN (code=$f, ${ffail}x) — restarting" >> "$LOG"
    "$REPO/restart.sh" frontend >> "$LOG" 2>&1 || echo "$(ts) frontend restart returned non-zero" >> "$LOG"
    ffail=0
  fi

  sleep "$INTERVAL"
done
