#!/bin/bash
# MiMo AI - Persistent Dev Server (survives sandbox process cleanup)
# This script uses a double-fork technique to fully detach from the parent
# process group, so the server stays alive even when bash sessions end.

cd /home/z/my-project

# Check if already running
if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
  echo "ALIVE: Server already running on port 3000"
  curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3000/
  exit 0
fi

# Kill stale processes
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "next dev" 2>/dev/null
sleep 2

# Clear cache for clean state
rm -rf .next 2>/dev/null

# Double-fork: create a completely detached process
# 1. setsid = new session (no controlling terminal)
# 2. Double fork = orphan the child so init adopts it
(
  # First fork
  setsid bash -c '
    # Second fork inside new session
    (
      exec ./node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1
    ) &
    echo $! > /home/z/my-project/.server.pid
    disown
  ' &
  disown
) 2>/dev/null

# Wait for server to be ready
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
    echo "READY: Server started on port 3000 after ${i}s"
    # Verify it's actually serving
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
    echo "  HTTP status: $HTTP"
    # Verify API
    AGENTS=$(curl -s http://localhost:3000/api/agents 2>/dev/null | head -c 50)
    if echo "$AGENTS" | grep -q "agents"; then
      echo "  API: working"
    fi
    exit 0
  fi
  sleep 1
done

echo "FAILED: Server did not start in time"
tail -10 /home/z/my-project/dev.log
exit 1
