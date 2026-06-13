import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";

import { ApiHelper } from "../helpers/api-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { waitForCountLabelStable } from "../helpers/list-toolbar-helper";
import { TextureSetsPage } from "../pages/TextureSetsPage";

const { When, Then } = createBdd();

const apiHelper = new ApiHelper();
const runId = Date.now().toString(36).slice(-4);

// Self-contained tracking so this scenario doesn't depend on another step
// file's module state.
const taggedSets: Record<string, { id: number; name: string }> = {};

When(
    "I create a universal texture set {string} for tagging",
    async ({ page }, baseName: string) => {
        const name = `${baseName}_${runId}`;
        const testFile = await UniqueFileGenerator.generate("red_color.png");
        const result = await apiHelper.createTextureSetWithFileAndKind(
            name,
            testFile,
            1, // Albedo
            1, // Universal
        );
        taggedSets[baseName] = { id: result.textureSetId, name };

        await page.reload();
        const textureSetsPage = new TextureSetsPage(page);
        await textureSetsPage.waitForList();
        await textureSetsPage.selectKindTab("Global Materials");
    },
);

When(
    "I tag the texture set {string} with {string}",
    async ({ page }, baseName: string, tag: string) => {
        const set = taggedSets[baseName];
        if (!set) {
            throw new Error(`Texture set "${baseName}" not tracked.`);
        }
        await apiHelper.updateTextureSetTags(set.id, [tag]);

        // Reflect the new tag (and the freshly-populated vocabulary) in the UI.
        await page.reload();
        const textureSetsPage = new TextureSetsPage(page);
        await textureSetsPage.waitForList();
        await textureSetsPage.selectKindTab("Global Materials");
    },
);

When(
    "I filter the texture set grid by tag {string}",
    async ({ page }, tag: string) => {
        const textureSetsPage = new TextureSetsPage(page);
        await textureSetsPage.openFiltersPanel();

        const tagFilter = page.locator(
            '#texture-set-grid-filters-panel [data-testid="texture-set-tag-filter"]',
        );
        await tagFilter.waitFor({ state: "visible", timeout: 15000 });

        const panel = page.locator(".p-multiselect-panel");
        await expect(async () => {
            if (!(await panel.isVisible())) {
                await tagFilter.click();
            }
            await expect(
                panel.locator(`.p-multiselect-item:has-text("${tag}")`),
            ).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: 20000 });

        await panel
            .locator(`.p-multiselect-item:has-text("${tag}")`)
            .first()
            .click();
        // Close the panel and let the filtered fetch settle.
        await page.keyboard.press("Escape");
        await waitForCountLabelStable(page);
    },
);

Then(
    "the tagged texture set {string} should be visible in the grid",
    async ({ page }, baseName: string) => {
        const set = taggedSets[baseName];
        if (!set) {
            throw new Error(`Texture set "${baseName}" not tracked.`);
        }
        const textureSetsPage = new TextureSetsPage(page);
        await expect(textureSetsPage.getCardByName(set.name)).toBeVisible({
            timeout: 10000,
        });
    },
);

Then(
    "the tagged texture set {string} should not be visible in the grid",
    async ({ page }, baseName: string) => {
        const set = taggedSets[baseName];
        if (!set) {
            throw new Error(`Texture set "${baseName}" not tracked.`);
        }
        const textureSetsPage = new TextureSetsPage(page);
        await expect(textureSetsPage.getCardByName(set.name)).toHaveCount(0);
    },
);
