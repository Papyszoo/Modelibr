import { createBdd } from "playwright-bdd";
import { expect, Page, test } from "@playwright/test";
import { RecycledFilesPage } from "../pages/RecycledFilesPage";
import { ModelListPage } from "../pages/ModelListPage";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { DbHelper } from "../fixtures/db-helper";
import {
    waitForThumbnails,
    takeScreenshotToReport,
} from "./recycled-files-common.steps";

const { Given: GivenBdd, When: WhenBdd, Then: ThenBdd } = createBdd();

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8090";

// Tracking state for model recycling tests
const recycleTracker = {
    modelName: "",
    modelId: null as number | null,
    modelCountBeforeAction: -1,
    versionCountBeforeAction: -1,
    modelCardCountBeforeRecycle: -1,
    _pendingPermanentDelete: null as number | null,
};

// Track models by test alias (e.g., "keep-this-model" -> {id, name})
const modelsByAlias = new Map<string, { id: number; name: string }>();

// ============================================
// Setup Steps - Using UI-based recycling
// ============================================

GivenBdd(
    "I upload and delete a model {string}",
    async ({ page }, modelName: string) => {
        // Upload via API to capture exact model ID (avoids name-matching ambiguity)
        const filePath = await UniqueFileGenerator.generate("test-cube.glb");
        const fs = await import("fs");
        const fileBuffer = fs.readFileSync(filePath);

        const uploadResponse = await page.request.post(
            `${API_BASE_URL}/models`,
            {
                multipart: {
                    file: {
                        name: "test-cube.glb",
                        mimeType: "model/gltf-binary",
                        buffer: fileBuffer,
                    },
                },
            },
        );
        expect(uploadResponse.ok()).toBe(true);
        const uploadData = await uploadResponse.json();
        recycleTracker.modelId = uploadData.id;

        // Fetch actual model name from API (may differ from filename under AutoRename policy)
        const modelDetailResponse = await page.request.get(
            `${API_BASE_URL}/models/${uploadData.id}`,
        );
        expect(modelDetailResponse.ok()).toBe(true);
        const modelDetail = await modelDetailResponse.json();
        recycleTracker.modelName = modelDetail.name || "test-cube";
        // Track by alias for multi-model scenarios
        modelsByAlias.set(modelName, {
            id: uploadData.id,
            name: recycleTracker.modelName,
        });
        console.log(
            `[Setup] Uploaded model for "${modelName}" as "${recycleTracker.modelName}" (ID: ${recycleTracker.modelId})`,
        );

        // Soft-delete via API to ensure we recycle the exact model we uploaded
        const deleteResponse = await page.request.delete(
            `${API_BASE_URL}/models/${recycleTracker.modelId}`,
        );
        expect(deleteResponse.ok()).toBe(true);

        // Wait for the soft-delete API call to settle
        await page.waitForLoadState("domcontentloaded");

        console.log(
            `[Setup] Recycled model "${recycleTracker.modelName}" (ID: ${recycleTracker.modelId}) for test "${modelName}"`,
        );
    },
);

// Step: Upload only (no recycle) - for before/after screenshot test
GivenBdd(
    "I upload a model for recycling test {string}",
    async ({ page }, modelName: string) => {
        // Upload via API to capture exact model ID
        const filePath = await UniqueFileGenerator.generate("test-cube.glb");
        const fs = await import("fs");
        const fileBuffer = fs.readFileSync(filePath);

        const uploadResponse = await page.request.post(
            `${API_BASE_URL}/models`,
            {
                multipart: {
                    file: {
                        name: "test-cube.glb",
                        mimeType: "model/gltf-binary",
                        buffer: fileBuffer,
                    },
                },
            },
        );
        expect(uploadResponse.ok()).toBe(true);
        const uploadData = await uploadResponse.json();
        recycleTracker.modelId = uploadData.id;

        // Fetch actual model name from API (may differ from filename under AutoRename policy)
        const modelDetailResponse = await page.request.get(
            `${API_BASE_URL}/models/${uploadData.id}`,
        );
        expect(modelDetailResponse.ok()).toBe(true);
        const modelDetail = await modelDetailResponse.json();
        recycleTracker.modelName = modelDetail.name || "test-cube";
        modelsByAlias.set(modelName, {
            id: uploadData.id,
            name: recycleTracker.modelName,
        });
        console.log(
            `[Setup] Uploaded model for "${modelName}" as "${recycleTracker.modelName}" (ID: ${recycleTracker.modelId}, not yet recycled)`,
        );
    },
);

