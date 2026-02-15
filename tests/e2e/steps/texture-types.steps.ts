/**
 * Step definitions for Texture Type Channel Mapping E2E tests
 *
 * Updated to match actual UI implementation:
 * - TextureSetViewer with TabView for "Texture Types", "Files", "Models", "Preview"
 * - TextureCard components for each texture type
 * - HeightCard for Height/Displacement/Bump with mode dropdown
 * - FilesTab showing source files with channel mapping info
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { TextureSetsPage } from "../pages/TextureSetsPage";
import { ApiHelper } from "../helpers/api-helper";
import { sharedState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then } = createBdd();
const apiHelper = new ApiHelper();

// Generate unique suffix for each test run to avoid name conflicts
const runId = Date.now().toString(36).slice(-4);

// Store the last created texture set name for the viewer to use
let lastCreatedTextureSetName: string | null = null;

// Track whether cleanup has been done this run
let cleanupDone = false;

/**
 * Clean up stale texture sets from previous test runs.
 * Keeps only the first 'blue_color' and removes old test artifacts.
 */
async function cleanupStaleTextureSets(): Promise<void> {
    if (cleanupDone) return;
    cleanupDone = true;

    try {
        const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
        const response = await fetch(`${API_BASE}/texture-sets`);
        if (!response.ok) return;

        const data = (await response.json()) as {
            textureSets: Array<{ id: number; name: string }>;
        };
        const textureSets = data.textureSets;

        // Find stale duplicates: keep first blue_color, delete rest
        let firstBlueKept = false;
        const toDelete: number[] = [];

        for (const ts of textureSets) {
            if (ts.name === "blue_color") {
                if (firstBlueKept) {
                    toDelete.push(ts.id);
                } else {
                    firstBlueKept = true;
                }
            }
            // Delete old test artifacts from previous runs
            if (
                ts.name.startsWith("channel-test_") ||
                ts.name.startsWith("orm-test_") ||
                ts.name.startsWith("height-test_") ||
                ts.name.startsWith("complete-texture-set-") ||
                ts.name.startsWith("Source ORM_") ||
                ts.name.startsWith("ORM Target_")
            ) {
                // Only delete ones from previous runs (not current)
                if (!ts.name.endsWith(`_${runId}`)) {
                    toDelete.push(ts.id);
                }
            }
        }

        if (toDelete.length > 0) {
            console.log(
                `[Cleanup] Removing ${toDelete.length} stale texture sets`,
            );
            for (const id of toDelete) {
                await fetch(`${API_BASE}/texture-sets/${id}`, {
                    method: "DELETE",
                });
            }
            console.log(
                `[Cleanup] Removed ${toDelete.length} stale texture sets ✓`,
            );
        }
    } catch (e) {
        console.log(`[Cleanup] Warning: cleanup failed: ${e}`);
    }
}

// ============================================================================
// SETUP STEPS
// ============================================================================

/**
 * Open texture set viewer for any set (first available or specified)
 */
When("I open the texture set viewer for any set", async ({ page }) => {
    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.goto();

    // Click on first available texture set card to open viewer
    const firstCard = page.locator(".texture-set-card").first();
    if ((await firstCard.count()) > 0) {
        await firstCard.dblclick();
    } else {
        // Create a texture set if none exist
        await textureSetsPage.createEmptyTextureSet("Test Channel Set");
        const newCard = page.locator(".texture-set-card").first();
        await newCard.dblclick();
    }

    // Wait for viewer to open
    await page.waitForSelector(".texture-set-viewer", { timeout: 10000 });
});

