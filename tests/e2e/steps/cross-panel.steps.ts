import { createBdd } from "playwright-bdd";
import { expect, test } from "@playwright/test";
import {
    openTabViaMenu,
    clickTab,
    isTabActive,
} from "../helpers/navigation-helper";

const { When, Then } = createBdd();

// ============= Cross-Panel Tab Independence =============

When("I open Sounds in the right panel", async ({ page }) => {
    await openTabViaMenu(page, "sounds", "right");
    console.log("[UI] Sounds opened in right panel ✓");
});

When("I click the Settings tab in the right panel", async ({ page }) => {
    await clickTab(page, "settings", "right");
    console.log("[UI] Clicked Settings tab in right panel ✓");
});

When("I click the Sounds tab in the right panel", async ({ page }) => {
    await clickTab(page, "sounds", "right");
    console.log("[UI] Clicked Sounds tab in right panel ✓");
});

When("I click the Models tab in the left panel", async ({ page }) => {
    await clickTab(page, "modelList", "left");
    console.log("[UI] Clicked Models tab in left panel ✓");
});

When("I click the Texture Sets tab in the left panel", async ({ page }) => {
    await clickTab(page, "textureSets", "left");
    console.log("[UI] Clicked Texture Sets tab in left panel ✓");
});

Then(
    "the Settings tab should be visible in the right panel",
    async ({ page }) => {
        const tab = page
            .locator(".dock-bar-right")
            .locator(".draggable-tab:has(.pi-cog)")
            .first();
        await expect(tab).toBeVisible({ timeout: 5000 });
        console.log("[UI] Settings tab visible in right panel ✓");
    },
);

Then(
    "the Sounds tab should be visible in the right panel",
    async ({ page }) => {
        const tab = page
            .locator(".dock-bar-right")
            .locator(".draggable-tab:has(.pi-volume-up)")
            .first();
        await expect(tab).toBeVisible({ timeout: 5000 });
        console.log("[UI] Sounds tab visible in right panel ✓");
    },
);

Then(
    "the Settings tab should be active in the right panel",
    async ({ page }) => {
        const active = await isTabActive(page, "settings", "right");
        expect(active).toBe(true);
        console.log("[UI] Settings tab is active in right panel ✓");
    },
);

Then(
    "the Settings tab should still be active in the right panel",
    async ({ page }) => {
        // Small delay to let any potential state changes propagate
        await page.waitForTimeout(300);
        const active = await isTabActive(page, "settings", "right");
        expect(active).toBe(true);
        console.log(
            "[UI] Settings tab is still active in right panel (cross-panel independence) ✓",
        );
    },
);

Then(
    "the Texture Sets tab should still be active in the left panel",
    async ({ page }) => {
        // Small delay to let any potential state changes propagate
        await page.waitForTimeout(300);
        const active = await isTabActive(page, "textureSets", "left");
        expect(active).toBe(true);
        console.log(
            "[UI] Texture Sets tab is still active in left panel (cross-panel independence) ✓",
        );
    },
);

// ── Screenshots ───────────────────────────────────────────────────────
// Note: "I take a screenshot named {string}" step is defined in shared-setup.steps.ts
