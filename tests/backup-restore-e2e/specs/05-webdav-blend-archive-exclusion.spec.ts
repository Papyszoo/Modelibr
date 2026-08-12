import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BackupApi } from "../helpers/backup-api.js";
import { HOST_DATA_DIR, listHostDir, readHostFile } from "../helpers/docker-stack.js";

const ORPHAN_DIR_RELATIVE = "uploads/webdav-blend-orphans";

interface OrphanSidecar {
    originalRequestPath: string;
    reason: string;
}

/**
 * Scans uploads/webdav-blend-orphans/ (host bind-mounted here - see
 * docker-compose.backup-e2e.yml - unlike tests/e2e's stack, which needs
 * docker exec for the same lookup) for the sidecar whose originalRequestPath
 * matches the given WebDAV request path.
 */
function findOrphanSidecarByRequestPath(
    requestPath: string,
): { jsonFileName: string; blendFileName: string } | null {
    for (const name of listHostDir(ORPHAN_DIR_RELATIVE)) {
        if (!name.endsWith(".json")) continue;
        try {
            const sidecar = JSON.parse(
                readHostFile(`${ORPHAN_DIR_RELATIVE}/${name}`).toString("utf8"),
            ) as OrphanSidecar;
            if (sidecar.originalRequestPath === requestPath) {
                return { jsonFileName: name, blendFileName: name.replace(/\.json$/, ".blend") };
            }
        } catch {
            // Not ours (unreadable/malformed) - keep scanning.
        }
    }
    return null;
}

function removeHostFileIfExists(relativePath: string): void {
    try {
        fs.rmSync(path.join(HOST_DATA_DIR, relativePath), { force: true });
    } catch {
        // best-effort
    }
}

test.describe("Backup archive excludes in-flight WebDAV temp files but keeps orphans", () => {
    const api = new BackupApi();
    const runId = Date.now().toString(36).slice(-4);

    test.beforeAll(async () => {
        const existing = await api.listBackups();
        for (const b of existing) await api.deleteBackup(b.fileName);
    });

    test("Archive has no uploads/webdav-blend-temp/ entries and includes the seeded uploads/webdav-blend-orphans/ entries", async () => {
        test.setTimeout(120000);

        // ── Seed 1: an in-flight Blender Safe-Save temp file - PUT the ".blend@"
        // temp upload but deliberately never MOVE it, so it stays exactly the
        // kind of half-finished save BackupService must never ship in an archive.
        // No model needs to exist: HandleBlenderTempPutAsync writes straight to
        // webdav-blend-temp/ keyed by the request path, no DB lookup at PUT time.
        const tempModelName = `BackupTempSeed-${runId}`;
        const tempRequestPath = `/modelibr/Models/${encodeURIComponent(tempModelName)}/uploaded-${encodeURIComponent(tempModelName)}.blend@`;
        const tempPut = await api.webdavPut(
            tempRequestPath,
            Buffer.from(`temp-seed-${runId}`),
        );
        expect(tempPut.status).toBeGreaterThanOrEqual(200);
        expect(tempPut.status).toBeLessThan(300);

        // ── Seed 2: an orphan quarantine - Safe-Save MOVE into a model path that
        // doesn't exist. The middleware can't resolve a model, so it quarantines
        // the bytes + a JSON sidecar under webdav-blend-orphans/ instead of
        // deleting them (mirrors tests/e2e's @blend-orphan-quarantine scenario).
        const orphanModelName = `BackupOrphanSeed-${runId}`;
        const orphanRequestPath = `/modelibr/Models/${encodeURIComponent(orphanModelName)}/uploaded-${encodeURIComponent(orphanModelName)}.blend@`;
        const orphanPut = await api.webdavPut(
            orphanRequestPath,
            Buffer.from(`orphan-seed-${runId}`),
        );
        expect(orphanPut.status).toBeGreaterThanOrEqual(200);
        expect(orphanPut.status).toBeLessThan(300);

        const orphanMove = await api.webdavMove(
            orphanRequestPath,
            `/modelibr/Models/${encodeURIComponent(orphanModelName)}/uploaded-${encodeURIComponent(orphanModelName)}.blend`,
        );
        expect(orphanMove.status).toBe(204);

        const orphanMatch = findOrphanSidecarByRequestPath(orphanRequestPath);
        expect(orphanMatch).not.toBeNull();
        const { jsonFileName, blendFileName } = orphanMatch!;

        try {
            // ── Create the backup and download it.
            const created = await api.createBackup(false);
            expect(created.status).toBe(202);
            const ready = await api.waitForBackupReady(created.data.fileName);
            expect(ready.status).toBe("ready");

            const download = await api.downloadBackup(created.data.fileName);
            expect(download.status).toBe(200);
            // Same convention as 01-create-list-download.spec.ts: substring-search
            // the raw tar bytes as 1-byte chars, robust against PAX metadata blocks
            // interleaving the real entries - no tar-parsing dependency needed.
            const ascii = download.bytes.toString("binary");

            // Excluded: the in-flight temp file must never appear in the archive.
            expect(ascii).not.toContain("uploads/webdav-blend-temp/");

            // Included: the orphan quarantine's bytes + sidecar are real user data
            // that survived a failed save - a restore must bring them back.
            expect(ascii).toContain(`${ORPHAN_DIR_RELATIVE}/${blendFileName}`);
            expect(ascii).toContain(`${ORPHAN_DIR_RELATIVE}/${jsonFileName}`);

            await api.deleteBackup(created.data.fileName);
        } finally {
            // Remove only the specific orphan files this test created - never a
            // wholesale directory wipe, since other specs' orphans may coexist.
            removeHostFileIfExists(`${ORPHAN_DIR_RELATIVE}/${jsonFileName}`);
            removeHostFileIfExists(`${ORPHAN_DIR_RELATIVE}/${blendFileName}`);
        }
    });
});
