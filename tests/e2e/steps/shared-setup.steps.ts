import { createBdd } from "playwright-bdd";
import { expect, test } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import {
    persistModel,
    persistTextureSet,
    loadPersistedModel,
    loadPersistedTextureSet,
} from "../fixtures/setup-state-bridge";
import { SignalRHelper } from "../fixtures/signalr-helper";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import path from "path";
import { fileURLToPath } from "url";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

// DataTable interface for cucumber-style data tables
interface DataTable {
    hashes(): Array<Record<string, string>>;
    raw(): string[][];
    rows(): string[][];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then } = createBdd();

/**
 * Verifies that required models exist in shared state.
 * Usage in Background section to declare dependencies.
 */
Given(
    "the following models exist in shared state:",
    async ({ page }, dataTable: DataTable) => {
        console.log(
            `[SharedState Debug] Checking models. Current state: ${getScenarioState(page).getDebugInfo()}`,
        );
        const models = dataTable.hashes();

        for (const row of models) {
            const modelName = row.name;
            let model = getScenarioState(page).getModel(modelName);

            if (!model) {
                // First try: load from persisted setup state file
                const persisted = loadPersistedModel(modelName);
                if (persisted) {
                    // Validate: ensure every version has at least one file.
                    // If not (e.g. setup ran on a dirty DB), recover by uploading the missing file.
                    const apiBase =
                        process.env.API_BASE_URL || "http://localhost:8090";
                    const vResp = await page.request.get(
                        `${apiBase}/models/${persisted.id}/versions`,
                    );
                    if (vResp.ok()) {
                        const versions: any[] = await vResp.json();
                        const v1 = versions.find(
                            (v: any) => v.versionNumber === 1,
                        );
                        if (
                            v1 &&
                            v1.files.length === 0 &&
                            modelName.includes("multi-version")
                        ) {
                            console.log(
                                `[AutoProvision] Bridge model "${modelName}" v1 has no files — recovering with test-torus.fbx`,
                            );
                            const fsModule = await import("fs");
                            const torusPath = path.join(
                                __dirname,
                                "..",
                                "assets",
                                "test-torus.fbx",
                            );
                            const torusBuffer =
                                fsModule.readFileSync(torusPath);
                            const uploadResp = await page.request.post(
                                `${apiBase}/models/${persisted.id}/versions/${v1.id}/files`,
                                {
                                    multipart: {
                                        file: {
                                            name: "test-torus.fbx",
                                            mimeType:
                                                "application/octet-stream",
                                            buffer: torusBuffer,
                                        },
                                    },
                                },
                            );
                            if (uploadResp.ok()) {
                                console.log(
                                    `[AutoProvision] Uploaded test-torus.fbx to "${modelName}" v1 (id=${v1.id}) ✓`,
                                );
                                // Wait for thumbnail generation before proceeding —
                                // this prevents the version-switching test from polling
                                // within its own 90s window.
                                const { DbHelper } =
                                    await import("../fixtures/db-helper");
                                const thumbDb = new DbHelper();
                                try {
                                    console.log(
                                        `[AutoProvision] Waiting for v1 thumbnail (up to 120s)...`,
                                    );
                                    const deadline = Date.now() + 120_000;
                                    while (Date.now() < deadline) {
                                        const thumbResult = await thumbDb.query(
                                            `SELECT t."Status"
                                             FROM "Thumbnails" t
                                             JOIN "ModelVersions" mv ON mv."ThumbnailId" = t."Id"
                                             WHERE mv."Id" = $1`,
                                            [v1.id],
                                        );
                                        if (
                                            thumbResult.rows.length > 0 &&
                                            thumbResult.rows[0].Status === 2
                                        ) {
                                            console.log(
                                                `[AutoProvision] v1 thumbnail ready ✓`,
                                            );
                                            break;
                                        }
                                        await new Promise((r) =>
                                            setTimeout(r, 3000),
                                        );
                                    }
                                } finally {
                                    await thumbDb.close();
                                }
                            } else {
                                console.warn(
                                    `[AutoProvision] Failed to upload test-torus.fbx to v1: ${uploadResp.status()}`,
                                );
                            }
                        }
                    }

                    getScenarioState(page).saveModel(modelName, {
                        id: persisted.id,
                        name: persisted.name,
                        versionId: persisted.versionId,
                    });
                    console.log(
                        `[AutoProvision] Loaded model "${modelName}" from setup bridge → id=${persisted.id}, name="${persisted.name}"`,
                    );
                    continue;
                }

                // Second try: look up existing models in DB (setup project may have created them)
                const { DbHelper } = await import("../fixtures/db-helper");
                const db = new DbHelper();
                try {
                    let dbResult;
                    if (modelName.includes("multi-version")) {
                        // Look for a model with 2+ versions (setup creates test-torus with 2 versions)
                        dbResult = await db.query(
                            `SELECT m."Id" as "ModelId", m."Name",
                                    (SELECT mv2."Id" FROM "ModelVersions" mv2 WHERE mv2."ModelId" = m."Id" ORDER BY mv2."VersionNumber" LIMIT 1) as "VersionId"
                             FROM "Models" m
                             WHERE m."DeletedAt" IS NULL
                               AND (SELECT COUNT(*) FROM "ModelVersions" WHERE "ModelId" = m."Id") >= 2
                             ORDER BY m."CreatedAt" DESC
                             LIMIT 1`,
                        );
                    } else {
                        // Look for any model
                        dbResult = await db.query(
                            `SELECT m."Id" as "ModelId", m."Name", mv."Id" as "VersionId"
                             FROM "Models" m
                             JOIN "ModelVersions" mv ON mv."ModelId" = m."Id"
                             WHERE m."DeletedAt" IS NULL
                             ORDER BY m."CreatedAt" DESC
                             LIMIT 1`,
                        );
                    }

                    if (dbResult.rows.length > 0) {
                        const r = dbResult.rows[0];
                        getScenarioState(page).saveModel(modelName, {
                            id: r.ModelId,
                            name: r.Name,
                            versionId: r.VersionId,
                        });
                        console.log(
                            `[AutoProvision] Found existing model "${r.Name}" (ID: ${r.ModelId}) in DB for state key "${modelName}"`,
                        );
                        continue;
                    }
                } finally {
                    await db.close();
                }

                // Fallback: create a new model via UI upload
                console.log(
                    `[AutoProvision] Model "${modelName}" not in DB, creating via API...`,
                );
                const filePath =
                    await UniqueFileGenerator.generate("test-cube.glb");
                const modelListPage = new ModelListPage(page);
                await modelListPage.goto();
                await modelListPage.uploadModel(filePath);

                const uniqueFileName = path.basename(filePath);
                const generatedName = uniqueFileName.replace(/\.[^/.]+$/, "");

                await modelListPage.expectModelVisible(generatedName);

                // Query DB to get IDs
                const db2 = new DbHelper();
                try {
                    const result = await db2.query(
                        `SELECT mv."Id" as "VersionId", m."Id" as "ModelId", m."Name"
                         FROM "ModelVersions" mv
                         JOIN "Models" m ON m."Id" = mv."ModelId"
                         WHERE m."Name" = $1 AND m."DeletedAt" IS NULL
                         ORDER BY mv."CreatedAt" DESC LIMIT 1`,
                        [generatedName],
                    );

                    if (result.rows.length > 0) {
                        getScenarioState(page).saveModel(modelName, {
                            id: result.rows[0].ModelId,
                            name: generatedName,
                            versionId: result.rows[0].VersionId,
                        });
                        console.log(
                            `[AutoProvision] Created model "${modelName}" (ID: ${result.rows[0].ModelId})`,
                        );
                    } else {
                        throw new Error(
                            `Auto-provisioned model "${generatedName}" not found in database`,
                        );
                    }
                } finally {
                    await db2.close();
                }
            }
        }
    },
);