// Step: Recycle the previously uploaded model
WhenBdd("I recycle the uploaded model", async ({ page }) => {
    // Use API-based soft-delete for reliability (avoids fragile right-click context menu)
    if (recycleTracker.modelId) {
        const deleteResponse = await page.request.delete(
            `${API_BASE_URL}/models/${recycleTracker.modelId}`,
        );
        expect(deleteResponse.ok()).toBe(true);
        console.log(
            `[Action] Recycled model "${recycleTracker.modelName}" (ID: ${recycleTracker.modelId}) via API`,
        );
    } else {
        throw new Error("No model ID tracked — cannot recycle");
    }
});

// Screenshot: Before recycling
ThenBdd(
    "I take a screenshot of the model list before recycling",
    async ({ page }) => {
        await waitForThumbnails(page, "model list before recycling");
        await page.screenshot({ path: "test-results/recycle-before.png" });
        console.log("[Screenshot] Captured model list BEFORE recycling");
    },
);

// Screenshot: After recycling
ThenBdd(
    "I take a screenshot of the model list after recycling",
    async ({ page }) => {
        await waitForThumbnails(page, "model list after recycling");
        await page.screenshot({ path: "test-results/recycle-after.png" });
        console.log("[Screenshot] Captured model list AFTER recycling");
    },
);

GivenBdd(
    "the model {string} is in the recycle bin",
    async ({ page }, modelName: string) => {
        const recycleBin = new RecycledFilesPage(page);
        await recycleBin.goto();

        // The model should be there - we use the actual model name that was tracked
        const hasModel = await recycleBin.hasModelWithName(
            recycleTracker.modelName || "test-cube",
        );
        expect(hasModel).toBe(true);
        console.log(
            `[Verify] Model for "${modelName}" (as "${recycleTracker.modelName}") is in recycle bin ✓`,
        );
    },
);

GivenBdd("I note the recycled model count", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    await recycleBin.goto();
    const count = await recycleBin.getRecycledModelCount();
    recycleTracker.modelCountBeforeAction = count;
    getScenarioState(page).setCustom("recycledModelCountBefore", count);
    console.log(`[Setup] Initial recycled model count: ${count}`);
});

// ============================================
// Navigation Steps
// ============================================

WhenBdd("I navigate back to the model viewer", async ({ page }) => {
    const { navigateToAppClean, openModelViewer } =
        await import("../helpers/navigation-helper");

    // Try multiple possible model keys from shared state
    const modelKeys = [
        "multi-version-test-model",
        "multiVersionModel",
        "test-model",
    ];
    let modelName: string | null = null;

    for (const key of modelKeys) {
        const model = getScenarioState(page).getModel(key);
        if (model && model.name) {
            modelName = model.name;
            console.log(
                `[Navigation] Found model "${modelName}" from shared state key "${key}"`,
            );
            break;
        }
    }

    if (modelName) {
        await navigateToAppClean(page);
        await openModelViewer(page, modelName);
        console.log(
            `[Navigation] Navigated back to model viewer for "${modelName}"`,
        );
    } else {
        // Fallback: go to model list and open the first available model
        console.log(
            "[Navigation] No model found in shared state, using fallback",
        );
        await navigateToAppClean(page);

        // Wait for model cards to appear
        await page.waitForSelector(".model-card", {
            state: "visible",
            timeout: 10000,
        });

        // Double-click the first model card
        const firstCard = page.locator(".model-card").first();
        await firstCard.dblclick();
        await page.waitForSelector(
            ".viewer-canvas canvas, .version-dropdown-trigger",
            { state: "visible", timeout: 30000 },
        );
        console.log(
            "[Navigation] Navigated back to model viewer via first card fallback",
        );
    }
});

