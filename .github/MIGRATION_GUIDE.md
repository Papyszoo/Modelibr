# Migration from Separate CI and Docs Workflows to Unified Pipeline

This document explains the migration from separate CI and documentation deployment workflows to a unified pipeline with integrated Playwright report deployment.

## What Changed

### Before
- **`.github/workflows/ci.yml`**: Ran tests independently on all branches and PRs
- **`.github/workflows/deploy-docs.yml`**: Deployed docs separately on main branch pushes
- **Manual process**: Required manually downloading Playwright reports from GitHub Actions artifacts

### After
- **`.github/workflows/ci-and-deploy.yml`**: Single unified workflow that:
  - Runs all tests on every push and PR
  - Automatically fetches last 5 Playwright reports
  - Deploys documentation with embedded reports (main branch only)
  - Supports manual triggering via GitHub Actions UI

## Migration Steps

### Step 1: Merge the PR
Merge the PR containing the new unified workflow into the main branch.

### Step 2: Verify First Run
After merging, the workflow will run automatically:

1. Go to **Actions** tab in GitHub
2. Find the "CI and Deploy Docs" workflow run
3. Wait for it to complete (usually 10-15 minutes)
4. Check that all jobs pass:
   - ✅ backend-tests
   - ✅ frontend-tests
   - ✅ blender-addon-tests
   - ✅ e2e-tests
   - ✅ ci-status
   - ✅ deploy-docs (only on main)

### Step 3: Verify Documentation Deployment
1. Visit https://papyszoo.github.io/Modelibr/
2. Check that the site loads correctly
3. Click **"E2E Reports"** in the navigation bar
4. Verify the reports page loads (may show placeholder if this is first run)

### Step 4: Verify Reports Accumulation
After a few more CI runs:

1. Visit the E2E Reports page again
2. Confirm that reports are appearing (up to 5 most recent)
3. Click on a report to view detailed test results
4. Test on mobile device to ensure responsive design works

### Step 5: Remove Old Workflows
**⚠️ Only after successful verification of steps 2-4:**

```bash
# Remove old workflow files
rm .github/workflows/ci.yml
rm .github/workflows/deploy-docs.yml

# Commit and push
git add .github/workflows/
git commit -m "Remove obsolete CI and docs deployment workflows"
git push
```

## Rollback Procedure

If issues occur, you can rollback:

1. **Revert the PR**: Use GitHub's "Revert" button on the merged PR
2. **Or manually restore old workflows**:
   ```bash
   git revert <commit-hash>
   git push
   ```

## Troubleshooting

### Documentation Not Deploying
**Symptom**: Docs don't update after workflow completes

**Solutions**:
- Check GitHub Pages settings: Settings → Pages → Source should be "GitHub Actions"
- Verify workflow permissions: Settings → Actions → Workflow permissions should include "Read and write permissions"
- Check workflow logs for the "deploy-docs" job

### No Reports Showing
**Symptom**: E2E Reports page shows placeholder message

**Solutions**:
- This is normal for the first 1-2 runs
- Check that e2e-tests job is creating playwright-report artifacts
- Verify artifacts are being uploaded in Actions → workflow run → Artifacts section
- After 2-3 successful runs, reports should appear

### Reports Not Updating
**Symptom**: Old reports don't get replaced with new ones

**Solutions**:
- Clear browser cache
- Check that fetch-playwright-reports.sh script ran successfully in logs
- Verify GitHub API token has sufficient permissions

### Build Failures
**Symptom**: Workflow fails during docs build

**Solutions**:
- Check for broken links in documentation
- Verify all dependencies installed correctly
- Review build logs for specific errors
- Test build locally: `cd docs && npm ci && npm run build`

## Benefits of New Unified Workflow

### For Developers
- ✅ Single workflow to monitor
- ✅ Faster feedback (parallel test execution)
- ✅ Easy access to test reports (no manual downloads)
- ✅ Mobile-friendly report viewing

### For Maintainers
- ✅ Simpler workflow management
- ✅ Reduced GitHub Actions minutes usage
- ✅ Automatic cleanup of old reports
- ✅ Better visibility into test history

### For Users
- ✅ Always up-to-date documentation
- ✅ Transparent test results
- ✅ No external services required
- ✅ Fast, responsive browsing

## Technical Details

### Workflow Trigger Conditions
- **Runs on**: All branches and PRs (tests only)
- **Deploys docs**: Only on main branch after all tests pass
- **Manual trigger**: Available via workflow_dispatch

### Permissions Required
```yaml
permissions:
  contents: read      # Read repository code
  pages: write        # Deploy to GitHub Pages
  id-token: write     # OIDC for Pages deployment
  actions: read       # Access workflow artifacts
```

### Resource Usage
- **GitHub Actions minutes**: ~10-15 minutes per run
- **Artifact storage**: Last 5 reports × ~10 MB = ~50 MB
- **GitHub Pages**: Static site + reports < 1 GB (typical)

All within free tier limits for public repositories.

## Support

If you encounter issues not covered here:

1. Check the [CI/CD Pipeline documentation](../docs/docs/ci-cd-pipeline.md)
2. Review workflow logs in GitHub Actions
3. Open an issue with:
   - Workflow run link
   - Error messages from logs
   - Steps to reproduce

## Notes

- Old CI runs and their artifacts remain accessible for their retention period (30 days)
- The unified workflow is backward compatible - it can fetch reports from both old and new CI runs
- Report format is standard Playwright HTML - fully portable if needed