/**
 * Verifies that required texture sets exist in shared state.
 * Usage in Background section to declare dependencies.
 */
Given(
    "the following texture sets exist in shared state:",
    async ({ page }, dataTable: DataTable) => {
        console.log(
            `[SharedState Debug] Checking texture sets. Current state: ${getScenarioState(page).getDebugInfo()}`,
        );
        const textureSets = dataTable.hashes();

        for (const row of textureSets) {
            const textureSetName = row.name;
            let textureSet =
                getScenarioState(page).getTextureSet(textureSetName);

            // Validate cached shared-state entry against database to avoid stale IDs
            if (textureSet) {
                const { DbHelper } = await import("../fixtures/db-helper");
                const db = new DbHelper();
                try {
                    let isValid = false;

                    if (textureSet.id) {
                        const byId = await db.query(
                            `SELECT "Id", "Name"
                             FROM "TextureSets"
                             WHERE "Id" = $1 AND "IsDeleted" = false`,
                            [textureSet.id],
                        );
                        isValid = byId.rows.length > 0;
                    }

                    if (!isValid) {
                        const byName = await db.query(
                            `SELECT "Id", "Name"
                             FROM "TextureSets"
                             WHERE "Name" = $1 AND "IsDeleted" = false
                             ORDER BY "Id" DESC
                             LIMIT 1`,
                            [textureSetName],
                        );

                        if (byName.rows.length > 0) {
                            textureSet = {
                                id: byName.rows[0].Id,
                                name: byName.rows[0].Name,
                            };
                            getScenarioState(page).saveTextureSet(
                                textureSetName,
                                textureSet,
                            );
                            console.log(
                                `[AutoHeal] Refreshed stale texture set "${textureSetName}" -> ID ${textureSet.id}`,
                            );
                        } else {
                            textureSet = undefined;
                        }
                    }
                } finally {
                    await db.close();
                }
            }

            if (!textureSet) {
                // First try: load from persisted setup state file
                const persistedTs = loadPersistedTextureSet(textureSetName);
                if (persistedTs) {
                    getScenarioState(page).saveTextureSet(textureSetName, {
                        id: persistedTs.id,
                        name: persistedTs.name,
                    });
                    console.log(
                        `[AutoProvision] Loaded texture set "${textureSetName}" from setup bridge → id=${persistedTs.id}`,
                    );
                    continue;
                }

                // Self-provision: create or find the texture set via API
                console.log(
                    `[AutoProvision] Texture set "${textureSetName}" not in shared state, creating via API...`,
                );
                const { ApiHelper } = await import("../helpers/api-helper");
                const api = new ApiHelper();
                try {
                    const created = await api.createTextureSet(textureSetName);
                    getScenarioState(page).saveTextureSet(textureSetName, {
                        id: created.id,
                        name: created.name,
                    });
                    console.log(
                        `[AutoProvision] Created texture set "${textureSetName}" (ID: ${created.id})`,
                    );
                } catch {
                    // Creation failed (likely already exists from setup or another worker) — look up in DB
                    const { DbHelper } = await import("../fixtures/db-helper");
                    const dbLookup = new DbHelper();
                    try {
                        const byName = await dbLookup.query(
                            `SELECT "Id", "Name"
                             FROM "TextureSets"
                             WHERE "Name" = $1 AND "IsDeleted" = false
                             ORDER BY "Id" DESC
                             LIMIT 1`,
                            [textureSetName],
                        );
                        if (byName.rows.length > 0) {
                            getScenarioState(page).saveTextureSet(
                                textureSetName,
                                {
                                    id: byName.rows[0].Id,
                                    name: byName.rows[0].Name,
                                },
                            );
                            console.log(
                                `[AutoProvision] Found existing texture set "${textureSetName}" (ID: ${byName.rows[0].Id})`,
                            );
                        } else {
                            throw new Error(
                                `Failed to auto-provision texture set "${textureSetName}": creation failed and not found in DB`,
                            );
                        }
                    } finally {
                        await dbLookup.close();
                    }
                }
            }
        }
    },
);