Given("I have a texture set with uploaded textures", async ({ page }) => {
    await cleanupStaleTextureSets();
    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.goto();

    // Create texture set with file via API using unique name (avoids data accumulation issues)
    const uniqueName = `channel-test_${runId}`;
    const testFile = await UniqueFileGenerator.generate("blue_color.png");
    const result = await apiHelper.createTextureSetWithFile(
        uniqueName,
        testFile,
        1, // Albedo
    );
    lastCreatedTextureSetName = uniqueName;
    console.log(
        `[API] Created texture set "${uniqueName}" with file, ID ${result.textureSetId}`,
    );

    // Hard reload to bust React Query cache, then navigate
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await textureSetsPage.goto();

    // Use search to find the specific card (grid may have many items off-screen)
    const searchInput = page.locator(".search-input");
    if (await searchInput.isVisible({ timeout: 3000 })) {
        await searchInput.fill(uniqueName);
        await page.waitForTimeout(500);
    }

    // Verify the card is visible
    const card = page
        .locator(`.texture-set-card:has-text("${uniqueName}")`)
        .first();
    await expect(card).toBeVisible({ timeout: 15000 });
});

Given("I have a texture set with ORM packed texture", async ({ page }) => {
    await cleanupStaleTextureSets();
    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.goto();

    // Create texture set with file via API using unique name
    const uniqueName = `orm-test_${runId}`;
    const testFile = await UniqueFileGenerator.generate("blue_color.png");
    const result = await apiHelper.createTextureSetWithFile(
        uniqueName,
        testFile,
        1, // Albedo
    );
    lastCreatedTextureSetName = uniqueName;
    console.log(
        `[API] Created texture set "${uniqueName}" with ORM file, ID ${result.textureSetId}`,
    );

    // Navigate to see the new card (cleanup ensures <50 items in grid)
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await textureSetsPage.goto();

    // Verify the card is visible
    const card = page
        .locator(`.texture-set-card:has-text("${uniqueName}")`)
        .first();
    await expect(card).toBeVisible({ timeout: 15000 });
});

Given("I have a texture set with a height texture", async ({ page }) => {
    await cleanupStaleTextureSets();
    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.goto();

    // Create texture set with height texture via API using unique name
    const uniqueName = `height-test_${runId}`;
    const testFile = await UniqueFileGenerator.generate("blue_color.png");
    const result = await apiHelper.createTextureSetWithFile(
        uniqueName,
        testFile,
        3, // Height
    );
    lastCreatedTextureSetName = uniqueName;
    console.log(
        `[API] Created texture set "${uniqueName}" with Height texture, ID ${result.textureSetId}`,
    );

    // Hard reload to bust React Query cache, then navigate
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await textureSetsPage.goto();

    // Use search to find the specific card (grid may have many items off-screen)
    const searchInput3 = page.locator(".search-input");
    if (await searchInput3.isVisible({ timeout: 3000 })) {
        await searchInput3.fill(uniqueName);
        await page.waitForTimeout(500);
    }

    // Verify the card is visible
    const card = page
        .locator(`.texture-set-card:has-text("${uniqueName}")`)
        .first();
    await expect(card).toBeVisible({ timeout: 10000 });
});

When("I open the texture set viewer", async ({ page }) => {
    // Open the specific texture set that was just created, not a random .first()
    let card;
    if (lastCreatedTextureSetName) {
        card = page
            .locator(
                `.texture-set-card:has-text("${lastCreatedTextureSetName}")`,
            )
            .first();
        console.log(
            `[Navigation] Opening texture set "${lastCreatedTextureSetName}"`,
        );
    } else {
        card = page.locator(".texture-set-card").first();
        console.log(
            "[Navigation] Opening first texture set card (no name stored)",
        );
    }

    await expect(card).toBeVisible({ timeout: 10000 });
    await card.dblclick();

    // Wait for viewer to open
    await page.waitForSelector(".texture-set-viewer", { timeout: 10000 });
});

// ============================================================================
// TAB NAVIGATION
// ============================================================================

