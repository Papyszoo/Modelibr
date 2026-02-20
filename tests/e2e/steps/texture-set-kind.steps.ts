import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { navigateToTab } from "../helpers/navigation-helper";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { When, Then } = createBdd();

const apiHelper = new ApiHelper();

// Run-unique ID to prevent collisions across test runs
const runId = Date.now().toString(36).slice(-4);

// Track created texture sets for step cross-referencing
const createdSets: Record<string, { id: number; name: string }> = {};

// Helper to derive a unique name
function uniqueName(baseName: string): string {
    return `${baseName}_${runId}`;
}

// Helper to find a texture set card on the page
function getCardLocator(page: any, name: string) {
    return page.locator(`.texture-set-card`).filter({
        has: page.locator(`.texture-set-card-name:has-text("${name}")`),
    });
}

// ── Navigation ────────────────────────────────────────────────────────
// Note: "Given I am on the texture sets page" is already defined in default-texture-set.steps.ts

When("I reload the page", async ({ page }) => {
    await page.reload();
    await page.waitForSelector(".texture-set-list", { timeout: 10000 });
    // Wait for kind filter tabs to initialize (nuqs URL state sync)
    await page.waitForSelector(".kind-filter-select .p-button.p-highlight", {
        timeout: 5000,
    });
});

When("I navigate away and return to texture sets", async ({ page }) => {
    // Navigate to a different tab, then back
    await navigateToTab(page, "modelList");
    await page.waitForTimeout(500);
    await navigateToTab(page, "textureSets");
    await page.waitForSelector(".texture-set-list", { timeout: 10000 });
});

// ── Kind Tab Interactions ─────────────────────────────────────────────

Then(
    "the {string} kind tab should be active",
    async ({ page }, tabName: string) => {
        // The active kind tab button has the 'p-highlight' class
        const tabButton = page
            .locator(`.kind-filter-select .p-button`)
            .filter({ hasText: tabName });

        await expect(tabButton).toBeVisible({ timeout: 5000 });
        await expect(tabButton).toHaveClass(/p-highlight/, { timeout: 5000 });
    },
);

When("I switch to the {string} kind tab", async ({ page }, tabName: string) => {
    const tabButton = page
        .locator(`.kind-filter-select .p-button`)
        .filter({ hasText: tabName });

    await expect(tabButton).toBeVisible({ timeout: 5000 });

    // Only click if this tab is not already active
    const isActive = await tabButton.evaluate((el: Element) =>
        el.classList.contains("p-highlight"),
    );
    if (!isActive) {
        await tabButton.click();
    }
    // Wait for grid to refresh
    await page.waitForTimeout(1000);
});

// ── Create Texture Sets via API ───────────────────────────────────────

When(
    "I create a model-specific texture set {string} via API",
    async ({ page }, baseName: string) => {
        const name = uniqueName(baseName);
        const testFile = await UniqueFileGenerator.generate("blue_color.png");
        const result = await apiHelper.createTextureSetWithFileAndKind(
            name,
            testFile,
            1, // Albedo
            0, // ModelSpecific
        );
        createdSets[baseName] = { id: result.textureSetId, name };
        console.log(
            `[API] Created model-specific texture set "${name}" (ID: ${result.textureSetId})`,
        );

        // Reload to see new data
        await page.reload();
        await page.waitForSelector(".texture-set-list", { timeout: 10000 });
    },
);

When(
    "I create a universal texture set {string} via API",
    async ({ page }, baseName: string) => {
        const name = uniqueName(baseName);
        const testFile = await UniqueFileGenerator.generate("red_color.png");
        const result = await apiHelper.createTextureSetWithFileAndKind(
            name,
            testFile,
            1, // Albedo
            1, // Universal
        );
        createdSets[baseName] = { id: result.textureSetId, name };
        console.log(
            `[API] Created universal texture set "${name}" (ID: ${result.textureSetId})`,
        );

        // Reload to see new data
        await page.reload();
        await page.waitForSelector(".texture-set-list", { timeout: 10000 });
    },
);

// ── Change Kind via API ───────────────────────────────────────────────

When(
    "I change texture set {string} kind to Universal via API",
    async ({}, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );
        await apiHelper.updateTextureSetKind(set.id, 1); // Universal
        console.log(
            `[API] Changed texture set "${set.name}" kind to Universal`,
        );
    },
);

When(
    "I change texture set {string} kind to ModelSpecific via API",
    async ({}, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );
        await apiHelper.updateTextureSetKind(set.id, 0); // ModelSpecific
        console.log(
            `[API] Changed texture set "${set.name}" kind to ModelSpecific`,
        );
    },
);

// ── Grid Assertions ──────────────────────────────────────────────────