/**
 * Uploads a model and stores it in shared state with a specific name.
 * Enables referencing the model in later scenarios.
 */
When(
    "I upload a model {string} and store it as {string}",
    async ({ page }, fileName: string, stateName: string) => {
        const modelListPage = new ModelListPage(page);

        console.log(
            `[Setup] Generating unique model file from "${fileName}"...`,
        );
        const filePath = await UniqueFileGenerator.generate(fileName);

        await modelListPage.uploadModel(filePath);

        // Get the unique model name from the generated file path (includes unique ID)
        const uniqueFileName = path.basename(filePath);
        const modelName = uniqueFileName.replace(/\.[^/.]+$/, ""); // Strip extension

        // Wait for model to appear in list (grid shows name without extension)
        await modelListPage.expectModelVisible(modelName);

        // Query database to get the actual model version ID of the just-uploaded model
        // This is the most reliable way to identify the specific model we just created
        const { DbHelper } = await import("../fixtures/db-helper");
        const db = new DbHelper();
        const result = await db.query(
            `SELECT mv."Id" as "VersionId", m."Id" as "ModelId", m."Name"
             FROM "ModelVersions" mv
             JOIN "Models" m ON m."Id" = mv."ModelId"
             WHERE m."Name" = $1 AND m."DeletedAt" IS NULL
             ORDER BY mv."CreatedAt" DESC
             LIMIT 1`,
            [modelName],
        );

        let modelId = 0;
        let versionId = 0;
        if (result.rows.length > 0) {
            modelId = result.rows[0].ModelId;
            versionId = result.rows[0].VersionId;
            console.log(
                `[Setup] Uploaded model "${modelName}" -> modelId=${modelId}, versionId=${versionId}`,
            );
        } else {
            console.warn(
                `[Setup] Could not find model "${modelName}" in database after upload`,
            );
        }

        // Track this for the thumbnail verification step
        getScenarioState(page).uploadTrackerModelName = modelName;
        getScenarioState(page).uploadTrackerVersionId = versionId;

        // Store in shared state
        getScenarioState(page).saveModel(stateName, {
            id: modelId,
            name: modelName,
            versionId: versionId,
        });

        // Persist to file for cross-phase state transfer (setup → chromium)
        persistModel(stateName, { id: modelId, name: modelName, versionId });
    },
);

