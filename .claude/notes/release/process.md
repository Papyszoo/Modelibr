# Release process - the parts not in the release-workflow skill

The mechanical rules (branch naming, protection, conventional commits, PR
targeting) live in the `release-workflow` skill. This file holds the operational
lessons.

## The one manual step

`gh release create vX.Y.Z --target main`. Everything downstream is automated off
it: installers + electron-updater feeds attach, Docker images publish, docs deploy.

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

- **Run the docs-video lane locally: `npm run videos:generate`.** Video specs are
  exercised only at main-push, and a red docs CI **silently blocks Docker
  Publish** - `docker-publish.yml` fires only on "CI and Deploy Docs" success on
  main, and there is **no manual trigger**. This cost 0.4.0–0.4.2 their Docker
  images.
- Run the fast e2e lane locally before opening a backend-wide refactor PR.
- Duration caps in video specs regress only at CI pace - local runs at ~90% of a
  cap will fail CI at ~135%. See [[../features/docs-videos.md]].

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
