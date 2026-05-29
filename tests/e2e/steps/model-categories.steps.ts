import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { ApiHelper } from "../helpers/api-helper";
import {
    categoryNode,
    createCategory,
    deleteCategory,
    renameCategory,
} from "../helpers/category-manager-helper";
import { ModelListPage } from "../pages/ModelListPage";

const { Given, When, Then } = createBdd();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiHelper = new ApiHelper();

// Title of the shared CategoryManagerDialog on the models page.
const TITLE = "Manage Model Categories";

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

When("I open the model category manager", async ({ page }) => {
    await new ModelListPage(page).openCategoryManager();
});

When("I create the model category {string}", async ({ page }, base: string) => {
    await createCategory(page, TITLE, unique(base));
});

Then(
    "the model category {string} is listed",
    async ({ page }, base: string) => {
        await expect(categoryNode(page, TITLE, resolve(base))).toBeVisible({
            timeout: 10000,
        });
    },
);

Then(
    "the model category {string} is not listed",
    async ({ page }, base: string) => {
        await expect(categoryNode(page, TITLE, resolve(base))).toHaveCount(0, {
            timeout: 10000,
        });
    },
);

When(
    "I rename the model category {string} to {string}",
    async ({ page }, fromBase: string, toBase: string) => {
        await renameCategory(page, TITLE, resolve(fromBase), unique(toBase));
    },
);

When("I delete the model category {string}", async ({ page }, base: string) => {
    await deleteCategory(page, TITLE, resolve(base));
});

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
        await new ModelListPage(page).filterByCategory(resolve(categoryBase));
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
