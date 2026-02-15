import { createBdd } from "playwright-bdd";
import { expect, test } from "@playwright/test";
import { sharedState } from "../fixtures/shared-state";
import {
    openTabViaMenu,
    clickTab,
    countTabsByType,
    closeTabByTooltip,
    closeTabByType,
    isTabActive,
} from "../helpers/navigation-helper";

const { Given, When, Then } = createBdd();

// ============= Tab State Management =============

When(
    "I click on the model {string} to open it",
    async ({ page }, modelName: string) => {
        const modelData =
            sharedState.getModel(modelName) ||
            sharedState.getModel(modelName + ".glb") ||
            sharedState.getModel(modelName + ".fbx");
        if (!modelData) {
            throw new Error(`Model "${modelName}" not found in shared state`);
        }

        // Find and double-click on the model in the grid
        const clickTarget = page.locator(`text="${modelData.name}"`).first();
        if (await clickTarget.isVisible({ timeout: 5000 })) {
            await clickTarget.dblclick();
        } else {
            // Fall back to model card locator
            const modelCard = page
                .locator(
                    `.model-card, .model-grid-item, [data-model-name="${modelName}"]`,
                )
                .first();
            await modelCard.dblclick();
        }

        // Wait for model viewer to load
        await page.waitForSelector(
            ".model-viewer, .viewer-canvas, .viewer-controls",
            {
                state: "visible",
                timeout: 10000,
            },
        );
        console.log(`[UI] Opened model "${modelName}" ✓`);
    },
);

Then(
    "a model viewer tab should be visible in the dock bar",
    async ({ page }) => {
        const count = await countTabsByType(page, "modelViewer");
        expect(count).toBeGreaterThanOrEqual(1);
        console.log("[UI] Model viewer tab visible in dock bar ✓");
    },
);

Then("the Texture Sets content should be visible", async ({ page }) => {
    // After page refresh the globally-active tab may be in the right panel,
    // so the left panel falls back to its first tab (model list).  Click the
    // Texture Sets tab first to make sure it is the active left-panel tab.
    const textureSetsTab = page
        .locator(".dock-bar-left")
        .locator(".draggable-tab:has(.pi-folder)")
        .first();
    if (await textureSetsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textureSetsTab.click();
    }

    // Look for either the texture set list or the empty state message
    const textureSetsContent = page.locator(".texture-set-list");
    const emptyState = page.getByText("No texture sets found");
    const noTextureSets = page.getByText("No Texture Sets");
    await expect(
        textureSetsContent.or(emptyState).or(noTextureSets).first(),
    ).toBeVisible({ timeout: 5000 });
    console.log("[UI] Texture Sets content visible ✓");
});

Then(
    "a Texture Sets tab should be visible in the dock bar",
    async ({ page }) => {
        const count = await countTabsByType(page, "textureSets");
        expect(count).toBeGreaterThanOrEqual(1);
        console.log("[UI] Texture Sets tab visible in dock bar ✓");
    },
);

Then("a Settings tab should be visible in the dock bar", async ({ page }) => {
    const count = await countTabsByType(page, "settings");
    expect(count).toBeGreaterThanOrEqual(1);
    console.log("[UI] Settings tab visible in dock bar ✓");
});

When("I refresh the page", async ({ page }) => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".p-splitter", {
        state: "visible",
        timeout: 15000,
    });
    console.log("[UI] Page refreshed ✓");
});

When("I open Settings in the right panel", async ({ page }) => {
    await openTabViaMenu(page, "settings", "right");

    // Wait for settings panel content
    await page
        .locator('text="Application Settings"')
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {
            /* settings content may vary */
        });
    console.log("[UI] Settings opened in right panel ✓");
});

When("I open the Texture Sets tab in the left panel", async ({ page }) => {
    // Check if already open — just click it
    const existingTab = page
        .locator(".dock-bar-left")
        .locator(".draggable-tab:has(.pi-folder)");
    if (await existingTab.isVisible({ timeout: 1000 }).catch(() => false)) {
        await existingTab.click();
        await expect(existingTab).toHaveClass(/active/, { timeout: 3000 });
        console.log("[UI] Switched to existing Texture Sets tab ✓");
        return;
    }

    // Otherwise add it via menu
    await openTabViaMenu(page, "textureSets", "left");
    console.log("[UI] Opened Texture Sets tab ✓");
});

// ============= Tab Deduplication =============

When("I go back to the model list", async ({ page }) => {
    await clickTab(page, "modelList", "left");
    console.log("[UI] Went back to model list ✓");
});

When(
    "I click on the model {string} to open it again",
    async ({ page }, modelName: string) => {
        const modelData = sharedState.getModel(modelName);
        if (!modelData) {
            throw new Error(`Model "${modelName}" not found in shared state`);
        }

        const clickTarget = page.locator(`text="${modelData.name}"`).first();
        await clickTarget.dblclick();
        await page.waitForSelector(
            ".model-viewer, .viewer-canvas, .viewer-controls",
            { state: "visible", timeout: 10000 },
        );
        console.log(`[UI] Clicked on model "${modelName}" again ✓`);
    },
);

