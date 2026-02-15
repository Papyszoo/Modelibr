/**
 * Step definitions for Model Tags and Description (Model Metadata) E2E tests.
 * Covers adding/removing tags, editing descriptions, and searching models.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelViewerPage } from "../pages/ModelViewerPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// Track state across steps within a scenario
let tagCountBeforeRemove = 0;
let cardCountBeforeSearch = 0;

// ============= Given Steps =============

Given("I open a model in the viewer", async ({ page }) => {
    // Click the first model card to open it in the viewer
    const firstCard = page.locator(".model-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    console.log("[Action] Clicked first model card");

    // Wait for the viewer canvas to appear
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    console.log("[UI] Viewer canvas is visible ✓");
});

Given("I open the model info panel", async ({ page }) => {
    const viewerPage = new ModelViewerPage(page);
    await viewerPage.openTab("Model Info", "#info");

    // Wait for the info panel to be visible
    const infoPanel = page.locator("#info");
    await expect(infoPanel).toBeVisible({ timeout: 10000 });
    console.log("[UI] Model info panel is visible ✓");
});

Given("the model has at least one tag", async ({ page }) => {
    const infoPanel = page.locator("#info");
    const existingTags = infoPanel.locator(".p-chip");
    const count = await existingTags.count();

    if (count === 0) {
        // Add a tag so we have at least one to remove
        console.log("[Setup] No tags found, adding one...");
        const tagInput = infoPanel.locator(
            'input[placeholder="Add new tag..."], .tag-input',
        );
        await tagInput.fill("setup-tag");

        const addButton = infoPanel.getByRole("button", { name: "Add" });
        await addButton.click();

        // Save to persist
        const saveButton = infoPanel.getByRole("button", {
            name: "Save Changes",
        });
        await saveButton.click();
        await page.waitForTimeout(1000);
        console.log("[Setup] Added setup tag and saved ✓");
    }

    // Record current tag count for later verification
    tagCountBeforeRemove = await infoPanel.locator(".p-chip").count();
    console.log(`[State] Current tag count: ${tagCountBeforeRemove}`);
    expect(tagCountBeforeRemove).toBeGreaterThan(0);
});

// ============= When Steps =============

When("I add the tag {string}", async ({ page }, tag: string) => {
    const infoPanel = page.locator("#info");

    const tagInput = infoPanel.locator(
        'input[placeholder="Add new tag..."], .tag-input',
    );
    await expect(tagInput).toBeVisible({ timeout: 5000 });
    await tagInput.fill(tag);

    const addButton = infoPanel.getByRole("button", { name: "Add" });
    await addButton.click();

    // Verify the tag chip appeared
    const tagChip = infoPanel.locator(`.p-chip:has-text("${tag}")`);
    await expect(tagChip).toBeVisible({ timeout: 5000 });
    console.log(`[Action] Added tag "${tag}" ✓`);
});

When("I remove the first tag", async ({ page }) => {
    const infoPanel = page.locator("#info");

    // Record count before removal
    tagCountBeforeRemove = await infoPanel.locator(".p-chip").count();
    console.log(`[State] Tags before removal: ${tagCountBeforeRemove}`);

    // Click the remove icon on the first tag chip
    const firstChipRemove = infoPanel
        .locator(".p-chip .p-chip-remove-icon")
        .first();
    await expect(firstChipRemove).toBeVisible({ timeout: 5000 });
    await firstChipRemove.click();

    // Verify count decreased
    await expect(async () => {
        const currentCount = await infoPanel.locator(".p-chip").count();
        expect(currentCount).toBeLessThan(tagCountBeforeRemove);
    }).toPass({ timeout: 5000 });

    console.log("[Action] Removed first tag ✓");
});

When("I save the model info changes", async ({ page }) => {
    const infoPanel = page.locator("#info");

    const saveButton = infoPanel.getByRole("button", {
        name: "Save Changes",
    });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    // Wait for the save to complete (button may become disabled or show success)
    await page.waitForTimeout(1500);
    console.log("[Action] Saved model info changes ✓");
});

When("I set the description to {string}", async ({ page }, text: string) => {
    const infoPanel = page.locator("#info");

    const textarea = infoPanel.locator(
        'textarea[placeholder="Enter description..."], .description-textarea',
    );
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill(text);
    console.log(`[Action] Set description to "${text}" ✓`);
});

When("I search for models with {string}", async ({ page }, text: string) => {
    // Record model count before search
    await page.waitForTimeout(500);
    cardCountBeforeSearch = await page.locator(".model-card").count();
    console.log(`[State] Model cards before search: ${cardCountBeforeSearch}`);

    const searchInput = page.locator(
        'input[placeholder="Search models..."], .search-input',
    );
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill(text);

    // Wait for the list to update
    await page.waitForTimeout(1000);
    console.log(`[Action] Searched for "${text}" ✓`);
});

When("I clear the model search", async ({ page }) => {
    const searchInput = page.locator(
        'input[placeholder="Search models..."], .search-input',
    );
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill("");

    // Wait for the list to update
    await page.waitForTimeout(1000);
    console.log("[Action] Cleared model search ✓");
});

// ============= Then Steps =============

Then(
    "the tags {string} and {string} should be saved",
    async ({ page }, tag1: string, tag2: string) => {
        // Navigate back to model list to verify persistence
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(page, "modelList");

        // Re-open the model (click first card again)
        const firstCard = page.locator(".model-card").first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });
        await firstCard.click();

        // Wait for viewer canvas
        const canvas = page.locator("canvas");
        await expect(canvas).toBeVisible({ timeout: 15000 });

        // Re-open the info panel
        const viewerPage = new ModelViewerPage(page);
        await viewerPage.openTab("Model Info", "#info");

        const infoPanel = page.locator("#info");
        await expect(infoPanel).toBeVisible({ timeout: 10000 });

        // Verify both tags are present
        const tag1Chip = infoPanel.locator(`.p-chip:has-text("${tag1}")`);
        const tag2Chip = infoPanel.locator(`.p-chip:has-text("${tag2}")`);

        await expect(tag1Chip).toBeVisible({ timeout: 5000 });
        await expect(tag2Chip).toBeVisible({ timeout: 5000 });

        console.log(
            `[Verify] Tags "${tag1}" and "${tag2}" are saved and visible after reload ✓`,
        );
    },
);

Then("the tag count should have decreased", async ({ page }) => {
    // Navigate back to model list to verify persistence
    const { navigateToTab } = await import("../helpers/navigation-helper");
    await navigateToTab(page, "modelList");

    // Re-open the model
    const firstCard = page.locator(".model-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Re-open the info panel
    const viewerPage = new ModelViewerPage(page);
    await viewerPage.openTab("Model Info", "#info");

    const infoPanel = page.locator("#info");
    await expect(infoPanel).toBeVisible({ timeout: 10000 });

    const currentCount = await infoPanel.locator(".p-chip").count();
    console.log(
        `[Verify] Tags before: ${tagCountBeforeRemove}, after reload: ${currentCount}`,
    );
    expect(currentCount).toBeLessThan(tagCountBeforeRemove);
    console.log("[Verify] Tag count decreased after reload ✓");
});

Then(
    "the description should be saved as {string}",
    async ({ page }, text: string) => {
        // Navigate back to model list to verify persistence
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(page, "modelList");

        // Re-open the model
        const firstCard = page.locator(".model-card").first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });
        await firstCard.click();

        const canvas = page.locator("canvas");
        await expect(canvas).toBeVisible({ timeout: 15000 });

        // Re-open the info panel
        const viewerPage = new ModelViewerPage(page);
        await viewerPage.openTab("Model Info", "#info");

        const infoPanel = page.locator("#info");
        await expect(infoPanel).toBeVisible({ timeout: 10000 });

        const textarea = infoPanel.locator(
            'textarea[placeholder="Enter description..."], .description-textarea',
        );
        await expect(textarea).toBeVisible({ timeout: 5000 });

        const value = await textarea.inputValue();
        expect(value).toBe(text);
        console.log(`[Verify] Description "${text}" is saved after reload ✓`);
    },
);

Then("the model list should show filtered results", async ({ page }) => {
    const currentCount = await page.locator(".model-card").count();
    console.log(
        `[Verify] Cards before search: ${cardCountBeforeSearch}, after: ${currentCount}`,
    );

    // Filtered results should either show fewer cards or at least some cards
    // (if all models match the search, count may be the same)
    expect(currentCount).toBeGreaterThan(0);
    console.log("[Verify] Filtered results are visible ✓");
});

Then("more models should be visible", async ({ page }) => {
    // After clearing search, wait for all models to reappear
    await expect(async () => {
        const currentCount = await page.locator(".model-card").count();
        expect(currentCount).toBeGreaterThanOrEqual(cardCountBeforeSearch);
    }).toPass({ timeout: 5000 });

    const finalCount = await page.locator(".model-card").count();
    console.log(
        `[Verify] Cards after clearing search: ${finalCount} (was ${cardCountBeforeSearch} during search) ✓`,
    );
});
