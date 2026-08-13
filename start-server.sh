#!/bin/bash
# Persistent dev server starter - survives across bash sessions
# Uses setsid + nohup to fully detach from the parent process

cd /home/z/my-project

# Check if already running
if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
  echo "Server already running on port 3000"
  exit 0
fi

# Kill any stale processes
pkill -9 -f "next dev" 2>/dev/null
sleep 1

# Clear cache
rm -rf .next 2>/dev/null

# Start with full detachment
# setsid = new session (survives parent death)
# nohup = ignore SIGHUP
# </dev/null = detach stdin
# & = background
# disown = remove from shell job table
setsid nohup ./node_modules/.bin/next dev -p 3000 > dev.log 2>&1 < /dev/null &
disown 2>/dev/null

# Wait for ready
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
    echo "Server ready on port 3000 after ${i}s"
    echo "PID: $(pgrep -f 'next dev' | head -1)"
    exit 0
  fi
  sleep 1
done

echo "Server failed to start"
tail -10 dev.log
exit 1
