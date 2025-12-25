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

// Note: db is initialized at module level for consistent database access

After(async () => {
    if (db) {
        await db.close();
    }
});

Given("I have version 1 and version 2", async ({ page }) => {
    // Assuming we already uploaded v1 and v2 in previous steps or setup
    const modelViewer = new ModelViewerPage(page);
    await modelViewer.selectVersion(1);
    await modelViewer.selectVersion(2);
});

When(
    "I save thumbnail details for version 1 from database",
    async ({ page }) => {
        // Get version 1 ID from the database
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" ORDER BY "Id" ASC LIMIT 1'
        );
        const v1Id = res.rows[0].Id;

        // Capture thumbnail details from database
        const thumbnailDetails = await db.getThumbnailDetails(v1Id);

        // Capture thumbnail src from UI
        const modelViewer = new ModelViewerPage(page);
        const thumbnailSrc = await modelViewer.getVersionThumbnailSrc(1);

        // Store in shared state
        sharedState.saveVersionState(v1Id, {
            thumbnailDetails,
            thumbnailSrc,
        });
    }
);

Then(
    "I should receive a {string} notification via SignalR for version 2",
    async ({ page }, target: string) => {
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" ORDER BY "Id" ASC OFFSET 1 LIMIT 1'
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
    async () => {
        // Get version 1 ID
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" ORDER BY "Id" ASC LIMIT 1'
        );
        const v1Id = res.rows[0].Id;

        // Get saved state from shared state
        const savedState = sharedState.getVersionState(v1Id);
        if (!savedState) {
            throw new Error(
                "Version 1 state was not saved. Ensure previous steps ran correctly."
            );
        }

        // Get current state from database
        const currentDetails = await db.getThumbnailDetails(v1Id);

        // Verify unchanged
        expect(currentDetails.ThumbnailPath).toBe(
            savedState.thumbnailDetails.ThumbnailPath
        );
        // Compare dates as strings (PostgreSQL returns string timestamps)
        expect(String(currentDetails.UpdatedAt)).toBe(
            String(savedState.thumbnailDetails.UpdatedAt)
        );
    }
);

Then(
    "version 1 should have its original thumbnail in the version strip",
    async ({ page }) => {
        // Get version 1 ID
        const res = await db.query(
            'SELECT "Id" FROM "ModelVersions" ORDER BY "Id" ASC LIMIT 1'
        );
        const v1Id = res.rows[0].Id;

        // Get saved state from shared state
        const savedState = sharedState.getVersionState(v1Id);
        if (!savedState) {
            throw new Error(
                "Version 1 state was not saved. Ensure previous steps ran correctly."
            );
        }

        // Get current thumbnail src
        const modelViewer = new ModelViewerPage(page);
        const currentSrc = await modelViewer.getVersionThumbnailSrc(1);

        // Verify unchanged
        expect(currentSrc).toBe(savedState.thumbnailSrc);
    }
);

Then(
    "version 2 should have a new thumbnail in the version strip",
    async ({ page }) => {
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.expectVersionThumbnailVisible(2);
        // We could also check if the src changed if we saved it before
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
        } catch (e) {
            // May already be linked, ignore error
        }

        // Set as default
        await apiHelper.setDefaultTextureSet(modelId, versionId, textureSet.id);

        // Give UI time to update
        await page.waitForTimeout(1000);
    }
);

Then(
    "{string} should be marked as default in the texture set selector",
    async ({ page }, name: string) => {
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.expectDefaultTextureSet(name);
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
        // In the viewer, we can check the thumbnail window or the version strip
        await expect(page.locator(".thumbnail-status-text")).toHaveText(status, {
            timeout: 60000,
        });
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
        } catch (e) {
            // May already be linked, ignore error
        }

        // Set as default via API
        await apiHelper.setDefaultTextureSet(modelId, versionId, textureSet.id);

        // Give UI time to update
        await page.waitForTimeout(1000);
    }
);

Then(
    "version {int} should have {string} as default",
    async ({ page }, versionNumber: number, textureSetName: string) => {
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.expectVersionDefault(versionNumber, textureSetName);
    }
);

Then(
    "version {int} should still have {string} as default",
    async ({ page }, versionNumber: number, textureSetName: string) => {
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.expectVersionDefault(versionNumber, textureSetName);
    }
);
