import { expect, test } from "@playwright/test";
import { getWebapiLogs } from "../helpers/docker-stack.js";

// Numbering note: this suite gained a "05" spec (webdav-blend archive exclusion) on
// another branch that this branch doesn't have yet — numbered 06 to stay clear of it
// rather than reusing 05.
//
// Covers the pre-migration-backup safety net (DatabaseExtensions.InitializeDatabaseAsync):
// before applying pending EF Core migrations at startup, the app takes an automatic
// DB-scope backup (prefix "pre-migration-") and aborts startup if that backup fails.
//
// This stack's Postgres container is created empty by `test:setup` (`docker compose up
// --build`), so on webapi's very first boot EVERY migration is "pending" — the exact
// condition this feature targets. That makes the ordinary suite startup itself a live
// exercise of the real code path (real pg_dump — the webapi image bundles
// postgresql-client-16, see README) without needing to fabricate an upgrade boundary.
//
// Verified via container logs rather than the `/backups` list or `data/backups/` on
// disk: `01-create-list-download.spec.ts`'s beforeAll deletes every existing backup
// (this one included) before its own test runs, and specs execute in file order, so by
// the time this spec runs the archive itself is very likely already gone — but `docker
// logs` retains the whole container lifetime, so the startup log lines survive.
test.describe("Pre-migration backup on first boot", () => {
    test("Startup with pending migrations logs a pre-migration snapshot before migrating", async () => {
        const logs = await getWebapiLogs(100000);

        expect(logs).toMatch(/pending migration\(s\) detected/i);
        expect(logs).toMatch(/Taking automatic pre-migration backup/i);
        expect(logs).toMatch(/Pre-migration backup completed: pre-migration-[\d-]+\.tar/);
        expect(logs).toMatch(/Database initialization completed successfully/);

        // The backup log line must appear BEFORE the "initialization completed"
        // line that follows MigrateAsync — proving the backup ran first, not just
        // that both happened somewhere in the log.
        const backupIdx = logs.search(/Pre-migration backup completed:/);
        const migratedIdx = logs.search(/Database initialization completed successfully/);
        expect(backupIdx).toBeGreaterThan(-1);
        expect(migratedIdx).toBeGreaterThan(-1);
        expect(backupIdx).toBeLessThan(migratedIdx);

        // The safety net must not have been silently bypassed.
        expect(logs).not.toMatch(/MODELIBR_SKIP_PREMIGRATION_BACKUP=true/);
    });
});
