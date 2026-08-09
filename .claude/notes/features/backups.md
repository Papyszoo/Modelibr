# Backup trust hardening — and the open desktop gap

Prompt 17 implemented 2026-07-11, **PR #566** (`feat/backup-trust-hardening` →
`version/0.4`).

## What shipped

- Startup takes a `pre-migration-` DB-scope backup when migrations are pending.
  **Failure aborts startup.**
- Opt-out: `MODELIBR_SKIP_PREMIGRATION_BACKUP`.
- Retention: `MODELIBR_PREMIGRATION_BACKUP_RETENTION` (default 3), with
  prefix-scoped cleanup that can **never** touch manual `modelibr-` backups.
- Restore drill = a nightly GitHub Actions job (`backup-restore-drill` in
  `nightly-e2e.yml`).

## CRITICAL open follow-up — desktop backups don't work

Discovered during the same work: **desktop tray-host backups are nonfunctional.**

- `BACKUP_STORAGE_PATH` was never wired (now wired for parity).
- `BackupService` invokes `pg_dump` / `psql` **by bare name**, but the bundled
  Postgres `bin/` is not on the desktop PATH.

Because a startup-blocking regression would be worse, desktop currently sets
`MODELIBR_SKIP_PREMIGRATION_BACKUP=true` — i.e. **desktop has opted out of
pre-migration backup entirely.**

**Real fix:** absolute-path resolution for the pg tools in `BackupService`. Tracked
as `TODO(backup on desktop)` in `src/desktop/src/processManager.js` and noted in
`docs/docs/features/backups.md`.

**This deserves its own prompt before 1.0** — desktop is the auto-update channel,
which is exactly where a pre-migration backup matters most.

Related: [[desktop-installer.md]]