Then(
    "I should see texture set {string} in the grid",
    async ({ page }, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        // Use search to filter by name — avoids pagination issues when >50 sets exist
        const searchInput = page.locator(".search-input");
        const searchVisible = await searchInput
            .isVisible({ timeout: 3000 })
            .catch(() => false);
        if (searchVisible) {
            await searchInput.clear();
            await searchInput.fill(set.name);
            await page.waitForTimeout(300);
        }

        const card = getCardLocator(page, set.name);
        await expect(card).toBeVisible({ timeout: 10000 });

        // Clear search so it doesn't affect subsequent steps
        if (searchVisible) {
            await searchInput.clear();
            await page.waitForTimeout(300);
        }
    },
);

Then(
    "I should not see texture set {string} in the grid",
    async ({ page }, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        const card = getCardLocator(page, set.name);
        await expect(card).toHaveCount(0, { timeout: 5000 });
    },
);

// ── Drag and Drop between Kind Tabs ──────────────────────────────────

When(
    "I drag texture set {string} to the {string} kind tab",
    async ({ page }, baseName: string, targetTabName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        // Find the source card
        const card = getCardLocator(page, set.name);
        await expect(card).toBeVisible({ timeout: 5000 });

        // Find the target tab button
        const targetTab = page
            .locator(`.kind-filter-select .p-button`)
            .filter({ hasText: targetTabName });
        await expect(targetTab).toBeVisible({ timeout: 5000 });

        // Perform drag and drop
        await card.dragTo(targetTab);

        // Wait for the API call to complete and grid to refresh
        await page.waitForTimeout(1000);
    },
);

// ── Thumbnail Verification via API ───────────────────────────────────

Then(
    "texture set {string} should have a thumbnail via API",
    async ({}, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        // Poll the API for a few seconds to allow thumbnail generation
        let hasThumbnail = false;
        for (let attempt = 0; attempt < 10; attempt++) {
            const textureSets = await apiHelper.getAllTextureSets();
            const found = textureSets.find((ts: any) => ts.id === set.id);
            if (
                found &&
                found.thumbnailPath &&
                found.thumbnailPath.length > 0
            ) {
                hasThumbnail = true;
                console.log(
                    `[API] Texture set "${set.name}" has thumbnail: ${found.thumbnailPath}`,
                );
                break;
            }
            // Wait 500ms between attempts (max ~5 seconds total)
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        expect(hasThumbnail).toBeTruthy();
    },
);

Then(
    "texture set {string} should have a thumbnail within {int} seconds via API",
    async ({}, baseName: string, timeoutSeconds: number) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        // Poll the API with a configurable timeout (for heavy workloads like EXR conversion)
        const intervalMs = 1000;
        const maxAttempts = timeoutSeconds;
        let hasThumbnail = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const textureSets = await apiHelper.getAllTextureSets();
            const found = textureSets.find((ts: any) => ts.id === set.id);
            if (
                found &&
                found.thumbnailPath &&
                found.thumbnailPath.length > 0
            ) {
                hasThumbnail = true;
                console.log(
                    `[API] Texture set "${set.name}" has thumbnail after ${attempt + 1}s: ${found.thumbnailPath}`,
                );
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        expect(hasThumbnail).toBeTruthy();
    },
);

// ── Context Menu Interactions ────────────────────────────────────────

When(
    "I right-click on texture set {string}",
    async ({ page }, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        const card = getCardLocator(page, set.name);
        await expect(card).toBeVisible({ timeout: 5000 });

        // Right-click to open context menu
        await card.click({ button: "right" });
        console.log(`[Action] Right-clicked on texture set card "${set.name}"`);

        // Wait for context menu to appear
        await page.waitForSelector(".p-contextmenu", { timeout: 5000 });
    },
);

Then(
    "I should see {string} in the context menu",
    async ({ page }, menuItemLabel: string) => {
        const menuItem = page
            .locator(".p-contextmenu .p-menuitem")
            .filter({ hasText: menuItemLabel });

        await expect(menuItem).toBeVisible({ timeout: 3000 });
        console.log(`[Assert] Context menu item "${menuItemLabel}" is visible`);

        // Close context menu by clicking away
        await page.locator("body").click();
        await page.waitForTimeout(300);
    },
);

Then(
    "I should not see {string} in the context menu",
    async ({ page }, menuItemLabel: string) => {
        // The context menu should be visible but the item should not be present
        const contextMenu = page.locator(".p-contextmenu");
        await expect(contextMenu).toBeVisible({ timeout: 3000 });

        const menuItem = page
            .locator(".p-contextmenu .p-menuitem")
            .filter({ hasText: menuItemLabel });

        await expect(menuItem).toHaveCount(0, { timeout: 3000 });
        console.log(
            `[Assert] Context menu item "${menuItemLabel}" is NOT visible`,
        );

        // Close context menu by clicking away
        await page.locator("body").click();
        await page.waitForTimeout(300);
    },
);

When(
    "I click {string} in the context menu",
    async ({ page }, menuItemLabel: string) => {
        const menuItem = page
            .locator(".p-contextmenu .p-menuitem")
            .filter({ hasText: menuItemLabel });

        await expect(menuItem).toBeVisible({ timeout: 3000 });
        await menuItem.click();
        console.log(`[Action] Clicked context menu item "${menuItemLabel}"`);

        // Wait for action to process
        await page.waitForTimeout(500);
    },
);

// ── Toast Assertions ─────────────────────────────────────────────────

Then(
    "I should see a success toast with {string}",
    async ({ page }, expectedText: string) => {
        // Wait for the success toast to appear
        const toast = page.locator(".p-toast-message-success");
        await expect(toast).toBeVisible({ timeout: 10000 });

        // Check the toast detail text
        const toastDetail = toast.locator(".p-toast-detail");
        await expect(toastDetail).toContainText(expectedText, {
            timeout: 5000,
        });
        console.log(`[Assert] Success toast with "${expectedText}" appeared`);
    },
);

// ── API Kind Filtering Assertions ────────────────────────────────────

Then(
    "the API should return texture set {string} for kind ModelSpecific",
    async ({}, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        const results = await apiHelper.getTextureSetsByKind(0); // ModelSpecific
        const found = results.find((ts: any) => ts.id === set.id);
        expect(found).toBeTruthy();
        console.log(
            `[API] Texture set "${set.name}" found in ModelSpecific filter`,
        );
    },
);

Then(
    "the API should return texture set {string} for kind Universal",
    async ({}, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        const results = await apiHelper.getTextureSetsByKind(1); // Universal
        const found = results.find((ts: any) => ts.id === set.id);
        expect(found).toBeTruthy();
        console.log(
            `[API] Texture set "${set.name}" found in Universal filter`,
        );
    },
);

Then(
    "the API should not return texture set {string} for kind Universal",
    async ({}, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        const results = await apiHelper.getTextureSetsByKind(1); // Universal
        const found = results.find((ts: any) => ts.id === set.id);
        expect(found).toBeFalsy();
        console.log(
            `[API] Texture set "${set.name}" correctly NOT in Universal filter`,
        );
    },
);

Then(
    "the API should not return texture set {string} for kind ModelSpecific",
    async ({}, baseName: string) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        const results = await apiHelper.getTextureSetsByKind(0); // ModelSpecific
        const found = results.find((ts: any) => ts.id === set.id);
        expect(found).toBeFalsy();
        console.log(
            `[API] Texture set "${set.name}" correctly NOT in ModelSpecific filter`,
        );
    },
);