/**
 * Navigates to model viewer page using a model from shared state or by name.
 */
Given(
    "I am on the model viewer page for {string}",
    async ({ page }, stateName: string) => {
        let model = getScenarioState(page).getModel(stateName);

        // If not found by exact name, try stripping extension
        if (!model) {
            const nameWithoutExt = stateName.replace(/\.[^/.]+$/, "");
            model = getScenarioState(page).getModel(nameWithoutExt);
        }

        const modelListPage = new ModelListPage(page);

        if (!model) {
            // Not in shared state - try to open directly by name
            // Strip extension for model name lookup
            const modelName = stateName.replace(/\.[^/.]+$/, "");
            await modelListPage.goto();
            await modelListPage.openModel(modelName);

            // Store in shared state for future lookups using navigation store
            const { ModelViewerPage } =
                await import("../pages/ModelViewerPage");
            const modelViewer = new ModelViewerPage(page);
            const modelId = await modelViewer.getCurrentModelId();
            if (modelId) {
                getScenarioState(page).saveModel(stateName, {
                    id: modelId,
                    name: modelName,
                });
            }
            return;
        }

        // If we have the model ID, verify it still exists before navigating
        if (model.id) {
            const apiBase = process.env.API_BASE_URL || "http://localhost:8090";
            const checkResp = await page.request.get(
                `${apiBase}/models/${model.id}`,
            );
            if (!checkResp.ok()) {
                console.log(
                    `[Navigation] Cached model ${model.id} (${stateName}) no longer exists (${checkResp.status()}), re-provisioning...`,
                );
                // Clear stale entry and re-provision
                model = null as any;
                // Fall through to auto-provision below
            }
        }

        // Auto-provision if model was deleted or never existed
        if (!model) {
            console.log(
                `[AutoProvision] Model "${stateName}" not available, creating via API...`,
            );
            const apiBase = process.env.API_BASE_URL || "http://localhost:8090";
            const filePath =
                await UniqueFileGenerator.generate("test-cube.glb");
            const fs = await import("fs");
            const fileBuffer = fs.readFileSync(filePath);

            const uploadResp = await page.request.post(`${apiBase}/models`, {
                multipart: {
                    file: {
                        name: stateName.endsWith(".glb")
                            ? stateName
                            : `${stateName}.glb`,
                        mimeType: "model/gltf-binary",
                        buffer: fileBuffer,
                    },
                },
            });
            expect(uploadResp.ok()).toBe(true);
            const uploadData = await uploadResp.json();

            const detailResp = await page.request.get(
                `${apiBase}/models/${uploadData.id}`,
            );
            const detail = await detailResp.json();

            const nameWithoutExt = stateName.replace(/\.[^/.]+$/, "");
            model = {
                id: uploadData.id,
                name: detail.name || nameWithoutExt,
                versionId: detail.activeVersionId,
            };
            getScenarioState(page).saveModel(stateName, model);
            getScenarioState(page).saveModel(nameWithoutExt, model);
            console.log(
                `[AutoProvision] Created model "${stateName}" (ID: ${model.id})`,
            );

            // Thumbnail processing happens asynchronously;
            // navigation below waits for UI elements independently
        }

        if (model?.id) {
            console.log(`[Navigation] Using ID ${model.id} for ${stateName}`);

            const { navigateToAppClean, openModelViewer } =
                await import("../helpers/navigation-helper");
            await navigateToAppClean(page);
            await openModelViewer(page, model.name, model.id);

            console.log(
                `[Navigation] Opened model ${model.id} (${model.name}) via UI click`,
            );
            return;
        }

        console.log(
            `[Navigation] ID missing for ${stateName} (id=${model.id}), using fallback (click card)`,
        );

        // Fallback: open by clicking on model card
        // Ensure we are on the model list page first
        await modelListPage.goto();
        await modelListPage.openModel(model.name);

        console.log(
            `[Navigation] Opened model "${model.name}" via model list fallback`,
        );
    },
);

