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

## REGRESSION found at the 0.6.1 release - the v0.6.0 gap is NOT resolved

The 0.6.1 change went one step too far. `ProcessManager` now lists
`postgres/bin/pg_dump` and `postgres/bin/psql` in its **required** runtime
assets and throws `Missing runtime asset` when either is absent.

The packaged runtime does not contain them. `prepare-bundle.mjs` copies the
PostgreSQL distribution it is pointed at, and CI points it at zonky's
`embedded-postgres-binaries`, whose `bin/` holds exactly three files:

```
bin/initdb    bin/pg_ctl    bin/postgres
```

`native-release.yml` asserts only `test -x .../bin/pg_ctl`, and electron-builder
copies `build/runtime` verbatim, so a real installer is no different. Every
packaged desktop build therefore fails the new check and **refuses to start** -
on all three CI platforms the "data survives a data-folder change" integration
step times out waiting for `/health`, and the host installers never publish.

Two lessons:

1. A hard runtime requirement must be justified by what the bundle actually
   ships. The pre-migration backup it was meant to enable is **inert on desktop**
   anyway - there is no `pg_dump` to invoke. Either bundle the client tools or
   make the check non-fatal and degrade with a clear warning.
2. Neither the unit suites nor the backup/restore drill can see this. The drill
   runs the API against a full PostgreSQL **image**; the defect is in the
   desktop `ProcessManager` against a trimmed runtime. The gate that caught it
   was the installer job's integration step - which runs *after* the tag, so a
   green unit run is not release evidence for the desktop app.

Related: [[desktop-installer.md]]
