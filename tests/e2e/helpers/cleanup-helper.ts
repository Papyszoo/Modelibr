/**
 * Cleanup helpers for E2E tests.
 *
 * Removes stale/duplicate data that accumulates across test runs,
 * preventing UI timeouts and selector confusion caused by data bloat.
 */

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

let modelCleanupDone = false;

/**
 * Remove duplicate models accumulated from previous test runs.
 * Keeps at most 1 copy of each model name. Soft-deletes duplicates
 * then permanently deletes them from the recycle bin.
 *
 * Safe to call multiple times per run — only executes once.
 */
export async function cleanupStaleModels(): Promise<void> {
    if (modelCleanupDone) return;
    modelCleanupDone = true;

    try {
        const response = await fetch(`${API_BASE}/models`);
        if (!response.ok) {
            console.log(
                `[Model Cleanup] GET /models returned ${response.status}, skipping`,
            );
            return;
        }

        const models = (await response.json()) as Array<{
            id: number;
            name: string;
        }>;
        console.log(`[Model Cleanup] Found ${models.length} models total`);

        if (models.length <= 10) {
            console.log(
                `[Model Cleanup] Count is manageable, skipping cleanup`,
            );
            return;
        }

        // Group by name, keep only the first of each
        const seen = new Map<string, number>(); // name -> kept id
        const toDelete: number[] = [];

        for (const m of models) {
            if (seen.has(m.name)) {
                toDelete.push(m.id);
            } else {
                seen.set(m.name, m.id);
            }
        }

        if (toDelete.length === 0) {
            console.log(`[Model Cleanup] No duplicates found`);
            return;
        }

        console.log(
            `[Model Cleanup] Removing ${toDelete.length} duplicate models...`,
        );

        // Step 1: Soft-delete duplicates
        let softDeleted = 0;
        for (const id of toDelete) {
            const delRes = await fetch(`${API_BASE}/models/${id}`, {
                method: "DELETE",
            });
            if (delRes.ok || delRes.status === 204) {
                softDeleted++;
            }
        }
        console.log(
            `[Model Cleanup] Soft-deleted ${softDeleted}/${toDelete.length}`,
        );

        // Step 2: Permanently delete from recycle bin
        let permDeleted = 0;
        for (const id of toDelete) {
            const permRes = await fetch(
                `${API_BASE}/recycled/model/${id}/permanent`,
                { method: "DELETE" },
            );
            if (permRes.ok || permRes.status === 204) {
                permDeleted++;
            }
        }
        console.log(
            `[Model Cleanup] Permanently deleted ${permDeleted}/${toDelete.length} ✓`,
        );
    } catch (e) {
        console.log(`[Model Cleanup] Warning: cleanup failed: ${e}`);
    }
}

/**
 * Also clean up recycled models that may be lingering from previous runs.
 * This prevents the recycle bin from being bloated too.
 */
export async function cleanupStaleRecycledModels(): Promise<void> {
    try {
        const response = await fetch(`${API_BASE}/recycled`);
        if (!response.ok) return;

        const data = (await response.json()) as {
            models: Array<{ id: number; name: string }>;
            sprites?: Array<{ id: number; name: string }>;
            sounds?: Array<{ id: number; name: string }>;
        };
        const recycledModels = data.models || [];

        if (recycledModels.length <= 5) return;

        // Keep only the 5 most recent (last in array), delete the rest
        const toDelete = recycledModels.slice(0, recycledModels.length - 5);
        console.log(
            `[Recycle Cleanup] Removing ${toDelete.length} stale recycled models...`,
        );

        for (const r of toDelete) {
            await fetch(`${API_BASE}/recycled/model/${r.id}/permanent`, {
                method: "DELETE",
            });
        }
        console.log(
            `[Recycle Cleanup] Removed ${toDelete.length} stale recycled models ✓`,
        );
    } catch (e) {
        console.log(`[Recycle Cleanup] Warning: cleanup failed: ${e}`);
    }
}
