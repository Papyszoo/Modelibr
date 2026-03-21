/**
 * Step definitions for Model Management E2E tests
 * Covers version deletion, thumbnail regeneration, and custom thumbnail upload
 */
import { createBdd } from "playwright-bdd";
import { expect, test } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { getScenarioState } from "../fixtures/shared-state";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

const { Given, When, Then } = createBdd();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= Model Setup Steps =============

Given("a model with at least 2 versions exists", async ({ page }) => {
    // Check if we have a multi-version model from previous tests or create one
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

    // Always create a new one to avoid state pollution/flake
    console.log("[Setup] Creating new multi-version model for testing...");

    // 1. Generate unique files
    const modelFile = await UniqueFileGenerator.generate("test-cube.glb");
    const versionFile = await UniqueFileGenerator.generate("test-torus.fbx");

    // 2. Upload first version (Base Model)
    const uploadResponse = await page.request.post(`${API_BASE}/models`, {
        multipart: {
            file: {
                name: path.basename(modelFile),
                mimeType: "model/gltf-binary",
                buffer: fs.readFileSync(modelFile),
            },
        },
    });

    if (!uploadResponse.ok()) {
        throw new Error(
            `Failed to upload base model: ${uploadResponse.status()} ${await uploadResponse.text()}`,
        );
    }

    const uploadData = await uploadResponse.json();
    const multiVersionModelId = uploadData.id;
    getScenarioState(page).setCustom(
        "multiVersionModelId",
        multiVersionModelId,
    );
    console.log(`[Setup] Created base model (ID: ${multiVersionModelId})`);

    // 3. Upload second version (requires setAsActive query param)
    const versionResponse = await page.request.post(
        `${API_BASE}/models/${multiVersionModelId}/versions?setAsActive=false`,
        {
            multipart: {
                file: {
                    name: path.basename(versionFile),
                    mimeType: "application/octet-stream",
                    buffer: fs.readFileSync(versionFile),
                },
            },
        },
    );

    if (!versionResponse.ok()) {
        throw new Error(
            `Failed to upload second version: ${versionResponse.status()} ${await versionResponse.text()}`,
        );
    }

    console.log(`[Setup] Added second version to model ${multiVersionModelId}`);

    // Fetch the actual model name from the API (POST response only returns {id, alreadyExists})
    const modelDetailResponse = await page.request.get(
        `${API_BASE}/models/${multiVersionModelId}`,
    );
    const modelDetail = modelDetailResponse.ok()
        ? await modelDetailResponse.json()
        : null;
    const actualModelName =
        modelDetail?.name || path.basename(modelFile, path.extname(modelFile));

    // Save to shared state for later use
    getScenarioState(page).saveModel("multi-version-test-model", {
        id: multiVersionModelId,
        name: actualModelName,
    });

    expect(multiVersionModelId).not.toBeNull();
    console.log(
        `[Setup] Multi-version model ready: ID=${multiVersionModelId} (2 versions uploaded)`,
    );
});

Given("the test model {string} exists", async ({ page }, modelName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    let model = getScenarioState(page).getModel(modelName);

    // If model is in shared state, verify it still exists in the backend
    if (model) {
        const checkResponse = await page.request.get(
            `${API_BASE}/models/${model.id}`,
        );
        if (!checkResponse.ok()) {
            console.log(
                `[Setup] Model "${modelName}" (ID: ${model.id}) no longer exists in backend (${checkResponse.status()}), recreating...`,
            );
            model = undefined; // Force recreation
        } else {
            // Model exists in backend — update shared state with actual name from API
            const checkData = await checkResponse.json();
            if (checkData.name && checkData.name !== model.name) {
                console.log(
                    `[Setup] Updating shared state name from "${model.name}" to "${checkData.name}"`,
                );
                getScenarioState(page).saveModel(modelName, {
                    ...model,
                    name: checkData.name,
                });
                model = getScenarioState(page).getModel(modelName);
            }
        }
    }

    if (!model) {
        // Model not in shared state or deleted from backend - create it via API
        console.log(`[Setup] Creating test model "${modelName}" via API...`);

        // Generate a unique test file
        const modelFile = await UniqueFileGenerator.generate("test-cube.glb");

        // Upload the model
        const response = await page.request.post(`${API_BASE}/models`, {
            multipart: {
                file: {
                    name: path.basename(modelFile),
                    mimeType: "model/gltf-binary",
                    buffer: fs.readFileSync(modelFile),
                },
            },
        });

        if (!response.ok()) {
            throw new Error(
                `Failed to create model: ${response.status()} ${await response.text()}`,
            );
        }

        const modelData = await response.json();

        // Handle both PascalCase (C# API) and camelCase property names
        const modelId = modelData.id ?? modelData.Id;
        const versionId = modelData.versionId ?? modelData.VersionId;

        if (!modelId) {
            console.error("[Setup] API response:", modelData);
            throw new Error(
                `Model creation API did not return an ID. Response: ${JSON.stringify(modelData)}`,
            );
        }

        // Fetch the actual model name from the API (POST response only returns {id, alreadyExists})
        const detailResponse = await page.request.get(
            `${API_BASE}/models/${modelId}`,
        );
        const detailData = detailResponse.ok()
            ? await detailResponse.json()
            : null;
        const actualName =
            detailData?.name ||
            path.basename(modelFile, path.extname(modelFile));

        // Store in shared state — use actual name from API (based on filename),
        // not the parameterized modelName, so UI card matching works
        getScenarioState(page).saveModel(modelName, {
            id: modelId,
            name: actualName,
            versions: versionId
                ? [
                      {
                          id: versionId,
                          name: path.basename(modelFile),
                      },
                  ]
                : [],
        });

        console.log(
            `[Setup] Created test model "${modelName}" (ID: ${modelId}) via API`,
        );
        model = getScenarioState(page).getModel(modelName);
    }

    console.log(
        `[Precondition] Model "${modelName}" exists (ID: ${model?.id})`,
    );
});

