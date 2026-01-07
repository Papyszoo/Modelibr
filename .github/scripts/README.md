# GitHub Actions Scripts

This directory contains utility scripts used by GitHub Actions workflows.

## fetch-playwright-reports.sh

Fetches the last 5 Playwright E2E test reports from GitHub Actions artifacts and organizes them for deployment with the documentation site.

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
- Downloads up to 5 most recent Playwright reports
- Generates an index.html with report listing

**Dependencies:**
- curl
- jq
- unzip

All dependencies are pre-installed on GitHub Actions runners.