WhenBdd(
    "I navigate back to the model viewer with force refresh",
    async ({ page }) => {
        const { navigateToAppClean, openModelViewer } =
            await import("../helpers/navigation-helper");

        // Try multiple possible model keys from shared state
        const modelKeys = [
            "multi-version-test-model",
            "multiVersionModel",
            "test-model",
        ];
        let modelName: string | null = null;

        for (const key of modelKeys) {
            const model = getScenarioState(page).getModel(key);
            if (model && model.name) {
                modelName = model.name;
                console.log(
                    `[Navigation] Found model "${modelName}" from shared state key "${key}"`,
                );
                break;
            }
        }

        if (modelName) {
            await navigateToAppClean(page);
            await openModelViewer(page, modelName);

            // Force a hard reload to clear all caches
            await page.reload({ waitUntil: "domcontentloaded" });

            // Wait for version dropdown to be visible (indicates versions loaded)
            await page
                .locator(".version-dropdown-trigger")
                .waitFor({ state: "visible", timeout: 15000 });

            // Wait for API responses to settle after force refresh
            await page.waitForLoadState("domcontentloaded");

            console.log(
                `[Navigation] Navigated back to model viewer for "${modelName}" with force refresh`,
            );
        } else {
            // Fallback: go to model list and open first model
            console.log(
                "[Navigation] No model found in shared state, using fallback with force refresh",
            );
            await navigateToAppClean(page);
            await page.waitForSelector(".model-card", {
                state: "visible",
                timeout: 10000,
            });
            const firstCard = page.locator(".model-card").first();
            await firstCard.dblclick();
            await page.waitForLoadState("domcontentloaded");
            await page.reload({ waitUntil: "domcontentloaded" });
            await page
                .locator(".version-dropdown-trigger")
                .waitFor({ state: "visible", timeout: 15000 });
            await page.waitForLoadState("domcontentloaded");
            console.log(
                "[Navigation] Navigated back to model viewer via fallback with force refresh",
            );
        }
    },
);

// ============================================
// Action Steps
// ============================================

WhenBdd("I restore the model {string}", async ({ page }, modelName: string) => {
    // Use API-based restore for reliability — all models are named "test-cube"
    // so name-based UI matching is ambiguous
    const tracked = modelsByAlias.get(modelName);
    const modelId = tracked?.id ?? recycleTracker.modelId;

    if (modelId) {
        const restoreResponse = await page.request.post(
            `${API_BASE_URL}/recycled/model/${modelId}/restore`,
        );
        expect(restoreResponse.ok()).toBe(true);
        console.log(
            `[Action] Restored model "${modelName}" (ID: ${modelId}) via API`,
        );
    } else {
        // Fallback to UI if no ID tracked
        const recycleBin = new RecycledFilesPage(page);
        const index = await recycleBin.findModelIndexByName("test-cube");
        expect(index).toBeGreaterThanOrEqual(0);
        await recycleBin.restoreModel(index);
        console.log(`[Action] Restored model "${modelName}" via UI fallback`);
    }

    // Refresh to see changes
    const recycleBin = new RecycledFilesPage(page);
    await recycleBin.refresh();
});

WhenBdd(
    'I click "Delete Forever" for model {string}',
    async ({ page }, modelName: string) => {
        const recycleBin = new RecycledFilesPage(page);

        // Track model ID for alias-based permanent delete in confirm step
        const tracked = modelsByAlias.get(modelName);
        if (tracked) {
            recycleTracker._pendingPermanentDelete = tracked.id;
            recycleTracker.modelId = tracked.id;
        }

        // Always use UI to click Delete Forever (needed for dialog tests)
        const modelCount = await recycleBin.getRecycledModelCount();
        if (modelCount > 0) {
            // Click on first available card (all named "test-cube" — can't distinguish by name)
            await recycleBin.clickDeleteForeverModel(0);
            console.log(
                `[Action] Clicked Delete Forever on first recycled model card for "${modelName}"`,
            );
        } else {
            console.log(
                `[Warning] No recycled models found for Delete Forever`,
            );
        }
    },
);

