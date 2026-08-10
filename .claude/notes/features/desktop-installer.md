# Native installer — tray host + thin client

PR #495 (`feat/native-installer`) makes Modelibr installable for non-technical
users who can't set up the Docker Compose stack. Architecture is **two separate
Electron apps**.

## Host — `src/desktop/`, productName "Modelibr"

Bundles frontend + WebApi + asset-processor workers + Node + PostgreSQL.

- Runs from a **tray / menu-bar icon**. Tray-is-the-app lifecycle: closing the
  status window only hides it; quit only via the tray.
- A **status window** (`status.html` + sandboxed `preload.cjs` + IPC in `main.js`)
  shows live backend/database/asset-processor health via
  `ProcessManager.probeStatus()`, the frontend URL (open/copy), and a
  **Configuration** panel (app port, worker count, jobs/worker, GPU) persisted via
  `saveRuntimeConfig`.
- `EdgeServer` serves everything on one port (default 3010).

## Client — `src/desktop-client/`, productName "Modelibr Client"

A thin "extended website" window that loads a running host's URL. Bundles no
runtime; host URL configurable via `connect.html`. Publishes to its own `client`
update channel so its electron-updater feed never collides with the host's.

## Key decision — don't reintroduce runtime config into the frontend

The in-frontend "Native Runtime" Settings section was **dropped**. Runtime config
lives in the host tray window instead. It also conflicted hard with the rewritten
Settings grid.

**Keep host and client as separate installers and CI jobs.**

## Related state

- Self-update per platform: [[../release/updater.md]].
- Desktop backups are currently **nonfunctional** — [[backups.md]].
