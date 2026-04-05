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
 * @param protectedIds - Model IDs that must NOT be deleted (e.g. setup-created models)
 *
 * Safe to call multiple times per run — only executes once.
 */
export async function cleanupStaleModels(
    protectedIds: Set<number> = new Set(),
): Promise<void> {
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

        if (protectedIds.size > 0) {
            console.log(
                `[Model Cleanup] Protecting ${protectedIds.size} bridge model IDs: ${[...protectedIds].join(", ")}`,
            );
        }

        if (models.length <= 5) {
            console.log(
                `[Model Cleanup] Count is manageable, skipping cleanup`,
            );
            return;
        }

        // Delete ALL unprotected models (not just duplicates).
        // Without this, models with unique names (e.g. blend-upload test
        // artifacts: BlendDedupA, BlendWebDavModel…) accumulate indefinitely.
        // Their Status=3 thumbnail rows (failed renders) can shadow the
        // Status=2 thumbnail rows for setup-created models in unscoped DB
        // queries inside test steps.
        const toDelete = models
            .filter((m) => !protectedIds.has(m.id))
            .map((m) => m.id);

        if (toDelete.length === 0) {
            console.log(`[Model Cleanup] Nothing to delete`);
            return;
        }
        console.log(
            `[Model Cleanup] Removing ${toDelete.length} unprotected models...`,
        );

        // Step 1: Soft-delete
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
 * Remove ALL texture sets accumulated from previous test runs,
 * keeping only setup-bridge-protected IDs (e.g. blue_color, red_color).
 *
 * With hundreds of texture sets, the first paginated page (50 items) fills
 * with alphabetically-early items, making freshly-created test items invisible.
 */
export async function cleanupStaleTextureSets(
    protectedIds: Set<number> = new Set(),
): Promise<void> {
    try {
        const response = await fetch(
            `${API_BASE}/texture-sets?pageSize=500&page=1`,
        );
        if (!response.ok) {
            console.log(
                `[TS Cleanup] GET /texture-sets returned ${response.status}, skipping`,
            );
            return;
        }
        const data = (await response.json()) as {
            textureSets: Array<{ id: number; name: string }>;
        };
        const all = data.textureSets || [];
        console.log(
            `[TS Cleanup] Found ${all.length} texture sets (protecting ${protectedIds.size} IDs)`,
        );

        if (all.length <= 5) {
            console.log(`[TS Cleanup] Count is manageable, skipping`);
            return;
        }

        const toDelete = all
            .filter((ts) => !protectedIds.has(ts.id))
            .map((ts) => ts.id);

        let deleted = 0;
        for (const id of toDelete) {
            // Soft-delete (moves to recycle bin)
            const r = await fetch(`${API_BASE}/texture-sets/${id}`, {
                method: "DELETE",
            });
            if (r.ok || r.status === 204) deleted++;
        }
        console.log(
            `[TS Cleanup] Soft-deleted ${deleted}/${toDelete.length} texture sets`,
        );

        // Also permanently delete ALL recycled texture sets
        const recycledResp = await fetch(`${API_BASE}/recycled`);
        if (recycledResp.ok) {
            const recycled = (await recycledResp.json()) as {
                textureSets?: Array<{ id: number }>;
            };
            const recycledTs = recycled.textureSets || [];
            let permDeleted = 0;
            for (const ts of recycledTs) {
                const r = await fetch(
                    `${API_BASE}/recycled/texture-set/${ts.id}/permanent`,
                    { method: "DELETE" },
                );
                if (r.ok || r.status === 204) permDeleted++;
            }
            if (permDeleted > 0) {
                console.log(
                    `[TS Cleanup] Permanently deleted ${permDeleted} recycled texture sets ✓`,
                );
            }
        }
    } catch (e) {
        console.log(`[TS Cleanup] Warning: cleanup failed: ${e}`);
    }
}

/**
 * Remove ALL sprites accumulated from previous test runs.
 * 73+ sprites causes "Load More" pagination — freshly uploaded sprites
 * land alphabetically in the middle, invisible without scrolling.
 */
export async function cleanupStaleSprites(): Promise<void> {
    try {
        const response = await fetch(`${API_BASE}/sprites?pageSize=500&page=1`);
        if (!response.ok) {
            console.log(
                `[Sprite Cleanup] GET /sprites returned ${response.status}, skipping`,
            );
            return;
        }
        const data = (await response.json()) as {
            sprites: Array<{ id: number; name: string }>;
        };
        const all = data.sprites || [];
        console.log(`[Sprite Cleanup] Found ${all.length} sprites`);

        if (all.length <= 5) {
            console.log(`[Sprite Cleanup] Count is manageable, skipping`);
            return;
        }

        let deleted = 0;
        for (const sprite of all) {
            const r = await fetch(`${API_BASE}/sprites/${sprite.id}`, {
                method: "DELETE",
            });
            if (r.ok || r.status === 204) deleted++;
        }
        console.log(
            `[Sprite Cleanup] Soft-deleted ${deleted}/${all.length} sprites`,
        );

        // Permanently delete ALL recycled sprites
        const recycledResp = await fetch(`${API_BASE}/recycled`);
        if (recycledResp.ok) {
            const recycled = (await recycledResp.json()) as {
                sprites?: Array<{ id: number }>;
            };
            const recycledSprites = recycled.sprites || [];
            let permDeleted = 0;
            for (const s of recycledSprites) {
                const r = await fetch(
                    `${API_BASE}/recycled/sprite/${s.id}/permanent`,
                    { method: "DELETE" },
                );
                if (r.ok || r.status === 204) permDeleted++;
            }
            if (permDeleted > 0) {
                console.log(
                    `[Sprite Cleanup] Permanently deleted ${permDeleted} recycled sprites ✓`,
                );
            }
        }
    } catch (e) {
        console.log(`[Sprite Cleanup] Warning: cleanup failed: ${e}`);
    }
}

/**
 * Remove accumulated sounds from previous test runs.
 */
export async function cleanupStaleSounds(): Promise<void> {
    try {
        const response = await fetch(`${API_BASE}/sounds?pageSize=500&page=1`);
        if (!response.ok) return;
        const data = (await response.json()) as {
            sounds: Array<{ id: number; name: string }>;
        };
        const all = data.sounds || [];
        console.log(`[Sound Cleanup] Found ${all.length} sounds`);

        if (all.length === 0) return;

        let deleted = 0;
        for (const sound of all) {
            const r = await fetch(`${API_BASE}/sounds/${sound.id}`, {
                method: "DELETE",
            });
            if (r.ok || r.status === 204) deleted++;
        }
        console.log(
            `[Sound Cleanup] Soft-deleted ${deleted}/${all.length} sounds`,
        );

        // Permanently delete ALL recycled sounds
        const recycledResp = await fetch(`${API_BASE}/recycled`);
        if (recycledResp.ok) {
            const recycled = (await recycledResp.json()) as {
                sounds?: Array<{ id: number }>;
            };
            const recycledSounds = recycled.sounds || [];
            let permDeleted = 0;
            for (const s of recycledSounds) {
                const r = await fetch(
                    `${API_BASE}/recycled/sound/${s.id}/permanent`,
                    { method: "DELETE" },
                );
                if (r.ok || r.status === 204) permDeleted++;
            }
            if (permDeleted > 0) {
                console.log(
                    `[Sound Cleanup] Permanently deleted ${permDeleted} recycled sounds ✓`,
                );
            }
        }
    } catch (e) {
        console.log(`[Sound Cleanup] Warning: cleanup failed: ${e}`);
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
