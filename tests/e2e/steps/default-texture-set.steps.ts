import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import { TextureSetsPage } from "../pages/TextureSetsPage";
import { SignalRHelper } from "../fixtures/signalr-helper";
import { DbHelper } from "../fixtures/db-helper";
import { ApiHelper } from "../helpers/api-helper";
import { sharedState } from "../fixtures/shared-state";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then, Before, After } = createBdd();

const db = new DbHelper();
const apiHelper = new ApiHelper();

// Note: db uses lazy pool creation and handles its own lifecycle

// Helper to get model ID from page URL
async function getModelIdFromUrl(page: any): Promise<number> {
    const url = page.url();
    const match = url.match(/model-(\d+)/);
    if (!match) {
        throw new Error(`Could not extract model ID from URL: ${url}`);
    }
    return parseInt(match[1], 10);
}

Given("I have version 1 and version 2", async ({ page }) => {
    const modelId = await getModelIdFromUrl(page);
    
    // Validate this model has exactly 2 versions
    const res = await db.query(
        'SELECT "Id", "VersionNumber" FROM "ModelVersions" WHERE "ModelId" = $1 ORDER BY "VersionNumber"',
        [modelId]
    );
    
    if (res.rows.length < 2) {
        throw new Error(
            `Model ${modelId} has ${res.rows.length} versions, expected at least 2. ` +
            `Versions: ${JSON.stringify(res.rows)}`
        );
    }
    
    console.log(`[Validation] Model ${modelId} has ${res.rows.length} versions: ${res.rows.map((r: any) => `v${r.VersionNumber} (id=${r.Id})`).join(', ')}`);
    
    // Verify we can select both versions in UI
    const modelViewer = new ModelViewerPage(page);
    await modelViewer.selectVersion(1);
    await modelViewer.selectVersion(2);
});

When(
    "I save thumbnail details for version 1 from database",
    async ({ page }) => {
        const modelId = await getModelIdFromUrl(page);
        
        // Get version 1 for THIS model
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" WHERE "ModelId" = $1 AND "VersionNumber" = 1',
            [modelId]
        );
        
        if (res.rows.length === 0) {
            throw new Error(`Version 1 not found for model ${modelId}`);
        }
        
        const v1Id = res.rows[0].Id;
        console.log(`[DB] Saving state for model ${modelId}, version 1 (id=${v1Id})`);

        // Capture thumbnail details from database
        const thumbnailDetails = await db.getThumbnailDetails(v1Id);
        
        if (!thumbnailDetails) {
            console.warn(`[Warning] No thumbnail found for version ${v1Id} - may be processing`);
        } else {
            console.log(`[DB] Thumbnail status: ${thumbnailDetails.Status}, path: ${thumbnailDetails.ThumbnailPath ? 'exists' : 'null'}`);
        }

        // Capture thumbnail src from UI
        const modelViewer = new ModelViewerPage(page);
        const thumbnailSrc = await modelViewer.getVersionThumbnailSrc(1);

        // Store in shared state with model-prefixed key to avoid collisions
        sharedState.saveVersionState(v1Id, {
            thumbnailDetails,
            thumbnailSrc,
        });
    }
);

Then(
    "I should receive a {string} notification via SignalR for version 2",
    async ({ page }, target: string) => {
        const modelId = await getModelIdFromUrl(page);
        
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" WHERE "ModelId" = $1 AND "VersionNumber" = 2',
            [modelId]
        );
        const v2Id = res.rows[0].Id;

        const signalR = new SignalRHelper(page);
        await signalR.waitForMessage(
            "/thumbnailHub",
            target,
            (args) => args.modelVersionId === v2Id
        );
    }
);

Then(
    "thumbnail details for version 1 in database should remain unchanged",
    async ({ page }) => {
        const modelId = await getModelIdFromUrl(page);
        
        // Get version 1 for THIS model
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" WHERE "ModelId" = $1 AND "VersionNumber" = 1',
            [modelId]
        );
        const v1Id = res.rows[0].Id;

        // Get saved state from shared state
        const savedState = sharedState.getVersionState(v1Id);
        if (!savedState) {
            throw new Error(
                `Version 1 (id=${v1Id}) state was not saved. Ensure previous steps ran correctly.`
            );
        }

        // Get current state from database
        const currentDetails = await db.getThumbnailDetails(v1Id);

        // Verify unchanged
        expect(currentDetails.ThumbnailPath).toBe(
            savedState.thumbnailDetails.ThumbnailPath
        );
        // Compare dates as ISO strings for consistent format
        expect(new Date(currentDetails.UpdatedAt).toISOString()).toBe(
            new Date(savedState.thumbnailDetails.UpdatedAt).toISOString()
        );
        
        console.log(`[DB Check] Version 1 (id=${v1Id}) thumbnail unchanged ✓`);
    }
);