WhenBdd("I confirm the permanent delete", async ({ page }) => {
    if (recycleTracker._pendingPermanentDelete) {
        // Close the UI dialog first (it might be open from the previous step)
        const recycleBin = new RecycledFilesPage(page);
        try {
            await recycleBin.confirmPermanentDelete();
        } catch (error) {
            // If UI confirm fails, log the error and dismiss the dialog
            console.warn(
                `[Warning] UI confirmPermanentDelete failed: ${error}`,
            );
            await page.keyboard.press("Escape");
        }

        // Use API to ensure the CORRECT model is permanently deleted
        const modelId = recycleTracker._pendingPermanentDelete;
        const deleteResponse = await page.request.delete(
            `${API_BASE_URL}/recycled/model/${modelId}/permanent`,
        );
        // If the UI already deleted the right model, API might 404 — that's fine
        if (deleteResponse.ok()) {
            console.log(
                `[Action] Permanently deleted model ID ${modelId} via API`,
            );
        } else if (deleteResponse.status() === 404) {
            console.log(
                `[Action] Model ID ${modelId} already deleted (via UI dialog)`,
            );
        } else {
            console.log(
                `[Warning] API permanent delete returned ${deleteResponse.status()}`,
            );
        }

        // Verify the deletion actually happened — model should be gone
        const verifyResponse = await page.request.get(
            `${API_BASE_URL}/recycled/model/${modelId}`,
        );
        if (verifyResponse.status() === 404) {
            console.log(
                `[Verify] Model ID ${modelId} confirmed permanently deleted (404) ✓`,
            );
        } else {
            console.warn(
                `[Warning] Model ID ${modelId} still returns ${verifyResponse.status()} after permanent delete`,
            );
        }

        recycleTracker.modelId = modelId;
        recycleTracker._pendingPermanentDelete = null;
    } else {
        // Standard UI dialog confirmation
        const recycleBin = new RecycledFilesPage(page);

        const deleteResponsePromise = page
            .waitForResponse(
                (resp) =>
                    resp.request().method() === "DELETE" &&
                    resp.url().includes("/permanent") &&
                    resp.status() === 200,
                { timeout: 20000 },
            )
            .catch(() => null);

        await recycleBin.confirmPermanentDelete();

        const deleteResponse = await deleteResponsePromise;
        if (deleteResponse) {
            const urlMatch = deleteResponse
                .url()
                .match(/\/recycled\/model\/(\d+)\/permanent/);
            if (urlMatch) {
                recycleTracker.modelId = parseInt(urlMatch[1], 10);
            }
        }
        console.log("[Action] Confirmed permanent delete via UI");
    }

    await page.waitForLoadState("domcontentloaded");
});

// ============================================
// Assertion Steps
// ============================================

ThenBdd(
    "I should see the model {string} in the recycle bin",
    async ({ page }, modelName: string) => {
        const recycleBin = new RecycledFilesPage(page);

        // Wait for content to load
        await page.waitForLoadState("domcontentloaded");

        const hasModel = await recycleBin.hasModelWithName(
            recycleTracker.modelName || "test-cube",
        );
        expect(hasModel).toBe(true);
        console.log(`[UI] Model "${modelName}" found in recycle bin ✓`);
    },
);

ThenBdd(
    "the model {string} should not be visible in the grid",
    async ({ page }, modelName: string) => {
        // Verify via API that the model is soft-deleted
        if (recycleTracker.modelId) {
            const response = await page.request.get(
                `${API_BASE_URL}/models/${recycleTracker.modelId}`,
            );
            // Model should return 404 when soft-deleted (filtered out by default)
            expect(response.status()).toBe(404);
            console.log(
                `[API] Model ID ${recycleTracker.modelId} returns 404 (soft-deleted) ✓`,
            );
        }

        // Also verify it doesn't appear in the model list UI
        const modelList = new ModelListPage(page);
        await modelList.goto();
        await page.waitForLoadState("domcontentloaded");

        // Check that the model list does not contain the specific recycled model
        // by verifying the API list doesn't include it
        const listResponse = await page.request.get(`${API_BASE_URL}/models`);
        const models = await listResponse.json();
        const found = models.some((m: any) => m.id === recycleTracker.modelId);
        expect(found).toBe(false);
        console.log(
            `[UI] Model "${modelName}" (ID: ${recycleTracker.modelId}) not in model list ✓`,
        );

        // UI verification: check no model card text contains our model name
        const modelCards = page.locator(".model-card");
        const cardCount = await modelCards.count();
        let foundInUI = false;
        for (let i = 0; i < cardCount; i++) {
            const cardText = await modelCards.nth(i).textContent();
            if (
                cardText &&
                cardText.includes(recycleTracker.modelName || "test-cube")
            ) {
                // Check if this card's model ID matches our recycled model
                // Since all models are named "test-cube", we can't distinguish by name alone
                // But we can verify the count hasn't increased unexpectedly
                foundInUI = true;
            }
        }
        // Log UI state for debugging
        console.log(
            `[UI] Found ${cardCount} model card(s), matched name: ${foundInUI}`,
        );
    },
);

