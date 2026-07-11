---
sidebar_position: 12
---

# Backups & Restore

Modelibr can back up your whole library — the database plus every uploaded
file — into a single archive, and restore from one on the next restart. For a
local-first app, "your assets survive" is the core promise, so backups get
extra protection: an automatic safety-net backup runs before any database
migration is applied.

## Creating a backup

Open the **Settings** page and go to **Backup & Restore**.

1. Click **Create backup**.
2. Choose whether to include thumbnails. Thumbnails regenerate automatically,
   so leaving this off keeps the archive smaller — the database and uploaded
   files are always included.
3. The new backup appears in the list as `in_progress`, then flips to
   `ready` once it finishes.

Each backup is a single `.tar` archive containing a Postgres dump
(`database.dump`), your uploaded files (`uploads/`), optionally thumbnails
(`thumbnails/`), and a `manifest.json` describing the archive's contents and a
SHA-256 checksum of the database dump.

## Restoring a backup

Restores apply on the **next restart**, not immediately — this keeps the
restore path simple and crash-safe (the exact same code runs whether you
triggered it or the app is recovering from an unclean shutdown).

1. In the backup list, click **Restore** next to the archive you want.
2. Restart Modelibr (or the `webapi` container).
3. On boot, Modelibr verifies the archive's checksum, replaces the database
   and uploaded files, and moves the archive into a `processed/` folder. If
   the archive is invalid or corrupted, it's moved to a `failed/` folder
   instead (with an error file explaining why) and your current data is left
   untouched.

## Automatic pre-migration backups

Modelibr occasionally ships database schema changes. Combined with
auto-updating desktop installs, a bad migration could otherwise reach every
user with no way back. To prevent that, Modelibr checks for pending database
migrations on every startup and, if there are any, takes an automatic backup
**before** applying them.

- **Scope**: database only (thumbnails and even uploaded files aren't
  needed to protect the schema change itself, so this backup is fast).
- **Naming**: these backups are named `pre-migration-<timestamp>.tar` so
  they're easy to tell apart from backups you created yourself
  (`modelibr-<timestamp>.tar`). They show up in the same backup list.
- **Retention**: only the most recent snapshots are kept (3 by default) —
  older `pre-migration-*` archives are pruned automatically. Backups you
  created yourself are never touched by this cleanup.
- **If the backup fails**: Modelibr aborts startup rather than applying an
  unprotected migration. The application log explains why. This is
  intentional — a failed pre-migration backup usually means something (disk
  space, permissions) needs attention before it's safe to proceed.

### Configuration

Set these in your `.env` file:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODELIBR_SKIP_PREMIGRATION_BACKUP` | `false` | Set to `true` to skip the automatic backup and apply migrations unconditionally. Not recommended outside throwaway/CI databases — there's no rollback point if the migration goes wrong. |
| `MODELIBR_PREMIGRATION_BACKUP_RETENTION` | `3` | How many `pre-migration-*` snapshots to keep before older ones are pruned. |

## Notes

- Docker deployments store backups under `./data/backups` on the host.
- Native (desktop) installs don't yet support backups — the automatic
  pre-migration safety net is disabled there for now and will be enabled once
  desktop backup support ships.
- Only one backup can run at a time; starting a second while one is in
  progress is rejected.

:::note Video placeholder
The walkthrough video for this page will be added later.
:::
