import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { ApiHelper } from "../helpers/api-helper";
import {
    categoryTreeRow,
    clickCategoryInTree,
    createCategoryViaTree,
    deleteCategoryViaTree,
    renameCategoryViaTree,
} from "../helpers/category-tree-helper";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import { waitForModelViewerCanvas } from "../helpers/viewer-canvas";

const { Given, When, Then } = createBdd();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiHelper = new ApiHelper();

// The Models tab's category tree lives in this sidebar.
const SIDEBAR = ".model-category-sidebar";

const runId = Date.now().toString(36).slice(-4);
const uniqueNames: Record<string, string> = {};
const models: Record<string, { id: number; name: string }> = {};

function unique(base: string): string {
    if (!uniqueNames[base]) {
        uniqueNames[base] = `${base}-${runId}`;
    }
    return uniqueNames[base];
}

function resolve(base: string): string {
    const name = uniqueNames[base];
    if (!name) {
        throw new Error(`No created model category tracked for "${base}".`);
    }
    return name;
}

// ── Manage via the sidebar context menu ───────────────────────────────

When(
    "I create a model category {string} via the context menu",
    async ({ page }, base: string) => {
        await createCategoryViaTree(page, SIDEBAR, unique(base));
    },
);

Then(
    "the model category {string} is visible in the sidebar",
    async ({ page }, base: string) => {
        await expect(categoryTreeRow(page, SIDEBAR, resolve(base))).toBeVisible({
            timeout: 10000,
        });
    },
);

Then(
    "the model category {string} is not visible in the sidebar",
    async ({ page }, base: string) => {
        await expect(categoryTreeRow(page, SIDEBAR, resolve(base))).toHaveCount(
            0,
            { timeout: 10000 },
        );
    },
);

When(
    "I rename the model category {string} to {string} via the context menu",
    async ({ page }, fromBase: string, toBase: string) => {
        await renameCategoryViaTree(
            page,
            SIDEBAR,
            resolve(fromBase),
            unique(toBase),
        );
    },
);

When(
    "I delete the model category {string} via the context menu",
    async ({ page }, base: string) => {
        await deleteCategoryViaTree(page, SIDEBAR, resolve(base));
    },
);

// ── Assign + filter ───────────────────────────────────────────────────

Given("I have a model category {string}", async ({}, base: string) => {
    await apiHelper.createModelCategory(unique(base));
});

Given("I have an uploaded model {string}", async ({}, base: string) => {
    const result = await apiHelper.uploadModel(
        path.join(__dirname, "../assets/test-cube.glb"),
    );
    models[base] = { id: result.id, name: result.name };
});

When(
    "I assign model {string} to category {string}",
    async ({ page }, modelBase: string, categoryBase: string) => {
        const model = models[modelBase];
        const listPage = new ModelListPage(page);
        const card = listPage.getModelCard(model.name, model.id);
        await expect(card).toBeVisible({ timeout: 15000 });
        await listPage.changeCategoryViaContextMenu(card, resolve(categoryBase));
    },
);

When(
    "I filter models by category {string}",
    async ({ page }, categoryBase: string) => {
        await clickCategoryInTree(page, SIDEBAR, resolve(categoryBase));
    },
);

Then(
    "model {string} is visible in the model grid",
    async ({ page }, modelBase: string) => {
        const model = models[modelBase];
        const card = new ModelListPage(page).getModelCard(model.name, model.id);
        await expect(card).toBeVisible({ timeout: 10000 });
    },
);

// ---- the metadata panel's category picker --------------------------------
//
// The picker reads each family's tree from that family's OWN query key, so a
// category created in the sidebar is offered by the picker with no invalidation
// wiring of its own. Sharing a key means sharing what is stored under it: the
// picker used to write a different shape there, and whichever of the two
// mounted second overwrote the first. These walk both navigation orders,
// because that is the only thing that decided which one broke.

When(
    "I open the metadata panel for model {string}",
    async ({ page }, modelBase: string) => {
        const model = models[modelBase];
        const listPage = new ModelListPage(page);
        await listPage.goto();

        // By id, not by name: the upload helper does not report a name, and the
        // id is the handle every other step in this file uses.
        const card = listPage.getModelCard(model.name, model.id);
        await expect(card).toBeVisible({ timeout: 15000 });
        await card.click();
        await waitForModelViewerCanvas(page, { timeout: 20000 });

        const viewer = new ModelViewerPage(page);
        await viewer.openTab("Metadata", '[data-testid="asset-metadata"]');
        await expect(page.locator('[data-testid="asset-metadata"]')).toBeVisible({
            timeout: 15000,
        });
    },
);

Then(
    "the metadata category picker should offer {string}",
    async ({ page }, categoryBase: string) => {
        const picker = page.locator(
            '[data-testid="metadata-category-category"]',
        );
        await expect(picker).toBeVisible({ timeout: 15000 });

        // An option, not merely a rendered string: the picker maps over the
        // cached list, and a wrong shape there is an empty select or a crash.
        await expect(
            picker.locator("option", { hasText: resolve(categoryBase) }),
        ).toHaveCount(1, { timeout: 15000 });
    },
);