Then(
    "version 1 should have its original thumbnail in the version strip",
    async ({ page }) => {
        const modelId = await getModelIdFromUrl(page);
        
        // Get version 1 for THIS model
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" WHERE "ModelId" = $1 AND "VersionNumber" = 1',
            [modelId]
        );
        const v1Id = res.rows[0].Id;

        // Get saved state from shared state
        const savedState = sharedState.getVersionState(v1Id);
        if (!savedState) {
            throw new Error(
                `Version 1 (id=${v1Id}) state was not saved. Ensure previous steps ran correctly.`
            );
        }

        // Get current thumbnail src
        const modelViewer = new ModelViewerPage(page);
        const currentSrc = await modelViewer.getVersionThumbnailSrc(1);

        // Verify unchanged
        expect(currentSrc).toBe(savedState.thumbnailSrc);
        console.log(`[UI Check] Version 1 thumbnail src unchanged ✓`);
    }
);

Then(
    "version 2 should have a new thumbnail in the version strip",
    async ({ page }) => {
        const modelViewer = new ModelViewerPage(page);
        
        // Get model ID from URL to query for v2's thumbnail
        const url = page.url();
        const modelIdMatch = url.match(/model-(\d+)/);
        if (!modelIdMatch) {
            throw new Error("Could not extract model ID from URL");
        }
        const modelId = parseInt(modelIdMatch[1], 10);
        
        // Wait for v2 thumbnail to be ready in database
        // This ensures the thumbnail is actually generated before we check UI
        const maxAttempts = 30;
        const pollInterval = 2000;
        let thumbnailReady = false;
        
        for (let i = 0; i < maxAttempts && !thumbnailReady; i++) {
            const result = await db.query(
                `SELECT t."Status" 
                 FROM "Thumbnails" t 
                 JOIN "ModelVersions" mv ON mv."ThumbnailId" = t."Id"
                 WHERE mv."ModelId" = $1 AND mv."VersionNumber" = 2`,
                [modelId]
            );
            
            if (result.rows.length > 0 && result.rows[0].Status === 2) {
                thumbnailReady = true;
                console.log(`[DB] Version 2 thumbnail is Ready (status=2)`);
            } else {
                console.log(`[DB] Waiting for v2 thumbnail... attempt ${i + 1}/${maxAttempts}`);
                await page.waitForTimeout(pollInterval);
            }
        }
        
        if (!thumbnailReady) {
            throw new Error("Version 2 thumbnail did not become Ready within timeout");
        }
        
        // Reload page to ensure frontend has latest version data with thumbnail URLs
        // This is more reliable than depending on SignalR in tests
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.viewer-controls', { state: 'visible', timeout: 30000 });
        
        // Open dropdown and verify v2 thumbnail has an actual image
        
        // Open the version dropdown and leave it open for the screenshot
        const dropdownTrigger = page.locator(".version-dropdown-trigger");
        await dropdownTrigger.click();
        await page.waitForSelector(".version-dropdown-menu", { state: "visible", timeout: 5000 });
        
        // Verify v2 thumbnail has an img with a src (not empty/placeholder)
        // Note: when thumbnailUrl exists, the img tag itself has class "version-dropdown-thumb"
        const v2Item = page.locator(".version-dropdown-item", { hasText: "v2" });
        const v2Thumb = v2Item.locator("img.version-dropdown-thumb");
        await expect(v2Thumb).toBeVisible({ timeout: 10000 });
        const src = await v2Thumb.getAttribute("src");
        expect(src).toBeTruthy();
        expect(src).not.toBe("");
        console.log(`[UI] Version 2 thumbnail img src: ${src?.substring(0, 50)}...`);
        
        console.log("[Screenshot] Version dropdown opened to show both version thumbnails");
    }
);

// Cleanup DB connection after tests
// Note: playwright-bdd might need a specific way to handle After hooks if not using standard playwright test hooks
// For now, I'll just ensure it's closed if I can, but standard BDD After is better.