// ── Global Texture Files ──────────────────────────────────────────────

const GLOBAL_TEXTURE_DIR = path.resolve(
    __dirname,
    "..",
    "assets",
    "global texture",
);

// Texture type mapping: filename → API texture type number
const GLOBAL_TEXTURE_FILES: { file: string; type: number }[] = [
    { file: "diffuse.jpg", type: 1 }, // Albedo
    { file: "displacement.png", type: 12 }, // Displacement
    { file: "normal.exr", type: 2 }, // Normal
    { file: "roughness.exr", type: 5 }, // Roughness
];

When(
    "I create a universal texture set {string} with global texture files via API",
    async ({}, baseName: string) => {
        const name = uniqueName(baseName);

        // Create the set with the first file (diffuse) as Universal (kind=1)
        const firstFile = GLOBAL_TEXTURE_FILES[0];
        const firstFilePath = path.join(GLOBAL_TEXTURE_DIR, firstFile.file);
        const result = await apiHelper.createTextureSetWithFileAndKind(
            name,
            firstFilePath,
            firstFile.type,
            1, // Universal
        );
        createdSets[baseName] = { id: result.textureSetId, name };
        console.log(
            `[API] Created universal texture set "${name}" (ID: ${result.textureSetId}) with ${firstFile.file}`,
        );

        // Upload remaining files
        for (let i = 1; i < GLOBAL_TEXTURE_FILES.length; i++) {
            const { file, type } = GLOBAL_TEXTURE_FILES[i];
            const filePath = path.join(GLOBAL_TEXTURE_DIR, file);
            await apiHelper.uploadTextureToSet(
                result.textureSetId,
                filePath,
                type,
            );
            console.log(
                `[API] Uploaded "${file}" (type: ${type}) to texture set "${name}"`,
            );
        }
    },
);

Then(
    "texture set {string} should have {int} textures via API",
    async ({}, baseName: string, expectedCount: number) => {
        const set = createdSets[baseName];
        if (!set)
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );

        const textureSet = await apiHelper.getTextureSetById(set.id);
        expect(textureSet.textures.length).toBe(expectedCount);
        console.log(
            `[API] Texture set "${set.name}" has ${textureSet.textures.length} textures ✓`,
        );
    },
);
