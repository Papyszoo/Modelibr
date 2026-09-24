# Backup trust hardening - and the open desktop gap

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

## CRITICAL desktop follow-up - now resolved in v0.6.1

Desktop tray-host backups were nonfunctional because `BackupService` invoked
`pg_dump` / `psql` by bare name while the bundled Postgres `bin/` was not on the
desktop PATH. The desktop host now passes absolute bundled tool paths and the
embedded PostgreSQL environment, and pre-migration backup is enabled again.

A small process-local consistency gate now keeps the existing physical file
storage save/delete operations out of the backup dump-and-enumeration window.
Backup also checks authoritative `Files.FilePath` rows before and after the
dump; missing referenced paths abort publication, while unreferenced extra
files are allowed. It is intentionally not a broad database locking subsystem.

Related: [[desktop-installer.md]]
