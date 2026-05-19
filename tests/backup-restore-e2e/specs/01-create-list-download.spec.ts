import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BackupApi } from "../helpers/backup-api.js";
import { SettingsPage } from "../helpers/settings-page.js";
import { listHostDir } from "../helpers/docker-stack.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_ASSET = path.resolve(HERE, "../../e2e/assets/test-cube.glb");

test.describe("Backup create / list / download / delete (UI)", () => {
    let api: BackupApi;

    test.beforeAll(async () => {
        api = new BackupApi();

        // Seed: upload a model so the backup has at least one upload file in it.
        if (fs.existsSync(TEST_ASSET)) {
            const seed = await api.uploadModel(TEST_ASSET);
            expect([200, 201]).toContain(seed.status);
        }

        // Start clean: delete any existing backups from prior runs.
        const existing = await api.listBackups();
        for (const b of existing) {
            await api.deleteBackup(b.fileName);
        }
    });

    test("Create backup via UI, see it in the list, download it, and delete it", async ({ page }) => {
        const settings = new SettingsPage(page);
        await settings.goto();

        // Open the create modal and submit it with thumbnails disabled.
        await settings.clickCreateBackup();
        await settings.setIncludeThumbnails(false);
        await settings.confirmCreateBackup();

        // A row appears — possibly in 'in_progress' state — then transitions to ready.
        const fileName = await settings.waitForFirstBackupRow();
        expect(fileName).toMatch(/^modelibr-\d{4}-\d{2}-\d{2}-\d{6}\.tar$/);
        await settings.waitForRowReady(fileName);

        // The archive appears on the host filesystem under data/backups/.
        const hostFiles = listHostDir("backups");
        expect(hostFiles).toContain(fileName);

        // Download via the UI and verify the bytes look like a tar archive.
        const download = await settings.clickDownload(fileName);
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const c of stream) chunks.push(Buffer.from(c));
        const bytes = Buffer.concat(chunks);
        expect(bytes.length).toBeGreaterThan(0);

        // BackupService writes a PAX-format tar containing `manifest.json`,
        // `database.dump`, and `uploads/...`. Verify those names appear in the
        // archive — substring search keeps this robust against PAX metadata
        // blocks (`./PaxHeaders.N/...`) interleaving the real entries.
        const ascii = bytes.toString("binary"); // 1-byte chars; no UTF-8 reinterpretation
        expect(ascii).toContain("database.dump");
        expect(ascii).toContain("manifest.json");
        expect(ascii).toContain("uploads/");

        // Delete via UI and confirm the row is gone.
        await settings.clickDelete(fileName);
        await expect(settings.rowFor(fileName)).toHaveCount(0, { timeout: 10000 });
        expect(listHostDir("backups")).not.toContain(fileName);
    });

    test("Listing /backups via API matches what the UI shows", async () => {
        // Create a fresh backup via API and confirm it surfaces.
        const created = await api.createBackup(false);
        expect(created.status).toBe(202);
        const ready = await api.waitForBackupReady(created.data.fileName);
        expect(ready.status).toBe("ready");
        expect(ready.includesThumbnails).toBe(false);

        const list = await api.listBackups();
        const found = list.find((b) => b.fileName === created.data.fileName);
        expect(found).toBeDefined();
        expect(found?.sizeBytes).toBeGreaterThan(0);
        expect(found?.hostPath).toMatch(/^\.\/data\/backups\//);

        // Cleanup
        const del = await api.deleteBackup(created.data.fileName);
        expect([200, 204]).toContain(del);
    });
});
