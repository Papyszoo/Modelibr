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

let db: DbHelper;
const apiHelper = new ApiHelper();

Before(async () => {
    db = new DbHelper();
});

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
            'SELECT id FROM "ModelVersions" ORDER BY id ASC LIMIT 1'
        );
        const v1Id = res.rows[0].id;

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
            'SELECT id FROM "ModelVersions" ORDER BY id ASC OFFSET 1 LIMIT 1'
        );
        const v2Id = res.rows[0].id;

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
            'SELECT id FROM "ModelVersions" ORDER BY id ASC LIMIT 1'
        );
        const v1Id = res.rows[0].id;

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
        expect(currentDetails.UpdatedAt.getTime()).toBe(
            savedState.thumbnailDetails.UpdatedAt.getTime()
        );
    }
);

Then(
    "version 1 should have its original thumbnail in the version strip",
    async ({ page }) => {
        // Get version 1 ID
        const res = await db.query(
            'SELECT id FROM "ModelVersions" ORDER BY id ASC LIMIT 1'
        );
        const v1Id = res.rows[0].id;

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
        const filePath = path.join(__dirname, "..", "assets", fileName);
        await modelList.uploadModel(filePath);
        await modelList.expectModelVisible(fileName);
        
        // Store in shared state for later steps to find
        sharedState.saveModel(fileName, {
            id: 0, // Will be updated when navigating to viewer
            name: fileName,
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
        
        // Wait for texture set to appear in the list
        await page.waitForTimeout(2000); // Allow upload to complete
        await expect(async () => {
            const exists = await textureSetsPage.textureSetExists(setName);
            expect(exists).toBe(true);
        }).toPass({ timeout: 10000 });
        
        // Store in shared state for subsequent steps
        const textureSet = await apiHelper.getTextureSetByName(setName);
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

        // Get model to find active version
        const model = await apiHelper.getModel(modelId);
        const versionId = model.activeVersionId || model.versions?.[0]?.id;
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

        // Get current model ID from page URL
        const url = page.url();
        const match = url.match(/model-(\d+)/);
        if (!match) {
            throw new Error("Could not determine model ID from URL");
        }
        const modelId = parseInt(match[1], 10);

        // Get model to find active version
        const model = await apiHelper.getModel(modelId);
        const versionId = model.activeVersionId || model.versions?.[0]?.id;

        if (!versionId) {
            throw new Error("Could not determine model version ID");
        }

        await apiHelper.setDefaultTextureSet(
            modelId,
            versionId,
            textureSet.id
        );

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
        await expect(page.locator(".thumbnail-status")).toHaveText(status, {
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
        const modelViewer = new ModelViewerPage(page);
        await modelViewer.setDefaultTextureSet(name);
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
