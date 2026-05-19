import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BackupApi } from "../helpers/backup-api.js";
import {
    hostPathExists,
    listHostDir,
    restartWebapi,
    waitForWebapi,
    writeHostFile,
} from "../helpers/docker-stack.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_ASSET = path.resolve(HERE, "../../e2e/assets/test-cube.glb");

test.describe.serial("Restore rejects bad archives without touching live data", () => {
    const api = new BackupApi();

    test.skip(
        !fs.existsSync(TEST_ASSET),
        `Test asset missing: ${TEST_ASSET}`,
    );

    test("A garbage .tar in restore/ is moved to failed/ on boot; live data is preserved", async () => {
        test.setTimeout(180000);

        // Seed: one model, so we have something the test can verify is still there.
        const m = await api.uploadModel(TEST_ASSET);
        expect([200, 201]).toContain(m.status);
        const beforeCount = (await api.listModels()).length;
        expect(beforeCount).toBeGreaterThan(0);

        // Drop a non-tar payload into restore/ — RestoreOnBootProcessor reads
        // the manifest first, so an unreadable archive must be rejected before
        // any data is touched.
        const badName = "modelibr-bad-0000-00-00-000000.tar";
        writeHostFile(`restore/${badName}`, Buffer.from("this is not a tar archive"));

        await restartWebapi();
        await waitForWebapi(120000);

        // The archive must have been moved into failed/ with an .error.txt sibling.
        const failedFiles = listHostDir("restore/failed");
        expect(failedFiles).toContain(badName);
        expect(failedFiles).toContain(`${badName}.error.txt`);

        // And it must NOT remain in the staging directory.
        expect(hostPathExists(`restore/${badName}`)).toBe(false);

        // Live data is intact — model count unchanged, app responds normally.
        const afterCount = (await api.listModels()).length;
        expect(afterCount).toBe(beforeCount);
    });
});
