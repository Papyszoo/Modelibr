# E2E Testing Instructions for Modelibr

## Environment Overview

- **Development**: `docker-compose.yml` at root → localhost:3000 (frontend), localhost:5000 (API)
- **E2E Tests**: `tests/e2e/docker-compose.e2e.yml` → localhost:3002 (frontend), localhost:8090 (API), localhost:5433 (Postgres)

## Before Accessing E2E Application

The E2E environment is NOT running by default. Before accessing `localhost:3002`:

```bash
cd tests/e2e
docker compose -f docker-compose.e2e.yml up -d --build
```

Wait for containers to be healthy (about 20 seconds).

## Running E2E Tests

### Full Test Run (Recommended)
```bash
cd tests/e2e
node run-e2e.js
```

This script:
1. Cleans up existing containers
2. Removes `./data` directory (fresh database)
3. Starts containers with `--build`
4. Runs `npx bddgen` and `npx playwright test`
5. Cleans up containers and data after tests

### Manual Test Run (Debugging)
```bash
cd tests/e2e

# Start containers
docker compose -f docker-compose.e2e.yml down -v
rm -rf ./data
docker compose -f docker-compose.e2e.yml up -d --build

# Wait for healthy
sleep 25

# Generate tests and run
npx bddgen
npx playwright test --reporter=list

# View report
npx playwright show-report
```

### Running Specific Tests
```bash
# Run tests with @setup tag
npx playwright test --grep "@setup"

# Run specific test by name
npx playwright test --grep "Create blue_color"
```

## File Deduplication

The application deduplicates files by SHA256 hash:

1. **Model upload**: If same file hash exists, returns existing model (no new model created)
2. **Version upload**: Reuses existing file entity but creates new version

**Impact on Tests**: Each test scenario that creates a model must use a UNIQUE file. Available test files:
- `test-cube.glb`
- `test-torus.fbx`
- `test-cone.fbx`
- `test-cylinder.fbx`
- `test-icosphere.fbx`
- `test-uvsphere.obj`

## Shared State

Tests use `sharedState` singleton to pass data between scenarios. Key points:
- State persists across scenarios within single test run
- State is cleared between test runs
- Tests must run in order (alphabetically by feature file name)
- Use `00-texture-sets/` prefix to run setup first

## Debugging Failures

1. Check `test-results/[test-name]/error-context.md` for page snapshot
2. Check screenshots in test result directories
3. Check container logs: `docker logs webapi-e2e`
4. Test API directly: `curl http://localhost:8090/texture-sets`

## Cleanup

```bash
cd tests/e2e
docker compose -f docker-compose.e2e.yml down -v
Remove-Item -Path ./data -Recurse -Force
```