Given(
    "I have uploaded a model {string}",
    async ({ page }, fileName: string) => {
        const modelList = new ModelListPage(page);
        const modelName = fileName.replace(/\.[^/.]+$/, ''); // Strip extension
        
        // Check if model already exists in shared state (from previous test)
        const existing = sharedState.getModel(fileName);
        if (existing && existing.id > 0) {
            // Model already uploaded, just navigate to list and ensure visible
            await modelList.goto();
            await modelList.expectModelVisible(modelName);
            return;
        }
        
        // Upload the model - API handles deduplication and returns existing if same hash
        const filePath = path.join(__dirname, "..", "assets", fileName);
        await modelList.uploadModel(filePath);
        
        // Wait for model to appear in list (API may return existing deduplicated model)
        await modelList.expectModelVisible(modelName);
        
        // Store in shared state with the filename as key
        sharedState.saveModel(fileName, {
            id: 0, // Will be updated when navigating to viewer
            name: modelName,
        });
    }
);

When("I open the texture set selector", async ({ page }) => {
    const modelViewer = new ModelViewerPage(page);
    await modelViewer.openTextureSetSelector();
});

When("I create a new texture set {string}", async ({ page }, name: string) => {
    // Create via API for faster, more reliable testing
    // Add timestamp to make names unique across test runs
    const uniqueName = `${name}-${Date.now()}`;
    const textureSet = await apiHelper.createTextureSet(uniqueName);

    // Store in shared state with original name for test steps to reference
    sharedState.saveTextureSet(name, {
        id: textureSet.id,
        name: uniqueName,
    });
});

When(
    "I upload texture {string} to texture set {string}",
    async ({ page }, textureName: string, setName: string) => {
        const textureSet = sharedState.getTextureSet(setName);
        if (!textureSet) {
            throw new Error(`Texture set ${setName} not found in shared state`);
        }
        const texturePath = path.join(__dirname, "..", "assets", textureName);
        await apiHelper.uploadTextureToSet(textureSet.id, texturePath);
    }
);

/**
 * Navigate to the Texture Sets page
 */
Given("I am on the texture sets page", async ({ page }) => {
    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.goto();
});

When(
    "I upload texture {string} via UI button",
    async ({ page }, fileName: string) => {
        const textureSetsPage = new TextureSetsPage(page);
        
        const filePath = path.join(__dirname, "..", "assets", fileName);
        await textureSetsPage.uploadTexturesViaInput([filePath]);
        
        // Derive texture set name from filename (app creates set with file basename)
        const setName = fileName.replace(/\.[^/.]+$/, '');
        
        // Wait for upload to complete and texture set to be created via API
        await page.waitForTimeout(2000); // Allow upload to complete
        
        // Verify via API that texture set was created (more reliable than UI check)
        let textureSet: any = null;
        await expect(async () => {
            textureSet = await apiHelper.getTextureSetByName(setName);
            expect(textureSet).not.toBeNull();
        }).toPass({ timeout: 10000 });
        
        // Store in shared state for subsequent steps
        sharedState.saveTextureSet(setName, {
            id: textureSet.id,
            name: setName
        });
    }
);

When(
    "I link texture set {string} to the model",
    async ({ page }, setName: string) => {
        const textureSet = sharedState.getTextureSet(setName);
        if (!textureSet) {
            throw new Error(`Texture set ${setName} not found in shared state`);
        }

        // Get current model ID from page URL or context
        const url = page.url();
        const match = url.match(/model-(\d+)/);
        if (!match) {
            throw new Error("Could not determine model ID from URL");
        }
        const modelId = parseInt(match[1]);

        // Get model versions to find active version
        const versions = await apiHelper.getModelVersions(modelId);
        const versionId = versions[0]?.id;
        if (!versionId) {
            throw new Error("Could not determine model version ID");
        }

        await apiHelper.linkTextureSetToModel(
            textureSet.id,
            modelId,
            versionId
        );

        // Update shared state with model and version IDs
        sharedState.saveTextureSet(setName, {
            ...textureSet,
            modelId,
            versionId,
        });
    }
);

