#!/bin/sh
set -e

# Start Xvfb in the background
Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!

# Set DISPLAY environment variable
export DISPLAY=:99

# Give Xvfb a moment to start
sleep 1

# Start node application
# Using exec to replace the shell process
exec node index.js
