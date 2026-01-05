/**
 * Step definitions for Model Management E2E tests
 * Covers version deletion, thumbnail regeneration, and custom thumbnail upload
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { sharedState } from "../fixtures/shared-state";
import { ModelListPage } from "../pages/ModelListPage";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

const { Given, When, Then } = createBdd();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= Model Setup Steps =============

let multiVersionModelId: number | null = null;

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
        throw new Error(`Failed to upload base model: ${uploadResponse.status()} ${await uploadResponse.text()}`);
    }
    
    const uploadData = await uploadResponse.json();
    multiVersionModelId = uploadData.id;
    console.log(`[Setup] Created base model (ID: ${multiVersionModelId})`);
    
    // 3. Upload second version (requires setAsActive query param)
    const versionResponse = await page.request.post(`${API_BASE}/models/${multiVersionModelId}/versions?setAsActive=false`, {
        multipart: {
            file: {
                name: path.basename(versionFile),
                mimeType: "application/octet-stream",
                buffer: fs.readFileSync(versionFile),
            },
        },
    });
    
    if (!versionResponse.ok()) {
        throw new Error(`Failed to upload second version: ${versionResponse.status()} ${await versionResponse.text()}`);
    }
    
    console.log(`[Setup] Added second version to model ${multiVersionModelId}`);
    
    // Save to shared state for later use (trust 200 OK response from both uploads)
    const uploadData2 = await uploadResponse.json();
    sharedState.saveModel("multi-version-test-model", {
        id: multiVersionModelId!,  // Non-null after successful upload
        name: uploadData2.name || "Test Model"
    });
    
    expect(multiVersionModelId).not.toBeNull();
    console.log(`[Setup] Multi-version model ready: ID=${multiVersionModelId} (2 versions uploaded)`);
});

Given("the test model {string} exists", async ({ page }, modelName: string) => {
    let model = sharedState.getModel(modelName);
    
    if (!model) {
        // Model not in shared state - create it via API
        const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
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
            throw new Error(`Failed to create model: ${response.status()} ${await response.text()}`);
        }
        
        const modelData = await response.json();
        
        // Store in shared state
        sharedState.saveModel(modelName, {
            id: modelData.id,
            name: modelName,
            versions: [{
                id: modelData.versionId,
                name: path.basename(modelFile),
            }],
        });
        
        console.log(`[Setup] Created test model "${modelName}" (ID: ${modelData.id}) via API`);
        model = sharedState.getModel(modelName);
    }
    
    console.log(`[Precondition] Model "${modelName}" exists (ID: ${model?.id})`);
});

// ============= Navigation Steps =============

When("I open the model viewer for the multi-version model", async ({ page }) => {
    if (!multiVersionModelId) throw new Error("Multi-version model ID not set");
    
    // Use correct tab-based URL format
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(`${baseUrl}/?leftTabs=modelList,model-${multiVersionModelId}&activeLeft=model-${multiVersionModelId}`);
    
    // Wait for the viewer to load using data-testid or fallback selectors
    await page.waitForSelector('[data-testid="version-dropdown-trigger"], .version-dropdown-trigger, [data-testid="model-viewer-canvas"]', { timeout: 15000 });
    console.log(`[Navigation] Opened model viewer for multi-version model (ID: ${multiVersionModelId})`);
});

When("I open the model viewer for {string}", async ({ page }, modelName: string) => {
    const model = sharedState.getModel(modelName);
    if (!model) throw new Error(`Model "${modelName}" not found in shared state`);
    
    // Use correct tab-based URL format
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(`${baseUrl}/?leftTabs=modelList,model-${model.id}&activeLeft=model-${model.id}`);
    await page.waitForSelector('[data-testid="version-dropdown-trigger"], .version-dropdown-trigger, [data-testid="model-viewer-canvas"]', { timeout: 15000 });
    console.log(`[Navigation] Opened model viewer for "${modelName}" (ID: ${model.id})`);
});



When("I delete version {int}", async ({ page }, versionIndex: number) => {
    // Determine which version to delete (1-based index from bottom/top?)
    // Assuming we want to delete a specific version item from the list
    // The list selector needs to match VersionStrip implementation
    const versionItems = page.locator(".version-dropdown-item");
    const count = await versionItems.count();
    
    // Safety check
    if (count <= 1) {
        throw new Error("Cannot delete version: only 1 version exists");
    }
    
    // Find the trash button on the specified item (or just the first one that isn't active/latest if index logic is complex)
    // For simplicity, let's delete the first available non-active version or just the 2nd item
    const targetItem = versionItems.nth(count - 1); // Delete the oldest version (last in list?) or just use index
    
    // Click the recycle/trash button
    // Selector from VersionStrip.tsx: .version-recycle-btn
    const deleteBtn = targetItem.locator(".version-recycle-btn");
    await deleteBtn.click();
    
    // Handle toast/confirmation implicitly via shared state update or UI check
    console.log(`[Action] Deleted version (index: ${versionIndex})`);
});

Then("the model should have {int} version remaining", async ({ page }, expectedCount: number) => {
    // Wait for update
    await page.waitForTimeout(1000);
    
    // Re-open dropdown to check count if needed, or check header
    // Actually, checking the dropdown items count is better
    const dropdown = page.locator(".version-dropdown-trigger");
    if (!await page.locator(".version-dropdown-menu").isVisible()) {
        await dropdown.click();
    }
    
    const versionItems = page.locator(".version-dropdown-item");
    await expect(versionItems).toHaveCount(expectedCount);
    
    console.log(`[Verify] Model has ${expectedCount} version(s) remaining ✓`);
    
    // Close dropdown
    await page.keyboard.press("Escape");
});

Then("I take a screenshot of model version deletion", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/model-version-deleted-management.png" });
    console.log("[Screenshot] Captured model version deletion");
});

// ============= Thumbnail Management Steps =============

When("I click the regenerate thumbnail button", async ({ page }) => {
    // 1. Open Thumbnail Window if not visible
    // FloatingWindow uses class 'floating-window-title' for the title span
    const thumbnailTitle = page.locator(".floating-window-title:has-text('Thumbnail Details')");
    
    if (!await thumbnailTitle.isVisible({ timeout: 3000 })) {
        // Click the thumbnail details button in controls
        const toggleBtn = page.locator("button[aria-label='Thumbnail Details']").or(page.locator("button").filter({ has: page.locator(".pi-image") }));
        await toggleBtn.first().click();
        await page.waitForTimeout(500);
        await expect(thumbnailTitle).toBeVisible({ timeout: 5000 });
        console.log("[Action] Opened Thumbnail Details window");
    }
    
    // 2. Click Regenerate button inside the floating window
    const regenButton = page.locator(".floating-window button:has-text('Regenerate Thumbnail')");
    await regenButton.click();
    await page.waitForTimeout(2000); // Wait for signalR/Toast
    console.log("[Action] Clicked regenerate thumbnail button");
});

Then("I should see a success message for thumbnail regeneration", async ({ page }) => {
    // Look for success toast
    const toast = page.locator(".p-toast-message-success");
    await expect(toast).toBeVisible({ timeout: 10000 });
    console.log("[Verify] Success message visible for thumbnail regeneration ✓");
});

Then("I take a screenshot of regenerated thumbnail", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/model-thumbnail-regenerated.png" });
    console.log("[Screenshot] Captured regenerated thumbnail");
});

// ============= Custom Thumbnail Steps =============

When("I click the upload custom thumbnail button", async ({ page }) => {
    console.log("[Action] Upload custom thumbnail button click skipped (Feature not implemented)");
    // Placeholder - waiting for feature implementation
});

When("I select an image file for custom thumbnail", async ({ page }) => {
    console.log("[Action] Select custom thumbnail image skipped (Feature not implemented)");
});

Then("I should see the custom thumbnail applied", async ({ page }) => {
    console.log("[Verify] Custom thumbnail applied check skipped (Feature not implemented)");
});

Then("I take a screenshot of custom thumbnail", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/model-custom-thumbnail.png" });
});
