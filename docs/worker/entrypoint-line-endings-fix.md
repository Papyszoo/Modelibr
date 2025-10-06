# Thumbnail Worker Entrypoint Line Endings Fix

## Problem
After PR #207, the thumbnail-worker container fails to start with the error:
```
exec /app/docker-entrypoint.sh: no such file or directory
```

This error occurs even though the `docker-entrypoint.sh` file exists in the Docker image.

## Root Cause Analysis

### The Misleading Error Message
The error "no such file or directory" when the file clearly exists is a classic symptom of **Windows line ending (CRLF) issues** in shell scripts.

When a shell script has Windows line endings (`\r\n` instead of Unix `\n`), the kernel cannot find the interpreter specified in the shebang line. For example:
- Shebang with Unix endings: `#!/bin/sh\n` → kernel looks for `/bin/sh` ✅
- Shebang with Windows endings: `#!/bin/sh\r\n` → kernel looks for `/bin/sh\r` ❌

The error message "no such file or directory" refers to the **interpreter** (`/bin/sh\r`), not the script file itself.

### How This Happened
1. PR #207 added `src/worker-service/docker-entrypoint.sh`
2. The repository had no `.gitattributes` file to control line endings
3. When developers on Windows check out the repository with `core.autocrlf=true` (the default), Git converts LF to CRLF
4. The Docker build copies the script with CRLF line endings into the image
5. The Linux kernel in the Docker container cannot execute the script due to the CRLF in the shebang

### Why It Worked on Linux/macOS
- Linux and macOS use LF line endings natively
- Git with `core.autocrlf=false` or `input` preserves LF endings
- The script works fine when it has Unix line endings

## Solution

### Root Cause Fix
Added a `.gitattributes` file to enforce LF line endings for shell scripts across all platforms:

```gitattributes
# Ensure shell scripts always use LF line endings, even on Windows
# This prevents "exec: no such file or directory" errors in Docker containers
*.sh text eol=lf

# Ensure Dockerfile-related files use LF endings
Dockerfile text eol=lf
*.dockerfile text eol=lf
```

### How This Fixes the Problem
1. **Git enforces LF endings**: All `.sh` files will checkout with LF endings, regardless of platform or `core.autocrlf` setting
2. **Cross-platform consistency**: Windows developers will have LF endings in their working directory
3. **Docker build safety**: The `COPY . .` command always copies files with correct line endings
4. **Future-proof**: Any new shell scripts added to the repository will automatically have LF endings

## Verification

### Verify Attributes Are Applied
```bash
git check-attr -a src/worker-service/docker-entrypoint.sh
```

Expected output:
```
src/worker-service/docker-entrypoint.sh: text: set
src/worker-service/docker-entrypoint.sh: eol: lf
```

### Verify Line Endings
```bash
# Check file format
file src/worker-service/docker-entrypoint.sh
# Should show: POSIX shell script, ASCII text executable (no mention of CRLF)

# Check hex dump of shebang
head -1 src/worker-service/docker-entrypoint.sh | od -An -tx1 | head -1
# Should end with '0a' (LF), not '0d 0a' (CRLF)
```

### Verify Docker Container Works
```bash
# Build the image
docker compose build thumbnail-worker

# Run the container
docker run --rm thumbnail-worker

# Should see startup logs immediately:
# info: Starting Modelibr Thumbnail Worker Service
# info: Configuration validated successfully
# info: Worker configuration
# info: Health server started
```

## Alternative Solutions Considered

1. **Fix core.autocrlf on Windows**: Requires all Windows developers to change their Git config - not scalable
2. **dos2unix in Dockerfile**: Adds complexity and doesn't fix the root cause - files should be correct in Git
3. **Normalize line endings manually**: Error-prone and requires remembering to do it for every shell script
4. **Use .editorconfig**: Doesn't affect Git checkout behavior, only editor behavior

## Files Changed
- `.gitattributes` - New file enforcing LF line endings for shell scripts and Dockerfiles

## Prevention
With the `.gitattributes` file in place:
- ✅ Shell scripts will always have LF endings when checked out
- ✅ Docker builds will always copy scripts with correct line endings
- ✅ The "exec: no such file or directory" error cannot occur due to line endings
- ✅ Works consistently across Windows, macOS, and Linux

## Related Issues
- This fix complements PR #207 which introduced the `docker-entrypoint.sh` script
- See `container-no-logs-fix.md` for the original issue that necessitated the custom entrypoint script