When(
    "I set {string} as the default texture set for the current version",
    async ({ page }, name: string) => {
        const textureSet = sharedState.getTextureSet(name);
        if (!textureSet) {
            throw new Error(`Texture set ${name} not found in shared state`);
        }

        // Get modelId and versionId from the current page URL
        const url = page.url();
        const modelMatch = url.match(/model-(\d+)/);
        if (!modelMatch) {
            throw new Error(`Could not extract model ID from URL: ${url}`);
        }
        const modelId = parseInt(modelMatch[1], 10);

        // Get versions from API
        const versions = await apiHelper.getModelVersions(modelId);
        const versionId = versions[0]?.id;
        if (!versionId) {
            throw new Error(`Could not find version ID for model ${modelId}. Versions: ${JSON.stringify(versions)}`);
        }

        // First link the texture set to the model version if not already linked
        try {
            await apiHelper.linkTextureSetToModel(textureSet.id, modelId, versionId);
        } catch (e: any) {
            // Silently ignore "already linked" errors
            if (!e.message?.includes('AssociationAlreadyExists') && !e.message?.includes('already associated')) {
                console.warn('Link texture set warning:', e.message);
            }
        }

        // Set as default
        await apiHelper.setDefaultTextureSet(modelId, versionId, textureSet.id);

        // Navigate away and back to force frontend to reload model data with new default
        // This is more reliable than page.reload() which can time out
        const currentUrl = page.url();
        await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:3002'}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.viewer-controls', { state: 'visible', timeout: 30000 });
    }
);

Then(
    "{string} should be marked as default in the texture set selector",
    async ({ page }, name: string) => {
        // Get the texture set from shared state for its ID
        const textureSet = sharedState.getTextureSet(name);
        if (!textureSet) {
            throw new Error(`Texture set ${name} not found in shared state`);
        }

        // Get modelId and versionId from the current page URL
        const url = page.url();
        const modelMatch = url.match(/model-(\d+)/);
        if (!modelMatch) {
            throw new Error(`Could not extract model ID from URL: ${url}`);
        }
        const modelId = parseInt(modelMatch[1], 10);

        // Get versions from API to find current version ID
        const versions = await apiHelper.getModelVersions(modelId);
        const versionId = versions[0]?.id;
        if (!versionId) {
            throw new Error(`Could not find version ID for model ${modelId}`);
        }

        // 1. Database verification (primary check)
        const defaultTextureSetId = await db.getDefaultTextureSetForVersion(versionId);
        expect(defaultTextureSetId).toBe(textureSet.id);
        console.log(`[DB Check] Version ${versionId} has DefaultTextureSetId=${defaultTextureSetId}, expected=${textureSet.id} ✓`);

        // 2. UI verification (must match database state)
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.expectDefaultTextureSet(name);
        console.log(`[UI Check] Badge "Default" found for ${name} ✓`);
    }
);

Then(
    "I should receive a {string} notification via SignalR for this version",
    async ({ page }, target: string) => {
        const signalR = new SignalRHelper(page);
        await signalR.waitForMessage("/thumbnailHub", target);
    }
);

Then(
    "the version thumbnail should eventually be {string}",
    async ({ page }, status: string) => {
        // Get modelId and versionId from URL
        const url = page.url();
        const modelMatch = url.match(/model-(\d+)/);
        if (!modelMatch) {
            throw new Error(`Could not extract model ID from URL: ${url}`);
        }
        const modelId = parseInt(modelMatch[1], 10);

        // Get the first version ID
        const versions = await apiHelper.getModelVersions(modelId);
        const versionId = versions[0]?.id;
        if (!versionId) {
            throw new Error(`Could not find version ID for model ${modelId}`);
        }

        // 1. Database verification (primary check) - poll for status change
        // Status values: 0=Pending, 1=Processing, 2=Ready, 3=Failed
        const expectedStatus = status.toLowerCase() === "ready" ? 2 : 0;
        
        await expect(async () => {
            const thumbnailDetails = await db.getThumbnailDetails(versionId);
            expect(thumbnailDetails?.Status).toBe(expectedStatus);
        }).toPass({ timeout: 60000 });
        
        console.log(`[DB Check] Thumbnail for version ${versionId} has Status=${expectedStatus} (${status}) ✓`);
        
        // Note: Frontend doesn't have .thumbnail-status-text element, so no UI check for thumbnail status
    }
);

Given(
    "the current version has {string} as default",
    async ({ page }, name: string) => {
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.openTextureSetSelector();
        await modelViewer.expectDefaultTextureSet(name);
        // Close selector if needed, or just continue
    }
);

When("I upload a new version {string}", async ({ page }, fileName: string) => {
    const modelViewer = new ModelViewerPage(page);
    const filePath = path.join(__dirname, "..", "assets", fileName);
    await modelViewer.uploadNewVersion(filePath);
});

When("I select version {int}", async ({ page }, versionNumber: number) => {
    const modelViewer = new ModelViewerPage(page);
    await modelViewer.selectVersion(versionNumber);
});