// ============= Navigation Steps =============

When(
    "I open the model viewer for the multi-version model",
    async ({ page }) => {
        const multiVersionModelId = getScenarioState(page).getCustom<number>(
            "multiVersionModelId",
        );
        if (!multiVersionModelId)
            throw new Error("Multi-version model ID not set");

        // Find the model name from scenario state
        const multiModel =
            getScenarioState(page).getModel("multi-version-test-model") ||
            getScenarioState(page).getModel("multi-version-model");
        const modelName = multiModel?.name || "multi-version-model";

        const { navigateToAppClean, openModelViewer } =
            await import("../helpers/navigation-helper");
        await navigateToAppClean(page);
        await openModelViewer(page, modelName);

        console.log(
            `[Navigation] Opened model viewer for multi-version model (ID: ${multiVersionModelId})`,
        );
    },
);

When(
    "I open the model viewer for {string}",
    async ({ page }, modelName: string) => {
        const model = getScenarioState(page).getModel(modelName);
        if (!model)
            throw new Error(`Model "${modelName}" not found in shared state`);

        const { navigateToAppClean, openModelViewer } =
            await import("../helpers/navigation-helper");
        await navigateToAppClean(page);
        await openModelViewer(page, model.name);

        console.log(
            `[Navigation] Opened model viewer for "${modelName}" (ID: ${model.id})`,
        );
    },
);

When("I delete version {int}", async ({ page }, versionIndex: number) => {
    const modelViewer = new ModelViewerPage(page);
    const count = await modelViewer.versionItems.count();

    // Safety check
    if (count <= 1) {
        throw new Error("Cannot delete version: only 1 version exists");
    }

    const targetItem = modelViewer.versionItems.nth(count - 1);

    // Click the recycle/trash button
    const deleteBtn = targetItem.locator(".version-recycle-btn");
    await deleteBtn.click();

    console.log(`[Action] Deleted version (index: ${versionIndex})`);
});

Then(
    "the model should have {int} version remaining",
    async ({ page }, expectedCount: number) => {
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.openVersionDropdown();

        await expect(modelViewer.versionItems).toHaveCount(expectedCount);

        console.log(
            `[Verify] Model has ${expectedCount} version(s) remaining ✓`,
        );

        // Close dropdown
        await page.keyboard.press("Escape");
    },
);

Then("I take a screenshot of model version deletion", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/model-version-deleted-management.png",
    });
    console.log("[Screenshot] Captured model version deletion");
});

// ============= Thumbnail Management Steps =============

When("I click the regenerate thumbnail button", async ({ page }) => {
    const modelViewer = new ModelViewerPage(page);

    // 1. Open Thumbnail Details panel if not visible
    const thumbnailSection = page.locator(".thumbnail-panel");

    if (
        !(await thumbnailSection
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false))
    ) {
        await modelViewer.openTab("Thumbnail Details");
        await expect(thumbnailSection).toBeVisible({ timeout: 5000 });
        console.log("[Action] Opened Thumbnail Details panel");
    }

    // 2. Click Regenerate button inside the panel
    const regenButton = page.locator('button:has-text("Regenerate")');
    await regenButton.click();
    // Wait for server processing confirmation (toast or SignalR response)
    await page
        .locator(".p-toast-message")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
    console.log("[Action] Clicked regenerate thumbnail button");
});

Then(
    "I should see a success message for thumbnail regeneration",
    async ({ page }) => {
        // Look for success toast
        const toast = page.locator(".p-toast-message-success");
        await expect(toast).toBeVisible({ timeout: 10000 });
        console.log(
            "[Verify] Success message visible for thumbnail regeneration ✓",
        );
    },
);

Then("I take a screenshot of regenerated thumbnail", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/model-thumbnail-regenerated.png",
    });
    console.log("[Screenshot] Captured regenerated thumbnail");
});

// ============= Custom Thumbnail Steps =============

When("I click the upload custom thumbnail button", async ({ page }) => {
    // Feature not yet implemented - mark test as informational skip
    console.log("[SKIP] Custom thumbnail upload feature not yet implemented");
    test.skip(true, "Custom thumbnail upload feature not yet implemented");
});

When("I select an image file for custom thumbnail", async ({ page }) => {
    test.skip(true, "Custom thumbnail upload feature not yet implemented");
});

Then("I should see the custom thumbnail applied", async ({ page }) => {
    test.skip(true, "Custom thumbnail upload feature not yet implemented");
});

Then("I take a screenshot of custom thumbnail", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/model-custom-thumbnail.png",
    });
});
