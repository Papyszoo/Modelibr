/**
 * Playwright globalSetup — runs ONCE before any test worker starts.
 *
 * Performs data cleanup from previous runs so that tests start with a
 * manageable dataset.  This MUST NOT run inside step handlers because
 * with parallel workers it would race-condition-delete models that
 * another worker just created.
 */

import {
    cleanupStaleModels,
    cleanupStaleRecycledModels,
    cleanupStaleTextureSets,
    cleanupStaleSprites,
    cleanupStaleSounds,
} from "./helpers/cleanup-helper";
import {
    clearPersistedState,
    loadAllPersistedModelIds,
    loadAllPersistedTextureSetIds,
} from "./fixtures/setup-state-bridge";

async function ensureAutoRenamePolicy() {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    try {
        const response = await fetch(
            `${API_BASE}/settings/DuplicateNamePolicy`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ value: "AutoRename" }),
            },
        );
        if (!response.ok) {
            throw new Error(
                `PUT /settings/DuplicateNamePolicy returned ${response.status}`,
            );
        }
        console.log(
            `[GlobalSetup] DuplicateNamePolicy → AutoRename (${response.status})`,
        );
    } catch (e) {
        console.error(
            `[GlobalSetup] FATAL: Failed to set DuplicateNamePolicy: ${e}`,
        );
        throw e;
    }
}

export default async function globalSetup() {
    console.log("\n[GlobalSetup] Running pre-test cleanup...");

    await ensureAutoRenamePolicy();

    const isSetupPhase = process.env.PW_PHASE === "setup";

    if (isSetupPhase) {
        // Setup phase: clear old bridge file, then clean everything
        clearPersistedState();
        await cleanupStaleModels();
        await cleanupStaleTextureSets(); // no protected IDs — setup will re-create
        await cleanupStaleSprites();
        await cleanupStaleSounds();
    } else {
        // Chromium phase: clean duplicates but protect setup-created entities
        const protectedModelIds = loadAllPersistedModelIds();
        const protectedTsIds = loadAllPersistedTextureSetIds();
        await cleanupStaleModels(protectedModelIds);
        await cleanupStaleTextureSets(protectedTsIds);
        await cleanupStaleSprites(); // no bridge entries for sprites
        await cleanupStaleSounds(); // no bridge entries for sounds
    }

    await cleanupStaleRecycledModels();
    console.log("[GlobalSetup] Cleanup complete.\n");
}
