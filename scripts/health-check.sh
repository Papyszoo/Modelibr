#!/bin/bash
# Alternative health check script for Docker container
# This provides a fallback option if curl-based health check fails

PORT=${1:-8080}
URL="http://127.0.0.1:${PORT}/health"

# Try curl first (primary method)
if command -v curl > /dev/null 2>&1; then
    curl -f "$URL" > /dev/null 2>&1
    exit $?
fi

# Fallback: Use wget if available
if command -v wget > /dev/null 2>&1; then
    wget --quiet --spider "$URL"
    exit $?
fi

# Fallback: Use PowerShell if available (for Windows containers)
if command -v pwsh > /dev/null 2>&1; then
    pwsh -Command "
        try {
            \$response = Invoke-WebRequest -Uri '$URL' -UseBasicParsing -TimeoutSec 5
            if (\$response.StatusCode -eq 200) { exit 0 } else { exit 1 }
        } catch {
            exit 1
        }
    "
    exit $?
fi

# Fallback: Use netcat to check if port is open
if command -v nc > /dev/null 2>&1; then
    nc -z 127.0.0.1 "$PORT"
    exit $?
fi

# Final fallback: Use built-in bash networking (may not work in all containers)
exec 3<>"/dev/tcp/127.0.0.1/${PORT}"
if [ $? -eq 0 ]; then
    echo -e "GET /health HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n" >&3
    response=$(cat <&3)
    exec 3<&-
    if [[ "$response" == *"200 OK"* ]] || [[ "$response" == *"Healthy"* ]]; then
        exit 0
    fi
fi

exit 1