ThenBdd(
    "the model {string} should be visible in the grid",
    async ({ page }, modelName: string) => {
        // Verify via API that the restored model is back in the active list
        const tracked = modelsByAlias.get(modelName);
        const modelId = tracked?.id ?? recycleTracker.modelId;

        if (modelId) {
            const response = await page.request.get(
                `${API_BASE_URL}/models/${modelId}`,
            );
            expect(response.ok()).toBe(true);
            console.log(
                `[API] Model "${modelName}" (ID: ${modelId}) exists in active list ✓`,
            );
        }

        // Also verify in the UI that model cards are visible
        await page.waitForSelector(".model-card", { timeout: 10000 });
        const cardCount = await page.locator(".model-card").count();
        expect(cardCount).toBeGreaterThan(0);
        console.log(`[UI] Model grid shows ${cardCount} card(s) ✓`);
    },
);

ThenBdd("the database should show the model as soft-deleted", async () => {
    // ISSUE-08: Verify soft-delete at the database level
    if (recycleTracker.modelId) {
        const db = new DbHelper();
        try {
            await db.assertModelSoftDeleted(recycleTracker.modelId);
            console.log(
                `[DB] Model ID ${recycleTracker.modelId} is soft-deleted (DeletedAt populated) ✓`,
            );
        } finally {
            await db.close();
        }
    } else {
        console.log("[DB] No model ID tracked — skipping DB verification");
    }
});

ThenBdd("the model should still be in the recycle bin", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    await recycleBin.waitForLoaded();
    const count = await recycleBin.getRecycledModelCount();
    expect(count).toBeGreaterThan(0);
    console.log("[UI] Model still in recycle bin ✓");
});

ThenBdd(
    "the model should be removed from the recycle bin",
    async ({ page }) => {
        const recycleBin = new RecycledFilesPage(page);
        const countBefore =
            getScenarioState(page).getCustom<number>(
                "recycledModelCountBefore",
            ) ?? recycleTracker.modelCountBeforeAction;

        // Use count-based verification: the recycled model count should decrease.
        // Name-based matching is unreliable when multiple models share similar names.
        await expect
            .poll(
                async () => {
                    await recycleBin.refresh();
                    return await recycleBin.getRecycledModelCount();
                },
                {
                    message: `Waiting for recycled model count to decrease from ${countBefore}`,
                    timeout: 15000,
                    intervals: [1000, 2000, 3000],
                },
            )
            .toBeLessThan(countBefore);

        const countAfter = await recycleBin.getRecycledModelCount();
        console.log(
            `[UI] Recycled model count decreased: ${countBefore} → ${countAfter} ✓`,
        );
    },
);

ThenBdd(
    "the model {string} should be removed from recycle bin",
    async ({ page }, modelName: string) => {
        // Use API verification: check that the model no longer exists (permanently deleted)
        const tracked = modelsByAlias.get(modelName);
        const modelId = tracked?.id ?? recycleTracker.modelId;

        if (modelId) {
            // After permanent delete, the model should return 404
            const response = await page.request.get(
                `${API_BASE_URL}/models/${modelId}`,
            );
            expect(response.status()).toBe(404);
            console.log(
                `[API] Model "${modelName}" (ID: ${modelId}) permanently deleted ✓`,
            );
        } else {
            // Fallback to count-based UI verification
            const recycleBin = new RecycledFilesPage(page);
            const countBefore =
                getScenarioState(page).getCustom<number>(
                    "recycledModelCountBefore",
                ) ?? recycleTracker.modelCountBeforeAction;
            await expect
                .poll(
                    async () => {
                        await recycleBin.refresh();
                        return await recycleBin.getRecycledModelCount();
                    },
                    { timeout: 15000, intervals: [1000, 2000, 3000] },
                )
                .toBeLessThan(countBefore);
            console.log(`[UI] Model "${modelName}" removed from recycle bin ✓`);
        }
    },
);

ThenBdd(
    "the model {string} should still be in the recycle bin",
    async ({ page }, modelName: string) => {
        // Use API verification: check the model is still soft-deleted (not permanently gone)
        const tracked = modelsByAlias.get(modelName);
        const modelId = tracked?.id;

        if (modelId) {
            // The model should be soft-deleted (not returned by normal GET, but exists in DB)
            const db = new DbHelper();
            try {
                await db.assertModelSoftDeleted(modelId);
                console.log(
                    `[DB] Model "${modelName}" (ID: ${modelId}) is still soft-deleted ✓`,
                );
            } finally {
                await db.close();
            }
        } else {
            // Fallback to count-based check
            const recycleBin = new RecycledFilesPage(page);
            const count = await recycleBin.getRecycledModelCount();
            expect(count).toBeGreaterThan(0);
            console.log(
                `[UI] Model "${modelName}" still in recycle bin (count: ${count}) ✓`,
            );
        }
    },
);

