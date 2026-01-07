# CI/CD Pipeline and E2E Test Reports

This document explains how the unified CI/CD pipeline works and how to access E2E test reports.

## Overview

Modelibr uses a unified GitHub Actions workflow that:
1. Runs all test suites (backend, frontend, Blender addon, and E2E tests)
2. Automatically collects the latest 5 Playwright E2E test reports
3. Deploys them alongside the documentation to GitHub Pages

## Accessing Test Reports

### On Main Branch (Deployed to GitHub Pages)

The latest Playwright E2E test reports are available directly from the documentation site:

**[View E2E Test Reports](/playwright-reports)**

You can also access them from the navigation bar at the top of this site.

### On Feature Branches and PRs

When working on feature branches or pull requests, the documentation with embedded reports is built but not deployed to GitHub Pages. Instead:

1. Go to the workflow run in GitHub Actions
2. Scroll to the "Artifacts" section at the bottom
3. Download the `docs-with-reports` artifact
4. Extract the zip file and open `playwright-reports/index.html` in your browser

This allows you to preview test reports even when tests fail, without deploying to the live site.

## How It Works

### Workflow Structure

The workflow is defined in `.github/workflows/ci-and-deploy.yml` and consists of:

1. **Test Jobs** (run on all branches and PRs):
   - `backend-tests`: .NET unit tests
   - `frontend-tests`: React unit tests
   - `blender-addon-tests`: Python unit tests
   - `e2e-tests`: Playwright end-to-end tests
   - `ci-status`: Aggregates results from all tests

2. **Documentation Building** (runs on all branches, even if tests fail):
   - Fetches the last 5 Playwright reports from previous workflow runs
   - Builds the Docusaurus documentation site
   - Uploads docs with reports as artifact (`docs-with-reports`) for preview
   - Only deploys to GitHub Pages on main branch

### Report Collection Process

The `.github/scripts/fetch-playwright-reports.sh` script:

1. Uses the GitHub API to fetch recent workflow runs
2. Downloads the `playwright-report` artifacts from the last 5 successful E2E test runs
3. Extracts them to `docs/static/playwright-reports/run-{number}/`
4. Generates an index page that displays all reports with metadata (date, time, pass/fail status)
5. Reports are automatically cleaned up - only the last 5 are kept

### Report Storage

- **During CI**: Reports are uploaded as GitHub Actions artifacts with 30-day retention
- **On GitHub Pages**: The last 5 reports are embedded in the documentation site
- **Locally**: Reports are ignored by git (see `docs/.gitignore`)

## For Maintainers

### Triggering a Documentation Deployment

Documentation is automatically deployed to GitHub Pages when:
- A commit is pushed to the `main` branch
- All CI tests pass successfully

You can also manually trigger a deployment:
1. Go to the [Actions tab](https://github.com/Papyszoo/Modelibr/actions)
2. Select the "CI and Deploy Docs" workflow
3. Click "Run workflow" and select the `main` branch

### Adding More/Fewer Reports

To change the number of reports displayed:

1. Edit `.github/scripts/fetch-playwright-reports.sh`
2. Change the condition `if [ ${REPORT_COUNT} -ge 5 ];` to your desired number
3. Update this documentation accordingly

### Troubleshooting

#### No Reports Showing

If no reports appear on the E2E Reports page:
- Check that E2E tests are running successfully in CI
- Verify the workflow run has the `playwright-report` artifact
- Check the workflow logs for the "Fetch last 5 Playwright reports" step

#### Reports Not Updating

- Ensure you're on the `main` branch
- Check that all CI tests passed
- Wait a few minutes for GitHub Pages to deploy

#### Script Errors

The fetch script requires:
- `curl` for API calls
- `jq` for JSON parsing
- `unzip` for extracting artifacts

These are pre-installed on GitHub Actions runners.

## Technical Details

### Permissions Required

The workflow needs these GitHub permissions:
- `contents: read` - Read repository code
- `pages: write` - Deploy to GitHub Pages
- `id-token: write` - OIDC for Pages deployment
- `actions: read` - Access workflow artifacts

### API Rate Limits

The GitHub API has rate limits:
- 1,000 requests per hour for authenticated requests
- The fetch script makes ~20 API calls per run
- This allows for frequent deployments without hitting limits

### Artifact Retention

- Artifacts are retained for 30 days by default
- After 30 days, older reports may not be available for fetching
- Reports already on GitHub Pages remain until replaced

## Removed Workflows

This unified workflow replaces:
- `.github/workflows/ci.yml` (standalone CI)
- `.github/workflows/deploy-docs.yml` (standalone docs deployment)

These separate workflows are no longer needed and have been replaced by the unified approach.
