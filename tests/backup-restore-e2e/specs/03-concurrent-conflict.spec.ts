import { expect, test } from "@playwright/test";
import { BackupApi } from "../helpers/backup-api.js";

test.describe("Backup API edge cases", () => {
    const api = new BackupApi();

    test.beforeAll(async () => {
        const existing = await api.listBackups();
        for (const b of existing) await api.deleteBackup(b.fileName);
    });

    test("Two backups started back-to-back: second returns 409 Conflict", async () => {
        // Fire both within the same tick. The first acquires the semaphore;
        // the second must see it locked and return 409.
        const [first, second] = await Promise.all([
            api.createBackup(false),
            (async () => {
                // Tiny delay so the first call definitely wins the race,
                // making this test deterministic.
                await new Promise((r) => setTimeout(r, 10));
                return api.createBackup(false);
            })(),
        ]);

        expect(first.status).toBe(202);
        expect(second.status).toBe(409);

        // Wait for the first to finish before tearing down.
        await api.waitForBackupReady(first.data.fileName);
        await api.deleteBackup(first.data.fileName);
    });

    test("Delete with an invalid filename is rejected", async () => {
        // Path-traversal style — must be rejected by the server-side validator.
        const status = await api.deleteBackup("../etc/passwd");
        expect(status).toBe(400);
    });

    test("Download of a non-existent backup returns 404", async () => {
        const r = await api.downloadBackup("modelibr-9999-99-99-999999.tar");
        expect(r.status).toBe(404);
    });
});