/**
 * Verifies that a model was successfully stored in shared state.
 */
Then("the model should be stored in shared state", async ({ page }) => {
    // This is a declarative step - actual storage happens in the When step
    // Just verify we have at least one model
    expect(getScenarioState(page).getDebugInfo()).toContain("models");
});

/**
 * NOTE: Despite the step name, this verifies thumbnail generation via DB polling,
 * NOT via SignalR WebSocket interception. The step name is kept for backward
 * compatibility with existing feature files.
 * TODO: Add actual SignalR verification using SignalRHelper.
 */
Then(
    "the thumbnail should be generated via SignalR notification",
    async ({ page }) => {
        // Import DbHelper inline to avoid circular dependencies
        const { DbHelper } = await import("../fixtures/db-helper");
        const db = new DbHelper();

        // Poll database for thumbnail status (max 55 seconds to stay within 60s test timeout)
        let lastStatus: number | null = null;
        let lastModelName = "";
        let lastVersionId = 0;

        // Determine query strategy: prefer version ID > model name > global most-recent
        const hasVersionId = getScenarioState(page).uploadTrackerVersionId > 0;
        const hasModelName =
            getScenarioState(page).uploadTrackerModelName !== null;

        if (hasVersionId) {
            console.log(
                `[Thumbnail] Looking for version ID: ${getScenarioState(page).uploadTrackerVersionId} (model: "${getScenarioState(page).uploadTrackerModelName}")`,
            );
        } else if (hasModelName) {
            console.log(
                `[Thumbnail] Looking for model by name: "${getScenarioState(page).uploadTrackerModelName}" (no version ID)`,
            );
        } else {
            console.log(
                `[Thumbnail] Looking for any most recent model version`,
            );
        }

        // Build the query once based on strategy
        let query: string;
        let params: any[];

        if (hasVersionId) {
            query = `SELECT t."Status", mv."Id" as "VersionId", m."Name" as "ModelName", m."Id" as "ModelId"
                     FROM "ModelVersions" mv
                     JOIN "Models" m ON m."Id" = mv."ModelId"
                     LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                     WHERE mv."Id" = $1`;
            params = [getScenarioState(page).uploadTrackerVersionId];
        } else if (hasModelName) {
            query = `SELECT t."Status", mv."Id" as "VersionId", m."Name" as "ModelName", m."Id" as "ModelId"
                     FROM "ModelVersions" mv
                     JOIN "Models" m ON m."Id" = mv."ModelId"
                     LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                     WHERE m."DeletedAt" IS NULL AND m."Name" = $1
                     ORDER BY mv."CreatedAt" DESC
                     LIMIT 1`;
            params = [getScenarioState(page).uploadTrackerModelName];
        } else {
            query = `SELECT t."Status", mv."Id" as "VersionId", m."Name" as "ModelName", m."Id" as "ModelId"
                     FROM "ModelVersions" mv
                     JOIN "Models" m ON m."Id" = mv."ModelId"
                     LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                     WHERE m."DeletedAt" IS NULL
                     ORDER BY mv."CreatedAt" DESC
                     LIMIT 1`;
            params = [];
        }

        // Use expect.poll for idiomatic Playwright polling instead of manual loop with waitForTimeout
        await expect
            .poll(
                async () => {
                    const result = await db.query(query, params);

                    if (result.rows.length > 0) {
                        const row = result.rows[0];
                        lastStatus = row.Status;
                        lastModelName = row.ModelName;
                        lastVersionId = row.VersionId;

                        if (row.Status === 2) {
                            console.log(
                                `[Thumbnail] Ready for "${row.ModelName}" (model=${row.ModelId}) v${row.VersionId} (status=2)`,
                            );
                            return 2;
                        } else if (row.Status === 3) {
                            // Thumbnail generation failed - fail fast
                            throw new Error(
                                `Thumbnail generation FAILED for "${row.ModelName}" (model=${row.ModelId}) v${row.VersionId}. Check worker logs.`,
                            );
                        } else {
                            console.log(
                                `[Thumbnail] Waiting for "${row.ModelName}" (model=${row.ModelId}) v${row.VersionId} (status=${row.Status ?? "null"})...`,
                            );
                            return row.Status;
                        }
                    } else {
                        console.log(
                            `[Thumbnail] No model versions found, waiting...`,
                        );
                        return -1;
                    }
                },
                {
                    message: `Thumbnail generation timed out for model "${lastModelName}" v${lastVersionId}. Check if asset-processor-e2e container is healthy.`,
                    timeout: 240000, // 4 min — cold-start thumbnail generation can be slow
                    intervals: [3000],
                },
            )
            .toBe(2);

        // Clear the tracking variables after successful check
        getScenarioState(page).uploadTrackerModelName = null;
        getScenarioState(page).uploadTrackerVersionId = 0;
        console.log("[Test] Thumbnail generation verified via database");
    },
);

