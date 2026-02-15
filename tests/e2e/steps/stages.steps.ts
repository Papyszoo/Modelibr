/**
 * Step definitions for Stage CRUD E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { StageListPage } from "../pages/StageListPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// ============= Navigation Steps =============

Given("I am on the stages page", async ({ page }) => {
    console.log("[Stages] Navigating to stages page...");
    const stageListPage = new StageListPage(page);
    await stageListPage.navigateToStageList();
    await stageListPage.waitForLoaded();
    console.log("[Stages] Stages page loaded successfully");
});

// ============= Create Steps =============

When("I create a stage named {string}", async ({ page }, name: string) => {
    console.log(`[Stages] Creating stage "${name}"...`);

    // Note: Stage DELETE API is not implemented (405), so we can't clean up duplicates.
    // We use a unique name with timestamp to avoid conflicts with previous test runs.
    const uniqueName = `${name}-${Date.now()}`;
    const stageListPage = new StageListPage(page);
    await stageListPage.createStage(uniqueName);
    console.log(`[Stages] Stage "${uniqueName}" creation dialog completed`);

    // Store the unique name for later verification
    (page as any).__lastCreatedStageName = uniqueName;
});

// ============= Provision Steps =============

Given("a stage named {string} exists", async ({ page }, name: string) => {
    console.log(`[Stages] Ensuring stage "${name}" exists...`);

    // Check if the stage already exists via the stages page
    const stageListPage = new StageListPage(page);
    const isVisible = await stageListPage.isStageVisible(name);

    if (isVisible) {
        console.log(`[Stages] Stage "${name}" already visible in the list`);
        return;
    }

    // Not visible — create via API
    console.log(`[Stages] Stage "${name}" not found, creating via API...`);
    const response = await page.request.post(`${API_BASE}/stages`, {
        data: {
            name,
            configurationJson: '{"lights":[],"components":[]}',
        },
    });

    if (!response.ok()) {
        throw new Error(
            `Failed to auto-provision stage "${name}": ${response.status()} ${await response.text()}`,
        );
    }

    console.log(
        `[Stages] Stage "${name}" created via API (status: ${response.status()})`,
    );

    // Reload the stages page to reflect the new stage
    await stageListPage.navigateToStageList();
    await stageListPage.waitForLoaded();

    // Verify the stage is now visible
    await expect(
        page.locator(".stage-card").filter({
            has: page.locator(".stage-card-name", { hasText: name }),
        }),
    ).toBeVisible({ timeout: 10000 });

    console.log(
        `[Stages] Stage "${name}" confirmed visible after provisioning`,
    );
});

// ============= Search Steps =============

When("I search for {string}", async ({ page }, text: string) => {
    console.log(`[Stages] Searching for "${text}"...`);
    const stageListPage = new StageListPage(page);
    await stageListPage.search(text);
    // Allow time for filtering to apply
    await page.waitForTimeout(500);
    console.log(`[Stages] Search for "${text}" applied`);
});

When("I clear the search", async ({ page }) => {
    console.log("[Stages] Clearing search...");
    const stageListPage = new StageListPage(page);
    await stageListPage.clearSearch();
    // Allow time for filtering to reset
    await page.waitForTimeout(500);
    console.log("[Stages] Search cleared");
});

// ============= Click Steps =============

When("I click on the stage {string}", async ({ page }, name: string) => {
    console.log(`[Stages] Clicking on stage "${name}"...`);
    const stageListPage = new StageListPage(page);
    await stageListPage.clickStage(name);
    console.log(`[Stages] Clicked on stage "${name}"`);
});

// ============= Assertion Steps =============

Then(
    "the stage {string} should be visible in the list",
    async ({ page }, name: string) => {
        // If a unique name was stored (from create step), use that instead
        const actualName = (page as any).__lastCreatedStageName || name;
        console.log(`[Stages] Verifying stage "${actualName}" is visible...`);
        const card = page
            .locator(".stage-card")
            .filter({
                has: page.locator(".stage-card-name", {
                    hasText: actualName,
                }),
            })
            .first();
        await expect(card).toBeVisible({ timeout: 10000 });
        console.log(`[Stages] Stage "${actualName}" is visible in the list`);
    },
);

Then("a success toast should appear", async ({ page }) => {
    console.log("[Stages] Waiting for success toast...");
    const toast = page.locator(".p-toast-message");
    await expect(toast).toBeVisible({ timeout: 5000 });
    const text = await toast.textContent();
    console.log(`[Stages] Toast appeared: "${text}"`);
});

Then("no stages should be visible", async ({ page }) => {
    console.log("[Stages] Verifying no stages are visible...");
    const stageListPage = new StageListPage(page);
    const count = await stageListPage.getStageCount();
    expect(count).toBe(0);
    console.log("[Stages] Confirmed: no stages visible");
});

Then("the stage editor should be visible", async ({ page }) => {
    console.log("[Stages] Verifying stage editor is visible...");
    const editor = page.locator("canvas, .scene-editor-container");
    await expect(editor.first()).toBeVisible({ timeout: 15000 });
    console.log("[Stages] Stage editor is visible");
});

Then("the empty state should be visible", async ({ page }) => {
    console.log("[Stages] Verifying empty state is visible...");
    const stageListPage = new StageListPage(page);
    // When stages exist but search filters to 0, only stage cards disappear
    // (the `.stage-grid-empty` element only shows when DB has 0 stages total)
    const count = await stageListPage.getStageCount();
    expect(count).toBe(0);
    console.log("[Stages] Empty state confirmed visible (0 stage cards)");
});
