# GitHub Actions Scripts

This directory contains utility scripts used by GitHub Actions workflows.

## fetch-playwright-reports.sh

Fetches the last 10 Playwright E2E test reports along with unit test results from GitHub Actions artifacts and organizes them for deployment with the documentation site.

**Usage:**
```bash
export GITHUB_TOKEN="your-token"
export GITHUB_REPOSITORY_OWNER="Papyszoo"
./fetch-playwright-reports.sh
```

**Environment Variables:**
- `GITHUB_TOKEN` - GitHub API token with repo access
- `GITHUB_REPOSITORY_OWNER` - Repository owner (e.g., "Papyszoo")
- `GITHUB_REPOSITORY` - Full repository name (e.g., "Papyszoo/Modelibr")

**Output:**
- Creates `docs/static/playwright-reports/` directory
- Downloads up to 10 most recent Playwright reports
- Downloads unit test results (backend .NET, frontend Jest, Blender addon pytest)
- Generates an index.html with comprehensive report listing including:
  - Branch information for each test run
  - E2E test status (passed/failed)
  - Backend unit test results
  - Frontend unit test results
  - Blender addon test results

**Dependencies:**
- curl
- jq
- unzip

All dependencies are pre-installed on GitHub Actions runners.