When(
    "I set {string} as the default texture set for version {int}",
    async ({ page }, name: string, versionNumber: number) => {
        const textureSet = sharedState.getTextureSet(name);
        if (!textureSet) {
            throw new Error(`Texture set ${name} not found in shared state`);
        }

        // Get modelId from the current page URL
        const url = page.url();
        const modelMatch = url.match(/model-(\d+)/);
        if (!modelMatch) {
            throw new Error(`Could not extract model ID from URL: ${url}`);
        }
        const modelId = parseInt(modelMatch[1], 10);

        // Get the specific version ID
        const versions = await apiHelper.getModelVersions(modelId);
        const version = versions.find(v => v.versionNumber === versionNumber);
        if (!version) {
            throw new Error(`Version ${versionNumber} not found for model ${modelId}`);
        }
        const versionId = version.id;

        // First link the texture set to the model version if not already linked
        try {
            await apiHelper.linkTextureSetToModel(textureSet.id, modelId, versionId);
        } catch (e: any) {
            // Silently ignore "already linked" errors
            if (!e.message?.includes('AssociationAlreadyExists') && !e.message?.includes('already associated')) {
                console.warn('Link texture set warning:', e.message);
            }
        }

        // Set as default via API
        await apiHelper.setDefaultTextureSet(modelId, versionId, textureSet.id);

        // Navigate away and back to force frontend to reload model data with new default
        const currentUrl = page.url();
        await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:3002'}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.viewer-controls', { state: 'visible', timeout: 30000 });
    }
);

Then(
    "version {int} should have {string} as default",
    async ({ page }, versionNumber: number, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        if (!textureSet) {
            throw new Error(`Texture set ${textureSetName} not found in shared state`);
        }

        // Get modelId from URL
        const url = page.url();
        const modelMatch = url.match(/model-(\d+)/);
        if (!modelMatch) {
            throw new Error(`Could not extract model ID from URL: ${url}`);
        }
        const modelId = parseInt(modelMatch[1], 10);

        // Get the specific version ID
        const versions = await apiHelper.getModelVersions(modelId);
        const version = versions.find((v: any) => v.versionNumber === versionNumber);
        if (!version) {
            throw new Error(`Version ${versionNumber} not found for model ${modelId}`);
        }
        const versionId = version.id;

        // 1. Database verification (primary check)
        const defaultTextureSetId = await db.getDefaultTextureSetForVersion(versionId);
        expect(defaultTextureSetId).toBe(textureSet.id);
        console.log(`[DB Check] Version ${versionId} (v${versionNumber}) has DefaultTextureSetId=${defaultTextureSetId}, expected=${textureSet.id} ✓`);

        // 2. UI verification (must match database state)
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.expectVersionDefault(versionNumber, textureSetName);
        console.log(`[UI Check] Badge "Default" found for ${textureSetName} on v${versionNumber} ✓`);
    }
);

Then(
    "version {int} should still have {string} as default",
    async ({ page }, versionNumber: number, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        if (!textureSet) {
            throw new Error(`Texture set ${textureSetName} not found in shared state`);
        }

        // Get modelId from URL
        const url = page.url();
        const modelMatch = url.match(/model-(\d+)/);
        if (!modelMatch) {
            throw new Error(`Could not extract model ID from URL: ${url}`);
        }
        const modelId = parseInt(modelMatch[1], 10);

        // Get the specific version ID
        const versions = await apiHelper.getModelVersions(modelId);
        const version = versions.find((v: any) => v.versionNumber === versionNumber);
        if (!version) {
            throw new Error(`Version ${versionNumber} not found for model ${modelId}`);
        }
        const versionId = version.id;

        // 1. Database verification (primary check)
        const defaultTextureSetId = await db.getDefaultTextureSetForVersion(versionId);
        expect(defaultTextureSetId).toBe(textureSet.id);
        console.log(`[DB Check] Version ${versionId} (v${versionNumber}) still has DefaultTextureSetId=${defaultTextureSetId}, expected=${textureSet.id} ✓`);

        // 2. UI verification (must match database state)
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.expectVersionDefault(versionNumber, textureSetName);
        console.log(`[UI Check] Badge "Default" still shows for ${textureSetName} on v${versionNumber} ✓`);
    }
);

/**
 * Ensures the texture set selector is visible for screenshot.
 * Opens the panel if not already visible.
 */
Then(
    "the texture set selector should be visible",
    async ({ page }) => {
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.openTextureSetSelector();
        console.log("[Screenshot] Texture set selector opened to show default texture set");
    }
);
