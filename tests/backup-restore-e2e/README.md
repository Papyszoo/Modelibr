# Backup & Restore E2E

Isolated end-to-end test suite covering the `/backups` API and the Settings UI
"Backup & Restore" section, plus the restore-on-boot path that runs in
`Program.Main` before the host is built.

Lives in its own docker-compose stack so it never interferes with the main
`tests/e2e/` suite — different container names, different ports, different
named volumes, and the `data/` directory is bind-mounted locally so specs can
inspect and mutate it.

## What's covered

| Spec | Surface | Coverage |
| --- | --- | --- |
| `01-create-list-download.spec.ts` | UI + API | Creating a backup via the modal, watching the row flip from `in_progress` → `ready`, downloading it (verifying the first tar entry is `database.dump`), and deleting it. |
| `02-restore-roundtrip.spec.ts` | UI + Docker | Seed a model → backup → soft-delete the model → stage restore via the UI button → restart `webapi-backup-e2e` → assert the model is back and the archive was moved to `restore/processed/`. |
| `03-concurrent-conflict.spec.ts` | API | Two simultaneous `POST /backups` → second returns 409. Path-traversal in delete returns 400. Download of unknown filename returns 404. |
| `04-bad-archive-rejected.spec.ts` | API + Docker | Drop garbage bytes into `data/restore/` → restart → assert the archive lands in `restore/failed/` with an `.error.txt` sibling and live data is untouched. |

## Stack layout

| Service | Container | Host port |
| --- | --- | --- |
| `webapi-backup-e2e` | webapi | `8190` |
| `frontend-backup-e2e` | frontend | `3102` |
| `postgres-backup-e2e` | postgres | `5434` |

Data is bind-mounted under `tests/backup-restore-e2e/data/` so the host can:

- Inspect `data/backups/` after a backup runs.
- Drop a corrupted archive into `data/restore/` to test rejection.
- Confirm `data/restore/processed/` and `data/restore/failed/` after restart.

## Running

```bash
cd tests/backup-restore-e2e
npm install
npm run test:setup        # playwright install + docker compose up --build + wait for /health
npm test                  # run all specs
npm run test:teardown     # docker compose down -v + rm -rf data/
```

`test:setup` runs `npx playwright install --with-deps chromium` for you — Playwright
ships without browser binaries, and running specs without them gives the
"Executable doesn't exist at .../chrome-headless-shell" error.

Or, all-in-one (sets up, runs, tears down — exits with the test runner's status):

```bash
npm run test:full
```

The HTML report is at `playwright-report/index.html`:

```bash
npm run test:report
```

## Notes

- This suite uses Playwright's runner but only one project, `workers: 1`,
  `fullyParallel: false` — restore-on-boot tests restart the webapi container
  and cannot share a stack.
- The `01-` and `03-` specs delete pre-existing backups in `beforeAll` so each
  run starts clean. The `02-` and `04-` specs mutate the running stack and
  expect to own it for their duration.
- Test assets are pulled from `../e2e/assets/test-cube.glb`. If you remove the
  main e2e suite's assets these specs will skip themselves.
- `postgresql-client-16` is installed in the WebApi image at build time
  (matching `postgres:16-alpine`). The first `test:setup` therefore takes a
  bit longer; subsequent runs hit the layer cache.
