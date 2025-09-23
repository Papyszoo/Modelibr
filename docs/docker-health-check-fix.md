# Docker Health Check Fix

This document explains the fix for the Docker health check issue that was causing the webapi container to be marked as unhealthy.

## Issue
After PR #74, the webapi container was failing health checks with the error:
```
dependency failed to start: container webapi is unhealthy
```

## Root Cause
The health check was failing due to two main issues:

1. **Missing curl in final container**: The Dockerfile installed curl in the build stage but not in the final runtime stage
2. **Network addressing**: Using `localhost` instead of `127.0.0.1` for more reliable container networking

## Solution
The fix involved two changes:

### 1. Install curl in final Docker stage
Updated `src/WebApi/Dockerfile` to install curl in the final container stage:

```dockerfile
# Final stage
FROM base AS final
# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
```

### 2. Update health check address
Updated `docker-compose.yml` to use `127.0.0.1` instead of `localhost`:

```yaml
healthcheck:
    test: ["CMD-SHELL", "curl -f http://127.0.0.1:${WEBAPI_HTTP_PORT}/health || exit 1"]
```

### 3. Alternative health check script
Added a robust fallback health check script at `scripts/health-check.sh` that supports multiple methods:
- Primary: curl
- Fallback: wget, PowerShell, netcat, or raw TCP

## Usage
The standard Docker Compose health check now works:
```bash
docker compose up -d
```

If you need to use the alternative health check script:
```yaml
healthcheck:
    test: ["CMD-SHELL", "/usr/local/bin/health-check.sh ${WEBAPI_HTTP_PORT}"]
```

## Testing
To verify the health check works:

1. **Local testing**:
   ```bash
   # Start the service
   cd src/WebApi
   export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
   export ASPNETCORE_HTTP_PORTS=8080
   dotnet run
   
   # Test health endpoint
   curl http://localhost:8080/health
   curl http://127.0.0.1:8080/health
   
   # Test health check script
   ./scripts/health-check.sh 8080
   ```

2. **Docker testing**:
   ```bash
   docker compose up -d
   docker compose ps  # Should show webapi as healthy
   ```

## Expected Response
The health endpoint should return:
```json
{
  "status": "Healthy",
  "database": "Connected|Disconnected|Error: ...",
  "fileCount": 0,
  "modelCount": 0,
  "timestamp": "2025-09-23T16:00:00.000Z"
}
```

The application is considered healthy even if the database is disconnected, ensuring the container starts properly even before the database is ready.