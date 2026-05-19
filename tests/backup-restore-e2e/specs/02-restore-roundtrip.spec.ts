import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { BackupApi } from "../helpers/backup-api.js";
import { SettingsPage } from "../helpers/settings-page.js";
import {
    getWebapiLogs,
    listHostDir,
    restartWebapi,
    waitForWebapi,
} from "../helpers/docker-stack.js";
import {
    ASSETS_DIR,
    seedDataset,
    takeSnapshot,
} from "../helpers/seed-and-snapshot.js";

test.describe.serial("Restore round-trip — verify every entity survives intact", () => {
    const api = new BackupApi();

    test.skip(
        !fs.existsSync(ASSETS_DIR),
        `Asset directory missing: ${ASSETS_DIR}`,
    );

    test.beforeAll(async () => {
        // AutoRename so duplicate upload names from earlier specs don't 409.
        await api.setSetting("DuplicateNamePolicy", "AutoRename");

        // Clear any backups from previous runs so this test owns the list.
        const existing = await api.listBackups();
        for (const b of existing) await api.deleteBackup(b.fileName);
    });

    test("Seed full dataset → backup → mutate → restore → snapshot matches", async ({ page }) => {
        test.setTimeout(360000); // 6 min total budget: seed + backup + restart + verify

        // ── 1. Seed: 5 models (one recycled), one extra version, 2 texture sets,
        //         2 packs (one populated), 2 projects (one populated).
        const seed = await seedDataset(api);
        const before = await takeSnapshot(api);

        // Sanity-check the dataset shape before we trust the round-trip.
        expect(before.modelIds.length).toBeGreaterThanOrEqual(4); // 1 was recycled
        expect(before.textureSetIds.length).toBeGreaterThanOrEqual(2);
        expect(before.packIds.length).toBeGreaterThanOrEqual(2);
        expect(before.projectIds.length).toBeGreaterThanOrEqual(2);
        expect(before.versionCountById[seed.versionedModelId]).toBeGreaterThanOrEqual(2);
        expect(before.recycledEntries.length).toBeGreaterThanOrEqual(1);
        // The recycled model is referenced in the recycle bin entries.
        expect(
            before.recycledEntries.some((r) => r.entityId === seed.recycledModelId),
        ).toBe(true);

        // ── 2. Create backup via UI.
        const settings = new SettingsPage(page);
        await settings.goto();
        await settings.clickCreateBackup();
        await settings.setIncludeThumbnails(false);
        await settings.confirmCreateBackup();
        const fileName = await settings.waitForFirstBackupRow();
        await settings.waitForRowReady(fileName);

        // ── 3. Mutate state AFTER the backup. Restore should erase these changes.
        //         (a) Delete two more models — restore must bring them back.
        await api.softDeleteModel(seed.modelIds[1]);
        await api.softDeleteModel(seed.modelIds[2]);
        //         (b) Create a NEW pack — restore must remove it.
        const interloperPack = await api.createPack("post-backup-pack", "should be gone after restore");
        expect([200, 201]).toContain(interloperPack.status);
        //         (c) Create a NEW project — restore must remove it.
        const interloperProject = await api.createProject("post-backup-project");
        expect([200, 201]).toContain(interloperProject.status);

        const mutated = await takeSnapshot(api);
        expect(mutated.modelIds.length).toBe(before.modelIds.length - 2);
        expect(mutated.packIds.length).toBe(before.packIds.length + 1);
        expect(mutated.projectIds.length).toBe(before.projectIds.length + 1);

        // ── 4. Stage the restore via the UI.
        await settings.clickRestore(fileName);
        await expect
            .poll(() => listHostDir("restore"), { timeout: 10000 })
            .toContain(fileName);

        // ── 5. Restart the webapi container — RestoreOnBootProcessor runs
        //         before HTTP is up; wait for /health to come back.
        await restartWebapi();
        await waitForWebapi(180000);

        // ── 6. The archive should be moved into restore/processed/ and gone
        //         from the staging directory.
        const processedFiles = listHostDir("restore/processed");
        expect(processedFiles.some((f) => f.endsWith(fileName))).toBe(true);
        expect(listHostDir("restore")).not.toContain(fileName);

        // ── 7. Snapshot the world AFTER restore and compare it to BEFORE.
        const after = await takeSnapshot(api);

        // Models: every active model from before is back, no interloper persists.
        expect(after.modelIds).toEqual(before.modelIds);
        // Versions per model are unchanged.
        expect(after.versionCountById).toEqual(before.versionCountById);
        // File hashes on disk match — this proves the upload tree was restored
        // with byte-identical content.
        expect(after.modelHashesById).toEqual(before.modelHashesById);

        // Texture sets: same set of IDs, same names, same number of textures each.
        expect(after.textureSetIds).toEqual(before.textureSetIds);
        expect(after.textureSetNameById).toEqual(before.textureSetNameById);
        expect(after.textureCountById).toEqual(before.textureCountById);

        // Packs: identical set, identical names, identical model membership counts.
        // Restore must have undone the "post-backup-pack" we created in step 3.
        expect(after.packIds).toEqual(before.packIds);
        expect(after.packNameById).toEqual(before.packNameById);
        expect(after.packModelCountById).toEqual(before.packModelCountById);

        // Projects: same — restore must have undone the interloper.
        expect(after.projectIds).toEqual(before.projectIds);
        expect(after.projectNameById).toEqual(before.projectNameById);
        expect(after.projectModelCountById).toEqual(before.projectModelCountById);

        // Recycle bin entries are restored too. We use a structural compare
        // (entityType + entityId) because timestamps can differ.
        const beforeRecycledKeys = before.recycledEntries.map(
            (r) => `${r.entityType}:${r.entityId}`,
        );
        const afterRecycledKeys = after.recycledEntries.map(
            (r) => `${r.entityType}:${r.entityId}`,
        );
        expect(afterRecycledKeys).toEqual(beforeRecycledKeys);
    });

    test.afterAll(async () => {
        if (test.info().errors.length > 0) {
            console.log("\n── webapi logs (last 200 lines) ──\n" + (await getWebapiLogs()));
        }
    });
});