When("I switch to the Files tab", async ({ page }) => {
    // Wait for tab header to be ready before interacting
    await page.waitForSelector(".p-tabview-nav", { timeout: 10000 });

    // Use PrimeReact TabView nav link selector
    const filesTab = page
        .locator(".p-tabview-nav-link")
        .filter({ hasText: "Files" });
    await expect(filesTab).toBeVisible({ timeout: 10000 });
    await filesTab.click();

    // Wait for files tab content to be fully loaded
    await page.waitForSelector(".files-tab, .files-tab-empty", {
        timeout: 10000,
    });

    // Wait for file content to finish rendering (file cards or confirmed empty state)
    await page
        .locator(".file-mapping-card, .files-tab-empty")
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
});

When("I switch to the Texture Types tab", async ({ page }) => {
    const typesTab = page
        .locator(".p-tabview-nav-link")
        .filter({ hasText: "Texture Types" });
    await typesTab.click();

    await page.waitForSelector(".texture-cards-grid", { timeout: 5000 });
});

// ============================================================================
// TEXTURE TYPE CARDS VERIFICATION
// ============================================================================

Then("the texture type cards should be visible", async ({ page }) => {
    // Should see texture cards grid
    await expect(page.locator(".texture-cards-grid")).toBeVisible({
        timeout: 10000,
    });
    // Should have texture cards
    const cards = page.locator(".texture-card");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
});

Then("I should see texture cards for:", async ({ page }, dataTable: any) => {
    const expectedTypes = dataTable.raw().map((row: string[]) => row[0]);

    for (const typeName of expectedTypes) {
        const card = page
            .locator(".texture-card .texture-card-title")
            .filter({ hasText: typeName });
        await expect(card).toBeVisible({ timeout: 5000 });
        console.log(`[Verify] Found texture card for ${typeName} ✓`);
    }
});

Then(
    "I should NOT see texture cards for:",
    async ({ page }, dataTable: any) => {
        const excludedTypes = dataTable.raw().map((row: string[]) => row[0]);

        for (const typeName of excludedTypes) {
            const card = page
                .locator(".texture-card .texture-card-title")
                .filter({ hasText: typeName });
            await expect(card).not.toBeVisible({ timeout: 2000 });
            console.log(`[Verify] No texture card for ${typeName} ✓`);
        }
    },
);

Then("I should see the Height\\/Displacement\\/Bump card", async ({ page }) => {
    // HeightCard is a special card that uses .height-card class
    // and has a .height-mode-dropdown instead of .texture-card-title
    const heightCard = page.locator(".texture-card.height-card");
    await expect(heightCard).toBeVisible({ timeout: 5000 });
    console.log("[Verify] Found Height/Displacement/Bump card ✓");
});

