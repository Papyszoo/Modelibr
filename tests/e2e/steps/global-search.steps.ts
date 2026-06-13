import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";

const { When, Then } = createBdd();

When("I open the global search palette", async ({ page }) => {
    // Ctrl+K is the documented global shortcut; Meta+K covers macOS.
    await page.keyboard.press("Control+K");
    await page.waitForSelector('[data-testid="search-palette-input"]', {
        state: "visible",
        timeout: 5000,
    });
});

When(
    "I search the palette for {string}",
    async ({ page }, term: string) => {
        // Resolve to the real seeded name (setup may suffix .glb/.fbx).
        const model =
            getScenarioState(page).getModel(term) ||
            getScenarioState(page).getModel(term + ".glb") ||
            getScenarioState(page).getModel(term + ".fbx");
        const query = model?.name ?? term;

        await page.fill('[data-testid="search-palette-input"]', query);
        await page.waitForSelector('[data-testid="search-palette-result"]', {
            state: "visible",
            timeout: 5000,
        });
    },
);

When("I open the first palette result", async ({ page }) => {
    await page
        .locator('[data-testid="search-palette-result"]')
        .first()
        .click();
    // Palette closes on selection.
    await expect(
        page.locator('[data-testid="search-palette-input"]'),
    ).toHaveCount(0);
});
