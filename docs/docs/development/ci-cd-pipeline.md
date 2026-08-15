# CI/CD Pipeline

Modelibr uses GitHub Actions to verify changes, build release artifacts, and
publish the documentation site.

## Verification jobs

The main workflow is `.github/workflows/ci-and-deploy.yml` ("CI and Build Docs").
It runs the relevant checks for each change, including:

- .NET backend unit tests
- React frontend unit tests and formatting checks
- Asset processor tests and formatting checks
- Playwright end-to-end tests
- Storybook production builds
- Documentation audits and production builds

Test logs and reports remain GitHub Actions artifacts for CI diagnosis. They are
not copied into the documentation bundle or linked from the public website.

## Documentation build

The documentation job creates one `docs-site` artifact containing:

- the Docusaurus documentation and landing page
- the demo-mode frontend under `/demo/`
- Storybook under `/storybook/`

Feature videos are **not** in this bundle. Capturing them drives the same WebGL
render as the end-to-end suite, which is unreliable on GitHub's GPU-less
runners, so they are rendered on a machine with a GPU and published separately
to the site's own `/videos/` path. That is why the feature pages reference them
by absolute URL rather than as build assets.

Run the documentation checks locally with:

```bash
npm run docs:audit
cd docs && npm run build
```

## Deployment

Publishing is a manual step, not a workflow. CI builds and uploads the
`docs-site` artifact; a maintainer publishes it to `modelibr.com` when cutting a
release, alongside the separately-rendered feature videos.

The publish refuses to sync a bundle without an `index.html`, so a partial or
empty build cannot wipe the live site, and it protects `/videos/` from deletion
so the independently-published clips survive a documentation update.

## CI artifacts

Individual jobs upload short-lived artifacts such as unit-test summaries,
Playwright reports, and Storybook output. Open the relevant workflow run in
GitHub Actions to inspect or download them. These artifacts are not part of the
public documentation site.

## Code quality workflow

`.github/workflows/code-quality.yml` runs path-filtered frontend and asset
processor quality checks. Required checks that must report on every pull request
remain in the main workflow so branch protection cannot deadlock when a
path-filtered job is skipped.