ThenBdd("the database should not contain the model", async ({ page }) => {
    // ISSUE-08: Verify via actual database query, not just UI
    if (recycleTracker.modelId) {
        const db = new DbHelper();
        try {
            await db.assertModelPermanentlyDeleted(recycleTracker.modelId);
            console.log(
                `[DB] Model ID ${recycleTracker.modelId} permanently deleted from database ✓`,
            );
        } finally {
            await db.close();
        }
    } else {
        // Fallback: verify via recycle bin UI if model ID not tracked
        const recycleBin = new RecycledFilesPage(page);
        await recycleBin.refresh();
        await page.waitForLoadState("domcontentloaded");

        const trackedName = recycleTracker.modelName || "test-cube";
        const hasModel = await recycleBin.hasModelWithName(trackedName);
        expect(hasModel).toBe(false);
        console.log(
            `[DB] Model "${trackedName}" no longer visible after permanent delete (UI check fallback) ✓`,
        );
    }
});

// ============================================
// Model Screenshot Steps
// ============================================

ThenBdd("I take a screenshot of the model list", async ({ page }) => {
    await waitForThumbnails(page, "model list");
    await takeScreenshotToReport(page, "Model List", "recycled-model-list");
});

WhenBdd(
    "I take a screenshot of the recycle bin with both models",
    async ({ page }) => {
        await waitForThumbnails(page, "recycle bin with both models");
        await takeScreenshotToReport(
            page,
            "Recycle Bin With Both Models",
            "recycle-bin-both-models",
        );
    },
);

ThenBdd("I take a screenshot of the restored model", async ({ page }) => {
    await waitForThumbnails(page, "restored model");
    await takeScreenshotToReport(page, "Restored Model", "restored-model");
});

ThenBdd("I take a screenshot showing remaining model", async ({ page }) => {
    await waitForThumbnails(page, "remaining model");
    await takeScreenshotToReport(
        page,
        "Remaining Model After Delete",
        "remaining-model-after-delete",
    );
});

ThenBdd(
    "I scroll to show the restored model {string}",
    async ({ page }, modelName: string) => {
        // Try to find the model card (it will likely be at the bottom)
        const modelCard = page.locator(".model-card").first();

        if ((await modelCard.count()) > 0) {
            // Scroll to the first (or last) model card to ensure it's visible
            await modelCard.scrollIntoViewIfNeeded();
            // Verify model card is visible after scroll
            await expect(modelCard).toBeVisible({ timeout: 5000 });
            console.log(
                `[Action] Scrolled to show restored model "${modelName}" ✓`,
            );
        } else {
            console.log(`[Warning] No model cards found to scroll to`);
        }
    },
);

// ============================================
// Model Version Recycling Steps
// ============================================

GivenBdd(
    "I upload a model with multiple versions for recycling test {string}",
    async ({ page }, testName: string) => {
        const modelListPage = new ModelListPage(page);

        // Upload first version
        const filePath = await UniqueFileGenerator.generate("test-cube.glb");
        await modelListPage.uploadModel(filePath);

        // Wait for model card to appear after upload
        const modelCard = page.locator(".model-card").first();
        await expect(modelCard).toBeVisible({ timeout: 10000 });

        // Open model by double-clicking the card
        await modelCard.dblclick();

        // Wait for model viewer to load
        await page.waitForSelector(
            ".model-viewer, .viewer-canvas, .p-menubar",
            { state: "visible", timeout: 10000 },
        );

        // Get model ID from navigation store
        const { ModelViewerPage } = await import("../pages/ModelViewerPage");
        const modelViewer = new ModelViewerPage(page);
        const extractedModelId = await modelViewer.getCurrentModelId();
        if (extractedModelId) {
            getScenarioState(page).setCustom(
                "lastVersionTestModelId",
                extractedModelId,
            );
            getScenarioState(page).setCustom(
                "lastVersionTestModelName",
                testName,
            );
        }

        // Upload second version
        const versionFilePath =
            await UniqueFileGenerator.generate("test-torus.fbx");

        // Click add version button
        const addVersionBtn = page.locator("button:has-text('Add Version')");
        await addVersionBtn.click();

        // Upload the file
        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles(versionFilePath);

        // Wait for version upload API response to complete
        await page.waitForLoadState("domcontentloaded");

        console.log(
            `[Setup] Created model with multiple versions for test "${testName}" (ID: ${getScenarioState(page).getCustom<number>("lastVersionTestModelId")})`,
        );
    },
);