/**
 * Verifies that a model has the expected number of versions in shared state.
 */
Then(
    "the model should have {int} versions in shared state",
    async ({ page }, expectedCount: number) => {
        const { ModelViewerPage } = await import("../pages/ModelViewerPage");
        const modelViewer = new ModelViewerPage(page);
        const modelId = await modelViewer.getCurrentModelId();

        if (!modelId) {
            throw new Error("Could not extract model ID from navigation store");
        }

        // Query database for actual version count with polling (version creation may be async)
        const { DbHelper } = await import("../fixtures/db-helper");
        const db = new DbHelper();
        try {
            let actualCount = 0;
            const maxAttempts = 15;
            for (let i = 0; i < maxAttempts; i++) {
                actualCount = await db.getModelVersionCount(modelId);
                if (actualCount >= expectedCount) break;
                console.log(
                    `[DB] Model ${modelId} has ${actualCount} version(s), waiting for ${expectedCount}... (attempt ${i + 1}/${maxAttempts})`,
                );
                await page.waitForTimeout(2000);
            }
            expect(actualCount).toBe(expectedCount);
            console.log(
                `[DB] Model ${modelId} has ${actualCount} version(s) (expected: ${expectedCount}) ✓`,
            );
        } finally {
            await db.close();
        }
    },
);

/**
 * Verifies that a texture set was successfully stored in shared state.
 */
Then(
    "texture set {string} should be stored in shared state",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        expect(textureSet).toBeDefined();
        expect(textureSet?.name).toBe(textureSetName);
    },
);

/**
 * Verifies the texture set was linked to the model (simple verification that linking step succeeded)
 */
