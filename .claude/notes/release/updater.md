# Desktop self-update - per-platform state

## Windows - FIXED (PR #550)

**Was broken:** the app downloaded the new build but never applied it; it
relaunched the OLD version.

**Root cause** (confirmed via captured updater logs): `UpdateManager.install()`
called `autoUpdater.quitAndInstall()` **non-silently** (`isSilent: false`), but the
electron-builder NSIS installer is **assisted** (`build.nsis.oneClick: false`,
`allowToChangeInstallationDirectory: true`). That pops the full setup wizard and
waits for clicks; on an unattended relaunching update the clicks never come. It
also meant real users would see the wizard on **every** update. Logs showed
`Install: isSilent: false` + `installdir ProductVersion=0.1.0.0` afterwards.

**The sidecar-file-lock hypothesis was REFUTED** - postgres/WebApi sidecars exited
cleanly (`Process exited with code 0`) before the app quit, and the process dump
after `quitAndInstall` was empty. **Don't re-chase that.**

**Fix:** `autoUpdater.quitAndInstall(true, true)` - `isSilent` applies the update
in the background (respecting the first-install location), `isForceRunAfter`
relaunches. Standard electron-updater pattern for `oneClick: false`. A desktop
unit test asserts the `[true, true]` args.

## Linux - works

AppImage swaps the whole file wholesale; no signing needed.

## macOS - fallback-only until 1.0

electron-updater on macOS uses Squirrel.Mac, which requires a **code-signed**
(Apple Developer ID) app to verify and apply updates. Mac builds are **unsigned**,
so the updater can *detect* a new version but download/apply fails;
`updateManager` catches it and falls back to opening the GitHub releases page for
a manual `.dmg` reinstall.

**Plan: code-sign + notarize at the 1.0 release** (user's call, June 2026). Until
then the `upgrade-test` self-update job is scoped to **Linux + Windows** - mac is
excluded entirely, not even a fallback assertion. The requirement is also noted in
`src/desktop/src/updateManager.js`.

## Verification caveat that applies to all of it

`upgrade-test.yml` runs the **FROM version's** updater code. A fix therefore
proves itself only once **two** post-fix releases exist. The FROM tag itself needs
no maintenance - the workflow's `resolve-tags` job derives it from the Releases
API as the release before TO.

## Related: installer smoke test (PR #549)

The installer smoke test (`native-release.yml`, "Run … E2E … against installed
app") ran `run-e2e-fast.js` **without** `--fast-only`, so it executed the
`@serial` GPU-render and `slow` phases on GitHub's GPU-less runners → SwiftShader
flake at the drained tail → red release/nightly Native Installers runs. The
installers themselves published fine during Build. Fixed by passing
`--fast-only` (setup + core Chromium only).

Related: [[process.md]], [[../features/desktop-installer.md]], [[../testing/flakiness.md]]