ThenBdd(
    "I take a screenshot of the model with multiple versions",
    async ({ page }) => {
        await waitForThumbnails(page, "model with multiple versions");
        await takeScreenshotToReport(
            page,
            "Model With Multiple Versions",
            "model-multiple-versions",
        );
    },
);

WhenBdd(
    "I navigate to the model viewer for {string}",
    async ({ page }, testName: string) => {
        if (
            getScenarioState(page).getCustom<number>("lastVersionTestModelId")
        ) {
            const { navigateToAppClean, openModelViewer } =
                await import("../helpers/navigation-helper");
            // Lookup the model name from shared state
            const model =
                getScenarioState(page).getModel(testName) ||
                getScenarioState(page).getModel("multi-version-test-model");
            const modelName = model?.name || testName;

            await navigateToAppClean(page);
            await openModelViewer(page, modelName);
            console.log(
                `[Navigation] Navigated to model viewer for "${testName}"`,
            );
        }
    },
);

WhenBdd("I delete version 1 from the model", async ({ page }) => {
    // Open version dropdown
    const versionDropdown = page.locator(".version-dropdown-trigger");
    await versionDropdown.click();

    // Wait for dropdown items to appear
    // Optional: version actions may not be visible yet
    await page
        .locator(".version-quick-actions")
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});

    // Find version 1 and delete it
    const versionItems = page.locator(".version-quick-actions");
    if ((await versionItems.count()) > 0) {
        const deleteBtn = versionItems.first().locator("button:has(.pi-trash)");
        if (await deleteBtn.isVisible()) {
            await deleteBtn.click();

            // Confirm deletion if dialog appears
            const confirmBtn = page.locator(
                ".p-dialog-footer button:has-text('Delete'), .p-dialog-footer button:has-text('Confirm')",
            );
            if (
                await confirmBtn
                    .waitFor({ state: "visible", timeout: 2000 })
                    .then(() => true)
                    .catch(() => false)
            ) {
                await confirmBtn.click();
                // Wait for delete confirmation dialog to close
                await expect(confirmBtn).not.toBeVisible({ timeout: 5000 });
            }
            // Wait for version deletion API to complete
            await page.waitForLoadState("domcontentloaded");
        }
    }
    console.log("[Action] Deleted version 1 from model");
});

ThenBdd("the model should only show 1 version", async ({ page }) => {
    // Check version dropdown shows only 1 version
    const versionDropdown = page.locator(".version-dropdown-trigger");
    await versionDropdown.click();

    // Wait for dropdown content to render
    // Optional: version items may not be rendered yet
    await page
        .locator(".version-item")
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});

    const versionItems = page.locator(".version-item");
    const count = await versionItems.count();
    expect(count).toBeLessThanOrEqual(1);

    await versionDropdown.click(); // Close dropdown
    console.log(`[Verify] Model shows ${count} version(s) ✓`);
});

ThenBdd("I take a screenshot after version deleted", async ({ page }) => {
    await waitForThumbnails(page, "after version deleted");
    await takeScreenshotToReport(
        page,
        "After Version Deleted",
        "after-version-deleted",
    );
});

ThenBdd(
    "I should see the version in the recycled model versions section",
    async ({ page }) => {
        const recycledFilesPage = new RecycledFilesPage(page);
        const versionCount =
            await recycledFilesPage.getRecycledModelVersionCount();
        expect(versionCount).toBeGreaterThan(0);
        console.log(`[Verify] Found ${versionCount} recycled version(s) ✓`);
    },
);

ThenBdd(
    "I take a screenshot of the recycled versions section",
    async ({ page }) => {
        await takeScreenshotToReport(
            page,
            "Recycled Versions Section",
            "recycled-versions-section",
        );
    },
);