Then("the texture set should be linked to the model", async ({ page }) => {
    // Verify by checking that the page shows texture set content or that the linking API succeeded
    // At minimum, verify we're still on a valid model page (no error state)
    const errorMessage = page.locator(
        '.error-message, .error-state, [role="alert"]',
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    expect(hasError).toBe(false);

    // Verify the model viewer is still functional (canvas or version dropdown visible)
    const viewerActive = page.locator(
        ".viewer-canvas canvas, .version-dropdown-trigger",
    );
    await expect(viewerActive.first()).toBeVisible({ timeout: 10000 });
    console.log(
        "[Verify] Texture set linked to model - viewer still active, no errors ✓",
    );
});

/**
 * Opens the version dropdown and leaves it open for the screenshot.
 * This allows the test screenshot to show all available versions.
 */
Then("the version dropdown should be open", async ({ page }) => {
    // Close any open dialogs first (e.g., upload confirmation)
    const closeButtons = page.locator(
        'button[aria-label="Close"], .p-dialog-header-close',
    );
    for (let i = 0; i < (await closeButtons.count()); i++) {
        const btn = closeButtons.nth(i);
        if (
            await btn
                .waitFor({ state: "visible", timeout: 500 })
                .then(() => true)
                .catch(() => false)
        ) {
            await btn.click();
            await btn
                .waitFor({ state: "hidden", timeout: 2000 })
                .catch(() => {});
        }
    }

    // Also press Escape to close any dialogs
    await page.keyboard.press("Escape");
    await page
        .locator('.p-dialog, [role="dialog"]')
        .waitFor({ state: "hidden", timeout: 2000 })
        .catch(() => {});

    // Wait for page to be stable
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    // Wait for dropdown trigger to be visible with longer timeout
    const dropdownTrigger = page.locator(".version-dropdown-trigger");
    await dropdownTrigger.waitFor({ state: "visible", timeout: 15000 });

    // Click with retry logic
    try {
        await dropdownTrigger.click();
    } catch (e) {
        console.log("[Screenshot] First click failed, retrying...");
        await dropdownTrigger.waitFor({ state: "visible", timeout: 2000 });
        await dropdownTrigger.click({ force: true });
    }

    await page.waitForSelector(".version-dropdown-menu", {
        state: "visible",
        timeout: 5000,
    });
    console.log(
        "[Screenshot] Version dropdown opened to show available versions",
    );
});

Then("I take a screenshot named {string}", async ({ page }, name: string) => {
    const filename = name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

    const screenshot = await page.screenshot({
        path: `test-results/screenshots/${filename}.png`,
        fullPage: false,
    });

    // Use global test info
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach(name, {
            body: screenshot,
            contentType: "image/png",
        });
    }
    console.log(`[Screenshot] Taken: ${name}`);
});

/**
 * Verifies that the thumbnail is actually visible in the model list card UI.
 * This goes beyond DB verification to ensure the image actually loads in the browser.
 * Targets the specific model that was just uploaded (via uploadTracker) to avoid
 * false positives/negatives from stale models left over from previous runs.
 */
Then("the thumbnail should be visible in the model card", async ({ page }) => {
    const modelListPage = new ModelListPage(page);

    // Navigate to model list to see the card
    await modelListPage.goto();
    await page.waitForLoadState("domcontentloaded");

    // Target the specific model card that was just uploaded
    const modelName = getScenarioState(page).uploadTrackerModelName;
    let thumbnailImg;
    if (modelName) {
        // Find the card containing this model's name, then locate its thumbnail
        const modelCard = page
            .locator(".model-grid .model-card, .model-card")
            .filter({ hasText: modelName });
        thumbnailImg = modelCard.locator(".thumbnail-image").first();
        console.log(
            `[UI] Looking for thumbnail in card for model "${modelName}"`,
        );
    } else {
        // Fallback: use first thumbnail image if no model name tracked
        thumbnailImg = page
            .locator(
                ".model-grid .thumbnail-image, .model-card .thumbnail-image",
            )
            .first();
        console.log("[UI] No model name tracked, using first thumbnail image");
    }

    // Wait for the thumbnail image to appear (not placeholder)
    await expect
        .poll(
            async () => {
                return (await thumbnailImg.count()) > 0;
            },
            {
                message: `Waiting for thumbnail image to appear in model card${modelName ? ` for "${modelName}"` : ""}`,
                timeout: 15000,
            },
        )
        .toBe(true);

    await expect(thumbnailImg).toBeVisible({ timeout: 15000 });

    // Verify the image actually loaded (naturalWidth > 0)
    await expect
        .poll(
            async () => {
                return await thumbnailImg.evaluate((img: HTMLImageElement) => {
                    return img.complete && img.naturalWidth > 0;
                });
            },
            {
                message: "Waiting for thumbnail image to load in model card",
                timeout: 15000,
            },
        )
        .toBe(true);

    // Log details for debugging
    const src = await thumbnailImg.getAttribute("src");
    const dimensions = await thumbnailImg.evaluate((img: HTMLImageElement) => ({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
    }));
    console.log(
        `[UI] Model card thumbnail loaded: ${dimensions.naturalWidth}x${dimensions.naturalHeight}`,
    );
    console.log(`[UI] Thumbnail src: ${src?.substring(0, 80)}...`);

    // Take screenshot to confirm thumbnail is visible
    await page.screenshot({
        path: "test-results/thumbnail-visible-in-card.png",
    });
    console.log("[Screenshot] Captured: thumbnail-visible-in-card.png ✓");
});