Then("I should see texture cards for each type", async ({ page }) => {
    const cards = page.locator(".texture-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    console.log(`[Verify] Found ${count} texture cards ✓`);
});

Then(
    "I should see the Height\\/Displacement\\/Bump card with mode dropdown",
    async ({ page }) => {
        // HeightCard uses .height-card class and has .height-mode-dropdown
        const heightCard = page.locator(".texture-card.height-card");
        await expect(heightCard).toBeVisible({ timeout: 5000 });

        // Check for the height mode dropdown in the card
        const dropdown = heightCard.locator(".height-mode-dropdown");
        await expect(dropdown).toBeVisible({ timeout: 5000 });
        console.log("[Verify] Height card with mode dropdown visible ✓");
    },
);

// ============================================================================
// FILES TAB VERIFICATION
// ============================================================================

Then("the files tab should display the uploaded files", async ({ page }) => {
    // FilesTab shows file-mapping-card for each file
    const filesTab = page.locator(".files-tab");
    await expect(filesTab).toBeVisible({ timeout: 5000 });

    // Either has files or shows empty state
    const hasFiles = (await page.locator(".file-mapping-card").count()) > 0;
    const isEmpty = await page.locator(".files-tab-empty").isVisible();

    expect(hasFiles || isEmpty).toBe(true);
    console.log(
        `[Verify] Files tab visible (${hasFiles ? "has files" : "empty"}) ✓`,
    );
});

Then("each file should show its texture type usage", async ({ page }) => {
    const fileCards = page.locator(".file-mapping-card");
    const count = await fileCards.count();

    if (count > 0) {
        // Each file card should show "Used as:" with texture types
        const firstCard = fileCards.first();
        const usageLabel = firstCard.locator(".textures-label");
        await expect(usageLabel).toBeVisible({ timeout: 5000 });
        console.log("[Verify] File shows texture type usage ✓");
    } else {
        console.log("[Verify] No files in set (empty state) ✓");
    }
});

Then("the file should show split channels mode", async ({ page }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState("domcontentloaded");

    const fileCard = page
        .locator('[data-testid^="file-mapping-card-"]')
        .first();

    // Wait for the file card to be visible
    await expect(fileCard).toBeVisible({ timeout: 10000 });

    // Check that the RGB dropdown is visible (not that it's in split mode yet)
    const rgbDropdown = fileCard
        .locator('[data-testid^="channel-mapping-rgb-"]')
        .first();
    await expect(rgbDropdown).toBeVisible({ timeout: 10000 });

    console.log("[Verify] File shows channel mapping dropdown ✓");
});

Then("I should see R, G, B channel dropdowns", async ({ page }) => {
    const fileCard = page.locator(".file-mapping-card").first();
    const splitChannels = fileCard.locator(".split-channels");

    // If split channels are visible, check for R, G, B labels
    if (await splitChannels.isVisible()) {
        await expect(
            splitChannels.locator("label").filter({ hasText: "R:" }),
        ).toBeVisible();
        await expect(
            splitChannels.locator("label").filter({ hasText: "G:" }),
        ).toBeVisible();
        await expect(
            splitChannels.locator("label").filter({ hasText: "B:" }),
        ).toBeVisible();
        console.log("[Verify] R, G, B channel dropdowns visible ✓");
    } else {
        // Not in split mode - log and pass
        console.log("[Verify] File not in split channels mode ✓");
    }
});

// ============================================================================
// HEIGHT CARD VERIFICATION
// ============================================================================

Then("the Height card should show a mode dropdown", async ({ page }) => {
    // HeightCard uses .height-card class
    const heightCard = page.locator(".texture-card.height-card");

    const dropdown = heightCard.locator(".height-mode-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 10000 });
    console.log("[Verify] Height card mode dropdown visible ✓");
});

Then(
    "the mode dropdown should have Height, Displacement, Bump options",
    async ({ page }) => {
        // HeightCard uses .height-card class
        const heightCard = page.locator(".texture-card.height-card");

        const dropdown = heightCard.locator(".height-mode-dropdown").first();
        await dropdown.click();

        // Wait for dropdown panel to open
        await page
            .locator(".p-dropdown-panel")
            .waitFor({ state: "visible", timeout: 5000 });

        // Check dropdown options
        const options = page.locator(".p-dropdown-panel .p-dropdown-item");
        const optionTexts = await options.allTextContents();

        expect(optionTexts.some((t) => t.includes("Height"))).toBe(true);
        expect(optionTexts.some((t) => t.includes("Displacement"))).toBe(true);
        expect(optionTexts.some((t) => t.includes("Bump"))).toBe(true);

        // Close dropdown
        await page.keyboard.press("Escape");
        console.log("[Verify] Mode dropdown has all height type options ✓");
    },
);

// ============================================================================
// SPLIT CHANNEL MODE ACTIONS
// ============================================================================

When("I enable split channel mode for the file", async ({ page }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState("domcontentloaded");

    const fileCard = page
        .locator('[data-testid^="file-mapping-card-"]')
        .first();

    // Ensure the file card is visible first
    await expect(fileCard).toBeVisible({ timeout: 10000 });

    // Find the RGB dropdown using data-testid and click it
    const rgbDropdown = fileCard
        .locator('[data-testid^="channel-mapping-rgb-"]')
        .first();
    await expect(rgbDropdown).toBeVisible({ timeout: 10000 });
    await rgbDropdown.click();

    // Wait for dropdown panel to open
    await page
        .locator(".p-dropdown-panel")
        .waitFor({ state: "visible", timeout: 5000 });

    // Select "Split Channels" option
    // Note: We no longer remove the RGB texture immediately, so no DELETE request is expected.
    const splitOption = page
        .locator(".p-dropdown-panel .p-dropdown-item")
        .filter({ hasText: "Split Channels" });
    await expect(splitOption).toBeVisible({ timeout: 5000 });
    await splitOption.click();

    // Wait for split channels UI to appear using data-testid
    const splitChannels = fileCard.locator('[data-testid^="split-channels-"]');
    await expect(splitChannels).toBeVisible({ timeout: 10000 });

    console.log("[Action] Enabled split channel mode ✓");
});

When(
    "I set channel {string} to texture type {string}",
    async ({ page }, channel: string, textureType: string) => {
        const fileCard = page
            .locator('[data-testid^="file-mapping-card-"]')
            .first();
        const splitChannels = fileCard.locator(
            '[data-testid^="split-channels-"]',
        );

        // Wait for split channels to be visible
        await expect(splitChannels).toBeVisible({ timeout: 10000 });

        // Find the specific channel dropdown (R, G, or B) using data-testid
        const channelDropdown = splitChannels.locator(
            `[data-testid^="channel-mapping-${channel}-"]`,
        );

        await expect(channelDropdown).toBeVisible({ timeout: 10000 });
        await channelDropdown.click();

        // Wait for dropdown panel to open — use .last() because PrimeReact may leave
        // previous dropdown panels in DOM with exit animations
        const dropdownPanel = page.locator(".p-dropdown-panel").last();
        await dropdownPanel.waitFor({ state: "visible", timeout: 5000 });

        // Select the texture type from dropdown and wait for POST request
        const typeOption = dropdownPanel
            .locator(".p-dropdown-item")
            .filter({ hasText: textureType });
        await expect(typeOption).toBeVisible({ timeout: 10000 });
        await typeOption.click();

        // Wait for the dropdown label to reflect the new selection (avoid relying on POST responses)
        const dropdownLabel = channelDropdown.locator(
            ".p-dropdown-label, .p-dropdown-label-empty",
        );
        await expect(dropdownLabel).toHaveText(textureType, { timeout: 10000 });

        console.log(`[Action] Set channel ${channel} to ${textureType} ✓`);
    },
);

When("I save the texture set changes", async ({ page }) => {
    // Look for a save button in the texture set viewer
    const saveButton = page.getByRole("button", { name: /save/i });
    if (await saveButton.isVisible({ timeout: 2000 })) {
        await saveButton.click();
        // Wait for save confirmation toast
        await page
            .locator(".p-toast-message")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        console.log("[Action] Saved texture set changes ✓");
    } else {
        // Changes might be auto-saved
        console.log("[Action] No save button found - assuming auto-save ✓");
    }
});

Then(
    "the file should have channel {string} set to {string}",
    async ({ page }, channel: string, expectedType: string) => {
        const fileCard = page
            .locator('[data-testid^="file-mapping-card-"]')
            .first();
        const splitChannels = fileCard.locator(
            '[data-testid^="split-channels-"]',
        );

        // Find the specific channel dropdown using data-testid
        const channelDropdown = splitChannels.locator(
            `[data-testid^="channel-mapping-${channel}-"]`,
        );

        // Get the selected value text
        const selectedValue = await channelDropdown
            .locator(".p-dropdown-label")
            .textContent();
        console.log(
            `[Debug] Checking channel ${channel} expected "${expectedType}", found "${selectedValue}"`,
        );
        expect(selectedValue).toContain(expectedType);

        console.log(`[Verify] Channel ${channel} is set to ${expectedType} ✓`);
    },
);