Then(
    "there should be exactly {int} model viewer tab visible",
    async ({ page }, expectedCount: number) => {
        const count = await countTabsByType(page, "modelViewer");
        expect(count).toBe(expectedCount);
        console.log(
            `[UI] Found ${count} model viewer tab(s) (expected ${expectedCount}) ✓`,
        );
    },
);

Then(
    "there should be exactly {int} Texture Sets tab visible",
    async ({ page }, expectedCount: number) => {
        const count = await countTabsByType(page, "textureSets");
        expect(count).toBe(expectedCount);
        console.log(
            `[UI] Found ${count} Texture Sets tab(s) (expected ${expectedCount}) ✓`,
        );
    },
);

// ============= Multi-Tab / Tab Switching =============

When("I switch back to the Models tab", async ({ page }) => {
    await clickTab(page, "modelList");
    const modelsTab = page
        .locator(".draggable-tab.active:has(.pi-list)")
        .first();
    await expect(modelsTab).toBeVisible({ timeout: 3000 });
    console.log("[UI] Switched to Models tab ✓");
});

When("I switch to {string} tab", async ({ page }, tabName: string) => {
    const tab = page
        .locator(`.draggable-tab[data-pr-tooltip*="${tabName}"]`)
        .first();
    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tab.click();
        await expect(tab).toHaveClass(/active/, { timeout: 3000 });
    }
    console.log(`[UI] Switched to "${tabName}" tab ✓`);
});

// ============= Close Tab =============

When("I close the Settings tab", async ({ page }) => {
    await closeTabByType(page, "settings");
    console.log("[UI] Closed Settings tab ✓");
});

When("I close the {string} tab", async ({ page }, modelName: string) => {
    const modelData = sharedState.getModel(modelName);
    const tooltipText = modelData ? modelData.name : modelName;
    await closeTabByTooltip(page, tooltipText);
    console.log(`[UI] Closed "${modelName}" tab ✓`);
});

// ============= Visibility Assertions =============

Then("the Settings tab should still be visible", async ({ page }) => {
    const count = await countTabsByType(page, "settings");
    expect(count).toBeGreaterThanOrEqual(1);
    console.log("[UI] Settings tab still visible ✓");
});

Then(
    "the model viewer should be visible in the right panel",
    async ({ page }) => {
        const rightPanel = page.locator(".p-splitter-panel").nth(1);
        const viewerCanvas = rightPanel.locator(".viewer-canvas canvas");
        await expect(viewerCanvas).toBeVisible({ timeout: 10000 });
        console.log("[UI] Model viewer visible in right panel ✓");
    },
);

Then(
    "the model viewer should be visible in the left panel",
    async ({ page }) => {
        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        const viewerCanvas = leftPanel.locator(".viewer-canvas canvas");
        await expect(viewerCanvas).toBeVisible({ timeout: 10000 });
        console.log("[UI] Model viewer visible in left panel ✓");
    },
);

Then(
    "the Models tab should still exist in the left panel",
    async ({ page }) => {
        const count = await countTabsByType(page, "modelList", "left");
        expect(count).toBeGreaterThanOrEqual(1);
        console.log("[UI] Models tab exists in left panel ✓");
    },
);

Then(
    "the Texture Sets tab should be active in the left panel",
    async ({ page }) => {
        const active = await isTabActive(page, "textureSets", "left");
        expect(active).toBe(true);
        console.log("[UI] Texture Sets tab is active ✓");
    },
);

// ============= Screenshot Steps =============

Then("I take a screenshot of the dock with model tab", async ({ page }) => {
    const screenshot = await page.screenshot({
        path: "test-results/dock-model-tab.png",
    });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach("Dock With Model Tab", {
            body: screenshot,
            contentType: "image/png",
        });
    }
    console.log("[Screenshot] Captured: Dock With Model Tab");
});

Then("I take a screenshot of the dual panel view", async ({ page }) => {
    await expect(page.locator(".p-splitter-panel").first()).toBeVisible({
        timeout: 5000,
    });
    const screenshot = await page.screenshot({
        path: "test-results/dual-panel-view.png",
    });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach("Dual Panel View", {
            body: screenshot,
            contentType: "image/png",
        });
    }
    console.log("[Screenshot] Captured: Dual Panel View");
});

Then("I take a screenshot of the persisted tabs", async ({ page }) => {
    const screenshot = await page.screenshot({
        path: "test-results/persisted-tabs.png",
    });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach("Persisted Tabs", {
            body: screenshot,
            contentType: "image/png",
        });
    }
    console.log("[Screenshot] Captured: Persisted Tabs");
});
