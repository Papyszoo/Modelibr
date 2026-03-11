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
} from "./helpers/cleanup-helper";
import {
    clearPersistedState,
    loadAllPersistedModelIds,
} from "./fixtures/setup-state-bridge";

export default async function globalSetup() {
    console.log("\n[GlobalSetup] Running pre-test cleanup...");

    const isSetupPhase = process.env.PW_PHASE === "setup";

    if (isSetupPhase) {
        // Setup phase: clear old bridge file, then clean everything
        clearPersistedState();
        await cleanupStaleModels();
    } else {
        // Chromium phase: clean duplicates but protect setup-created models
        const protectedIds = loadAllPersistedModelIds();
        await cleanupStaleModels(protectedIds);
    }

    await cleanupStaleRecycledModels();
    console.log("[GlobalSetup] Cleanup complete.\n");
}
