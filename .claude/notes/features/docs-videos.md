# Docs feature videos

**Videos are rendered LOCALLY on a GPU machine and published straight to the
site. They are NOT committed, and as of 0.5.2 they are NOT generated in CI.**

> Superseded 2026-08-15. The original direction (autogenerate in CI on main-push,
> confirmed 2026-07-02) survived four releases of flake and was abandoned when
> the site moved off GitHub Pages. The history below is kept because it explains
> *why* CI generation was given up, not because it still describes the pipeline.

## Why not committed

A committed-videos approach was tried and **rejected by the user**: PR #548
originally committed ~11 MB of `.webm`. His call - *"too much space the user would
have to download"*. #548's branch history was rewritten to remove the blobs, and
the PR now contains only the E2E `@serial` work.

This is the general rule: **prefer CI-generated artifacts over committed
binaries**; repo download size matters.

## Why they're fragile

The `.webm` clips are GPU-render dependent. On the v0.3.0 main push the
`generate-videos` job (software-render / SwiftShader) flaked → blocked
`build-docs` → **the Pages deploy was skipped**, and 0.3 docs didn't go live until
a manual `gh run rerun --failed`.

**Reliability fix (PR #551):** the "Generate videos" step retries `npm run
generate` up to 3× to absorb the SwiftShader flake, with step/job timeouts bumped
for headroom.

**Videos are a documentation artifact, NOT a test.** Handled by
autogeneration + retry - never by the `@serial` local-only test lane. The user
emphasized this distinction.

## Current behavior (since 0.5.2)

There is **no `generate-videos` job and no `deploy-docs` job.** `build-docs`
builds the site, uploads it as the `docs-site` artifact, and never touches the
clips. `docs/static/videos/` is still gitignored.

The clips are rendered with `npm run videos:generate` and published with
`npm run videos:publish` to the site's own `/videos/` path. The docs publish
protects that directory from its `--delete`, so the two are independent.

Gates, since nothing in CI checks these any more:

- The `docs-videos` suite in `npm run test:all` (slow tier) - **re-records** the
  set against the current code, then verifies it. This is the CI replacement for
  spec rot: it is the only automated thing that drives the video specs at all.
  Verifying the previous render instead was tried first and dropped - leftovers
  say nothing about the changes you are testing.
- `docs/videos/verify-videos.js` - the rules themselves: present, non-trivial
  size, analysed clean, inside the duration cap. Default strictness fails only on
  a clip that is present and bad; `--complete` also requires the full set. Run it
  alone (`npm run videos:verify`) to re-check a set without paying for a render.
- `verify-videos.mjs` in the private workspace - a thin `--complete` wrapper
  around the above, run before any upload. It deliberately holds no rules of
  its own, so a local test run and a publish cannot disagree.
- `publish-videos.js` - re-checks the analysis report, refuses a partial set,
  and re-fetches every clip afterwards to confirm it is actually served.

**The trade is explicit:** CI no longer catches video-spec rot at all. The ripple
rule below and the local `docs-videos` suite are the only things that do - and
the suite only helps if someone runs the slow tier before a release.

## The 0.4-0.5.1 fallout - why CI generation was abandoned

The 0.4 UI changes broke video specs at docs-deploy time. **Nothing gates them on
PRs**, and a red docs CI **skipped Docker Publish** - 0.4.x images didn't ship
until 0.4.3.

That kept recurring: 0.4.0-0.5.0 lost their Docker images to it, and **0.5.1
failed the same way** - a flaked render failed `generate-videos` → failed
`build-docs` → skipped the deploy. Two fixes landed instead of a third patch:
Docker Publish now gates on the `CI Status` job rather than the whole run, and
video generation left CI entirely.

Fixed across PRs #572 / #574: projects (`ListToolbar` search panel), sprites ("All"
default bucket), recycled-files + shared helpers (raw mouse events don't
auto-scroll - call `scrollIntoViewIfNeeded` before `boundingBox`), packs (a
conditional add-flow silently skipping), model-management (cold on-camera FBX open
→ off-camera prewarm), and **prompt 48**: `TexturePreviewPanel` Canvas →
`frameloop="demand"` (a static scene; `always` starved input under software GL -
the deterministic texture-sets CI kill).

## Duration caps

`npm run videos:generate` is the one-command local check (PR #556).

**Caps now apply to the local render, because that render is what ships.** There
is no slower CI pass to leave headroom for. Several caps in `video-manifest.js`
were raised specifically for CI pacing (model-management 45 → 75 s after failing
at 60.5-60.8 s under software GL) and are now **loose rather than wrong** - they
still fail a genuinely runaway clip. Tighten them only deliberately, and keep the
manifest comments true when you do.

**Trim semantics:** trimming used to cut every recording at its manifest cap
(texture-sets shipped at exactly 20.0 s, mid-demo). Now it's tail-freeze-trim only,
and the cap is a **failing QA gate** rather than a silent truncation (PR #559).

Screencasts render no pointer, so `navigateTo` adds a **synthetic cursor overlay**.

**Ripple rule:** UI changes → grep `docs/videos/` selectors. Nothing exercises
these specs automatically any more, so a broken selector surfaces only when
someone runs `npm run videos:generate` before a release. Re-render whenever a
video's flow changed in the UI.

The `video-authoring` skill is the canonical pipeline/choreography doc.

Related: [[../release/process.md]], [[../release/history.md]], [[../testing/flakiness.md]]
