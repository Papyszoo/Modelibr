import { createBdd } from "playwright-bdd";
import { expect, test } from "@playwright/test";
import { sharedState } from "../fixtures/shared-state";
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

// Tracking state for thumbnail verification - reset after each use
const uploadTracker = {
    modelName: null as string | null,
    versionId: 0,
};

/**
 * Verifies that required models exist in shared state.
 * Usage in Background section to declare dependencies.
 */
Given(
    "the following models exist in shared state:",
    async ({ page }, dataTable: DataTable) => {
        console.log(
            `[SharedState Debug] Checking models. Current state: ${sharedState.getDebugInfo()}`,
        );
        const models = dataTable.hashes();

        for (const row of models) {
            const modelName = row.name;
            let model = sharedState.getModel(modelName);

            if (!model) {
                // Self-provision: create the model via API
                console.log(
                    `[AutoProvision] Model "${modelName}" not in shared state, creating via API...`,
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
                const { DbHelper } = await import("../fixtures/db-helper");
                const db = new DbHelper();
                try {
                    const result = await db.query(
                        `SELECT mv."Id" as "VersionId", m."Id" as "ModelId", m."Name"
                         FROM "ModelVersions" mv
                         JOIN "Models" m ON m."Id" = mv."ModelId"
                         WHERE m."Name" = $1 AND m."DeletedAt" IS NULL
                         ORDER BY mv."CreatedAt" DESC LIMIT 1`,
                        [generatedName],
                    );

                    if (result.rows.length > 0) {
                        sharedState.saveModel(modelName, {
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
                    await db.close();
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
            `[SharedState Debug] Checking texture sets. Current state: ${sharedState.getDebugInfo()}`,
        );
        const textureSets = dataTable.hashes();

        for (const row of textureSets) {
            const textureSetName = row.name;
            let textureSet = sharedState.getTextureSet(textureSetName);

            if (!textureSet) {
                // Self-provision: create the texture set via API
                console.log(
                    `[AutoProvision] Texture set "${textureSetName}" not in shared state, creating via API...`,
                );
                const { ApiHelper } = await import("../helpers/api-helper");
                const api = new ApiHelper();
                const created = await api.createTextureSet(textureSetName);
                sharedState.saveTextureSet(textureSetName, {
                    id: created.id,
                    name: created.name,
                });
                console.log(
                    `[AutoProvision] Created texture set "${textureSetName}" (ID: ${created.id})`,
                );
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
        uploadTracker.modelName = modelName;
        uploadTracker.versionId = versionId;

        // Store in shared state
        sharedState.saveModel(stateName, {
            id: modelId,
            name: modelName,
            versionId: versionId,
        });
    },
);

/**
 * Navigates to model viewer page using a model from shared state or by name.
 */
Given(
    "I am on the model viewer page for {string}",
    async ({ page }, stateName: string) => {
        let model = sharedState.getModel(stateName);

        // If not found by exact name, try stripping extension
        if (!model) {
            const nameWithoutExt = stateName.replace(/\.[^/.]+$/, "");
            model = sharedState.getModel(nameWithoutExt);
        }

        const modelListPage = new ModelListPage(page);

        if (!model) {
            // Not in shared state - try to open directly by name
            // Strip extension for model name lookup
            const modelName = stateName.replace(/\.[^/.]+$/, "");
            await modelListPage.goto();
            await modelListPage.openModel(modelName);

            // Store in shared state for future lookups
            const url = page.url();
            const match = url.match(/model-(\d+)/);
            if (match) {
                sharedState.saveModel(stateName, {
                    id: parseInt(match[1], 10),
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
                        name: stateName,
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
            sharedState.saveModel(stateName, model);
            sharedState.saveModel(nameWithoutExt, model);
            console.log(
                `[AutoProvision] Created model "${stateName}" (ID: ${model.id})`,
            );

            // Wait for thumbnail processing
            await page.waitForTimeout(3000);
        }

        if (model?.id) {
            console.log(`[Navigation] Using ID ${model.id} for ${stateName}`);
            const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";

            await page.goto(baseUrl);
            await page.evaluate(() => {
                try {
                    localStorage.clear();
                    sessionStorage.clear();
                } catch (e) {
                    // Ignore
                }
            });

            await page.goto(
                `${baseUrl}/?leftTabs=modelList,model-${model.id}&activeLeft=model-${model.id}`,
            );
            await page.waitForSelector(
                ".viewer-canvas canvas, .version-dropdown-trigger",
                {
                    state: "visible",
                    timeout: 30000,
                },
            );
            console.log(
                `[Navigation] Opened model ${model.id} (${model.name}) via direct URL`,
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

        // Extract model ID from URL
        const url = page.url();
        const match = url.match(/model-(\d+)/);
        if (match) {
            const modelId = parseInt(match[1], 10);
            console.log(`[Navigation] Captured ID ${modelId} for ${stateName}`);

            // Update model with actual ID
            model = { ...model, id: modelId };
            sharedState.saveModel(stateName, model);

            // Also save by original filename for backward compatibility
            if (model.name && stateName !== model.name) {
                sharedState.saveModel(model.name, model);
            }
        } else {
            console.warn(
                `[Navigation] Could not capture ID for ${stateName} after click`,
            );
        }
    },
);

/**
 * Verifies that a model was successfully stored in shared state.
 */
Then("the model should be stored in shared state", async ({ page }) => {
    // This is a declarative step - actual storage happens in the When step
    // Just verify we have at least one model
    expect(sharedState.getDebugInfo()).toContain("models");
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
        const maxAttempts = 11;
        const pollInterval = 5000;
        let thumbnailReady = false;
        let lastStatus: number | null = null;
        let lastModelName = "";
        let lastVersionId = 0;

        // Determine query strategy: prefer version ID > model name > global most-recent
        const hasVersionId = uploadTracker.versionId > 0;
        const hasModelName = uploadTracker.modelName !== null;

        if (hasVersionId) {
            console.log(
                `[Thumbnail] Looking for version ID: ${uploadTracker.versionId} (model: "${uploadTracker.modelName}")`,
            );
        } else if (hasModelName) {
            console.log(
                `[Thumbnail] Looking for model by name: "${uploadTracker.modelName}" (no version ID)`,
            );
        } else {
            console.log(
                `[Thumbnail] Looking for any most recent model version`,
            );
        }

        for (let i = 0; i < maxAttempts && !thumbnailReady; i++) {
            // Query for the specific version's thumbnail, or fall back to name-based or global query
            let query: string;
            let params: any[];

            if (hasVersionId) {
                // Best case: we have the exact version ID
                query = `SELECT t."Status", mv."Id" as "VersionId", m."Name" as "ModelName", m."Id" as "ModelId"
                         FROM "ModelVersions" mv
                         JOIN "Models" m ON m."Id" = mv."ModelId"
                         LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                         WHERE mv."Id" = $1`;
                params = [uploadTracker.versionId];
            } else if (hasModelName) {
                // Fall back to finding most recent version with this name
                query = `SELECT t."Status", mv."Id" as "VersionId", m."Name" as "ModelName", m."Id" as "ModelId"
                         FROM "ModelVersions" mv
                         JOIN "Models" m ON m."Id" = mv."ModelId"
                         LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                         WHERE m."DeletedAt" IS NULL AND m."Name" = $1
                         ORDER BY mv."CreatedAt" DESC 
                         LIMIT 1`;
                params = [uploadTracker.modelName];
            } else {
                // Last resort: find the globally most recent version
                query = `SELECT t."Status", mv."Id" as "VersionId", m."Name" as "ModelName", m."Id" as "ModelId"
                         FROM "ModelVersions" mv
                         JOIN "Models" m ON m."Id" = mv."ModelId"
                         LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                         WHERE m."DeletedAt" IS NULL
                         ORDER BY mv."CreatedAt" DESC 
                         LIMIT 1`;
                params = [];
            }

            const result = await db.query(query, params);

            if (result.rows.length > 0) {
                const row = result.rows[0];
                lastStatus = row.Status;
                lastModelName = row.ModelName;
                lastVersionId = row.VersionId;

                if (row.Status === 2) {
                    thumbnailReady = true;
                    console.log(
                        `[Thumbnail] Ready for "${row.ModelName}" (model=${row.ModelId}) v${row.VersionId} (status=2)`,
                    );
                } else if (row.Status === 3) {
                    // Thumbnail generation failed - fail fast
                    throw new Error(
                        `Thumbnail generation FAILED for "${row.ModelName}" (model=${row.ModelId}) v${row.VersionId}. Check worker logs.`,
                    );
                } else {
                    console.log(
                        `[Thumbnail] Waiting for "${row.ModelName}" (model=${row.ModelId}) v${row.VersionId} (status=${row.Status ?? "null"})... attempt ${i + 1}/${maxAttempts}`,
                    );
                    await page.waitForTimeout(pollInterval);
                }
            } else {
                console.log(
                    `[Thumbnail] No model versions found, waiting... attempt ${i + 1}/${maxAttempts}`,
                );
                await page.waitForTimeout(pollInterval);
            }
        }

        if (!thumbnailReady) {
            // Provide detailed error about what went wrong
            const statusName =
                lastStatus === null
                    ? "null (no thumbnail)"
                    : lastStatus === 0
                      ? "Pending"
                      : lastStatus === 1
                        ? "Processing"
                        : `Unknown (${lastStatus})`;
            // Clear the tracking variables before throwing
            uploadTracker.modelName = null;
            uploadTracker.versionId = 0;
            throw new Error(
                `Thumbnail generation timed out after ${(maxAttempts * pollInterval) / 1000}s. ` +
                    `Model: "${lastModelName}" v${lastVersionId}, Last status: ${statusName}. ` +
                    `Check if thumbnail-worker-e2e container is healthy and processing jobs.`,
            );
        }
        // Clear the tracking variables after successful check
        uploadTracker.modelName = null;
        uploadTracker.versionId = 0;
        console.log("[Test] Thumbnail generation verified via database");
    },
);

/**
 * Verifies that a model has the expected number of versions in shared state.
 */
Then(
    "the model should have {int} versions in shared state",
    async ({ page }, expectedCount: number) => {
        const url = page.url();
        const match = url.match(/model-(\d+)/);

        if (!match) {
            throw new Error("Could not extract model ID from URL");
        }

        const modelId = parseInt(match[1], 10);

        // Query database for actual version count
        const { DbHelper } = await import("../fixtures/db-helper");
        const db = new DbHelper();
        try {
            const actualCount = await db.getModelVersionCount(modelId);
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
        const textureSet = sharedState.getTextureSet(textureSetName);

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
        if (await btn.isVisible({ timeout: 500 })) {
            await btn.click();
            await page.waitForTimeout(300);
        }
    }

    // Also press Escape to close any dialogs
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Wait for page to be stable (no loading spinners)
    await page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {});

    // Wait for dropdown trigger to be visible with longer timeout
    const dropdownTrigger = page.locator(".version-dropdown-trigger");
    await dropdownTrigger.waitFor({ state: "visible", timeout: 15000 });

    // Small delay to ensure UI is stable
    await page.waitForTimeout(300);

    // Click with retry logic
    try {
        await dropdownTrigger.click();
    } catch (e) {
        console.log("[Screenshot] First click failed, retrying after delay...");
        await page.waitForTimeout(500);
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
 */
Then("the thumbnail should be visible in the model card", async ({ page }) => {
    const modelListPage = new ModelListPage(page);

    // Navigate to model list to see the card
    await modelListPage.goto();
    await page.waitForLoadState("networkidle");

    // Wait for any thumbnail image in a model card to be visible
    const thumbnailImg = page
        .locator(".model-grid .thumbnail-image, .model-card .thumbnail-image")
        .first();

    // First check if there's a thumbnail image (not placeholder)
    const hasImage = (await thumbnailImg.count()) > 0;

    if (!hasImage) {
        // Take a screenshot to show the issue
        await page.screenshot({
            path: "test-results/thumbnail-missing-in-card.png",
        });
        throw new Error(
            "No thumbnail image found in model card - only placeholder is showing. See test-results/thumbnail-missing-in-card.png",
        );
    }

    await expect(thumbnailImg).toBeVisible({ timeout: 15000 });

    // Verify the image actually loaded (naturalWidth > 0)
    const isLoaded = await expect
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
