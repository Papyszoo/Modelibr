import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelViewerPage } from "../pages/ModelViewerPage";

const { Given, When, Then } = createBdd();

When("I add a new preset {string}", async ({ page }, presetName: string) => {
    const viewer = new ModelViewerPage(page);
    await viewer.addPreset(presetName);
});

When("I select preset {string}", async ({ page }, presetName: string) => {
    const viewer = new ModelViewerPage(page);
    await viewer.selectPreset(presetName);
});

When(
    "I link texture set {string} to the current preset via UI",
    async ({ page }, setName: string) => {
        const viewer = new ModelViewerPage(page);
        await viewer.linkTextureSetToModel(setName);
    },
);

When("I set the current preset as main", async ({ page }) => {
    const viewer = new ModelViewerPage(page);
    await viewer.setAsMainPreset();
});

Then(
    "the preset {string} should be selected",
    async ({ page }, presetName: string) => {
        const viewer = new ModelViewerPage(page);
        await viewer.openTab("Materials", '[data-testid="materials-panel"]');

        // The dropdown should show the specified preset name
        const dropdown = page.locator('[data-testid="variant-dropdown"]');
        await expect(dropdown).toBeVisible({ timeout: 5000 });

        // PrimeReact dropdown shows selected value in .p-dropdown-label
        const label = dropdown.locator(".p-dropdown-label");
        await expect(label).toHaveText(presetName, { timeout: 5000 });
    },
);

Then('the current preset should show the "Main" badge', async ({ page }) => {
    const viewer = new ModelViewerPage(page);
    await viewer.expectMainBadgeVisible();
});

Then(
    "the texture set {string} should be linked in materials",
    async ({ page }, textureSetName: string) => {
        const viewer = new ModelViewerPage(page);
        await viewer.openTab("Materials", '[data-testid="materials-panel"]');

        // Wait for the material item with this texture set to appear (with retry for data refetch)
        const item = page.locator(
            `.materials-item[data-texture-set*="${textureSetName}"]`,
        );
        await expect(item.first()).toBeVisible({ timeout: 15000 });
    },
);

Then(
    "the texture set {string} should not be linked in materials",
    async ({ page }, textureSetName: string) => {
        const viewer = new ModelViewerPage(page);
        await viewer.openTab("Materials", '[data-testid="materials-panel"]');

        // Verify no material item references this texture set
        const item = page.locator(
            `.materials-item[data-texture-set*="${textureSetName}"]`,
        );
        await expect(item).toHaveCount(0, { timeout: 5000 });
    },
);

Then(
    "the preset dropdown should not contain invalid entries",
    async ({ page }) => {
        const viewer = new ModelViewerPage(page);
        await viewer.openTab("Materials", '[data-testid="materials-panel"]');

        // Open the dropdown to see all options
        const dropdown = page.locator('[data-testid="variant-dropdown"]');
        await dropdown.click();

        // Check that no option contains [object Object]
        const invalidOption = page.locator(".p-dropdown-item", {
            hasText: "[object Object]",
        });
        await expect(invalidOption).toHaveCount(0, { timeout: 3000 });

        // Close the dropdown
        await dropdown.click();
    },
);