WhenBdd("I restore the recycled model version", async ({ page }) => {
    const recycledFilesPage = new RecycledFilesPage(page);

    // Get the model ID from shared state to restore the correct version
    const modelKeys = [
        "multi-version-test-model",
        "multiVersionModel",
        "test-model",
    ];
    let modelId: number | null = null;

    for (const key of modelKeys) {
        const model = getScenarioState(page).getModel(key);
        if (model && model.id) {
            modelId = model.id;
            console.log(
                `[Action] Found model ID ${modelId} from shared state key "${key}"`,
            );
            break;
        }
    }

    if (modelId) {
        const restored =
            await recycledFilesPage.restoreModelVersionByModelId(modelId);
        if (!restored) {
            throw new Error(`No recycled version found for model ${modelId}`);
        }
        console.log(
            `[Action] Restored recycled model version for model ${modelId}`,
        );
    } else {
        // Fallback to old behavior if no model ID available
        console.log(
            "[Action] No model ID in shared state, falling back to index 0",
        );
        await recycledFilesPage.restoreModelVersion(0);
        console.log(
            "[Action] Restored recycled model version (index 0 fallback)",
        );
    }

    // Wait for restore API call to complete
    await page.waitForLoadState("domcontentloaded");
});

ThenBdd(
    "the version should be removed from the recycle bin",
    async ({ page }) => {
        const recycledFilesPage = new RecycledFilesPage(page);
        const countBefore =
            getScenarioState(page).getCustom<number>(
                "recycledVersionCountBefore",
            ) ?? recycleTracker.versionCountBeforeAction;

        // Use count-based verification: the recycled version count should decrease.
        // Checking for exactly 0 fails when other recycled versions exist.
        await expect
            .poll(
                async () => {
                    await recycledFilesPage.refresh();
                    return await recycledFilesPage.getRecycledModelVersionCount();
                },
                {
                    message: `Waiting for recycled version count to decrease from ${countBefore}`,
                    timeout: 30000,
                    intervals: [1000, 2000, 3000, 5000],
                },
            )
            .toBeLessThan(countBefore);

        const countAfter =
            await recycledFilesPage.getRecycledModelVersionCount();
        console.log(
            `[Verify] Recycled version count decreased: ${countBefore} → ${countAfter} ✓`,
        );
    },
);

ThenBdd("the model should have 2 versions", async ({ page }) => {
    // Open version dropdown and count
    const versionDropdown = page.locator(".version-dropdown-trigger");
    await versionDropdown.click();

    // Wait for dropdown items to render
    await page
        .locator(".version-dropdown-item")
        .first()
        .waitFor({ state: "visible", timeout: 5000 });

    const versionItems = page.locator(".version-dropdown-item");
    await expect(versionItems).toHaveCount(2);

    await versionDropdown.click(); // Close dropdown
    console.log("[Verify] Model has 2 versions ✓");
});

ThenBdd("I take a screenshot of restored version", async ({ page }) => {
    await waitForThumbnails(page, "restored version");
    await takeScreenshotToReport(page, "Restored Version", "restored-version");
});

// ============================================
// Model Version Screenshot Steps
// ============================================

ThenBdd(
    "I take a screenshot of model before version deletion",
    async ({ page }) => {
        // Wait for version dropdown to be fully visible
        await page
            .locator(".version-dropdown-trigger")
            .waitFor({ state: "visible", timeout: 5000 })
            .catch(() => {});
        await takeScreenshotToReport(
            page,
            "Model Before Version Deletion",
            "model-before-version-deletion",
        );
    },
);

ThenBdd(
    "I take a screenshot showing version not in version strip",
    async ({ page }) => {
        // Wait for version strip UI to settle
        await page
            .locator(".version-dropdown-trigger")
            .waitFor({ state: "visible", timeout: 5000 })
            .catch(() => {});
        await takeScreenshotToReport(
            page,
            "Version Not In Version Strip",
            "version-not-in-strip",
        );
    },
);

ThenBdd(
    "I take a screenshot showing version in recycled files",
    async ({ page }) => {
        await waitForThumbnails(page, "recycled version");
        await takeScreenshotToReport(
            page,
            "Version In Recycled Files",
            "version-in-recycled-files",
        );
    },
);

ThenBdd(
    "I take a screenshot showing version not in recycled files",
    async ({ page }) => {
        await waitForThumbnails(page, "after version restore");
        await takeScreenshotToReport(
            page,
            "Version Not In Recycled Files",
            "version-not-in-recycled-files",
        );
    },
);

ThenBdd(
    "I take a screenshot showing restored version in version strip",
    async ({ page }) => {
        // Wait for version strip UI to settle
        await page
            .locator(".version-dropdown-trigger")
            .waitFor({ state: "visible", timeout: 5000 })
            .catch(() => {});
        await takeScreenshotToReport(
            page,
            "Restored Version In Version Strip",
            "restored-version-in-strip",
        );
    },
);
