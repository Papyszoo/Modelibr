#!/bin/sh
set -e

# Set DISPLAY environment variable first
export DISPLAY=:99

# Start Xvfb in the background
Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!

# Wait for Xvfb to be ready (check for X11 socket)
echo "Waiting for Xvfb to start..."
MAX_WAIT=10
WAIT_COUNT=0
while [ ! -S /tmp/.X11-unix/X99 ] && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  sleep 0.5
  WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ ! -S /tmp/.X11-unix/X99 ]; then
  echo "ERROR: Xvfb failed to start within ${MAX_WAIT} seconds"
  exit 1
fi

echo "Xvfb started successfully on display :99"

# Start node application
# Using exec to replace the shell process
exec node index.js
