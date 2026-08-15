# Release process - the parts not in the release-workflow skill

The mechanical rules (branch naming, protection, conventional commits, PR
targeting) live in the `release-workflow` skill. This file holds the operational
lessons.

## The manual steps

`gh release create vX.Y.Z --target main` drives what is automated: installers +
electron-updater feeds attach, and Docker images publish.

**The docs site is not automated.** Since the move off GitHub Pages to a
self-hosted apex domain, CI only *builds* the site and uploads it as the
`docs-site` artifact - publishing is a maintainer step run from the machine that
holds the deploy target, together with the feature videos. See the
`release-workflow` skill for the ordering.

## Package versions are enforced, not remembered

Bump all five `package.json` files (root, frontend, asset-processor, desktop,
desktop-client) plus their lockfiles on the version branch before tagging.

**`native-release.yml`'s `verify-version` job blocks the release if you don't.**
Both build jobs `needs:` it, so a mismatch produces no installers at all. This
matters because electron-builder interpolates `src/desktop/package.json`'s version
into `artifactName` *and* into the electron-updater feed: a stale value ships
installers named for the previous release and a feed advertising that version, so
users silently never receive the update. Nothing surfaces that until someone
reports not being updated.

The job always runs but its check is release-only - a skipped job would skip every
job that depends on it.

## Pre-release checklist beyond the test suites

- **Render and publish the docs videos: `npm run videos:generate`, then
  `npm run videos:publish`.** Nothing in CI renders or checks them any more - the
  GPU-less runner could not do it reliably, and that lane is exactly what failed
  0.5.1. Read `docs/videos/.generated/reports/final-video-analysis.json` between
  the two commands; publish refuses on a flagged freeze/black frame anyway.
- Run the fast e2e lane locally before opening a backend-wide refactor PR.
- Duration caps now apply to the local render, since that render *is* the shipped
  artifact - there is no slower CI pass to leave headroom for. See
  [[../features/docs-videos.md]].

**Docker Publish no longer rides on docs.** It gates on the `CI Status` job of the
triggering run rather than the whole run, so a docs or video problem cannot
withhold images the way it did for 0.4.0-0.5.0.

## Patch releases

Post-release fixes stage on `version/X.Y.Z`. The released `version/X.Y` is
**never** retargeted with more work. (The user corrected this mid-0.4; it is now
in the skill.)

Note `version/0.3.1` was created deliberately as a patch-level branch, deviating
from the `version/<major>.<minor>` convention at the time - that deviation became
the rule.

## Post-release follow-through

- **`upgrade-test.yml` needs no tag edit any more.** Its `resolve-tags` job derives
  both tags from the Releases API (TO = newest published release, FROM = the one
  before it) and feeds both matrix jobs via `needs`. The old hardcoded `from_tag`
  lived in **three** places - the `workflow_dispatch` input default plus a shell
  fallback in each job - and the fallback is what the nightly actually used, since
  `inputs.from_tag` is empty on a `schedule` trigger. It was missed for 0.4.2 and
  0.4.3, leaving the nightly upgrading from v0.3.1 long after that was meaningful.
- Still true: the self-update job runs the **FROM version's** updater code, so an
  updater fix is validated live only once **two** post-fix releases exist. Until
  then the job is red by design.
- Nightly `upgrade-test` picks the new release up at the first 07:00 UTC run after
  it is published.

Related: [[history.md]], [[updater.md]], [[../testing/strategy.md]]
