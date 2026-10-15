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
   was the installer job's integration step - which runs _after_ the tag, so a
   green unit run is not release evidence for the desktop app.

## Fixed in 0.6.2 (verified locally, not just in CI)

`pg_dump`/`psql` are optional again, and the two failure modes are separated:

- `ProcessManager.ensureRuntimeAssets` only requires the server binaries
  (`initdb`/`pg_ctl`); it probes the client tools and records
  `postgresToolsAvailable` instead of throwing.
- `PG_DUMP_PATH`/`PSQL_PATH` are exported only when the tools exist, so the API
  never sees a path to a file that isn't there.
- `BackupService.GetToolAvailability()` reports "configured but missing" for an
  absolute path that doesn't exist, leaving bare-name/PATH deployments alone.
- `DatabaseExtensions.TakePreMigrationBackupAsync` **skips with a CRITICAL log**
  when the tooling was never shipped, and still **aborts** when a backup that ran
  actually failed.

Verified by staging the real zonky runtime locally (`bin/` = the same three
binaries) and running `npm run test:integration` in `src/desktop` - the exact
step that failed in CI now passes. The unit lane also gained
`PreMigrationBackupGateTests` (database-free) and desktop tests for both
env-var states, so this specific regression can no longer hide behind Docker
suites.

## Closed in 0.7: the app dumps itself (no client tools at all)

The gap above was left open with a deliberate plan to bundle PostgreSQL client
binaries. It was solved the other way instead: **Modelibr writes and reads its
own dumps through Npgsql**, the driver it already uses to reach the server.

Why this beat bundling, which is worth remembering as a decision:

- **Size.** EDB-style client distributions are 40MB+ per platform _before_
  compression, against a server bundle that is already the largest thing in the
  installer.
- **It removes the class of bug, not the instance.** Every tool invocation was a
  place the packaged app could break: a missing binary, a `libpq` that would not
  resolve, a `PG_DUMP_PATH` pointing at a file that was never shipped. There are
  now none of those code paths to keep working.
- **It is testable here.** A round trip can be exercised against any PostgreSQL
  the CI already runs, on any platform, with no download step.

What it cost, honestly: the dump is **data, not schema**. The archive records the
migration it was taken at, and a restore migrates the database to that migration
before loading rows, which is the same upgrade path a `pg_dump` DDL restore took.
A `pg_dump` custom dump from an older build still restores wherever the client
tools are installed - `BackupManifest.DatabaseDumpFormat` is what tells the two
apart, and its absence means `pgdump-custom` so old archives keep working.

The removed surface: `BackupService.GetToolAvailability`,
`GET /backups/capabilities`, `PostgresToolPaths`, `PG_DUMP_PATH`/`PSQL_PATH`,
`pg_isready` in the boot-time restore, and the Settings warning that disabled
**Create backup**. A backup that runs and fails still aborts startup; the "the
tooling was never shipped, carry on without a snapshot" case no longer exists
because there is nothing to be missing.
