import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import {
    categoryNode,
    createCategory,
    deleteCategory,
    renameCategory,
} from "../helpers/category-manager-helper";
import { createUniqueSolidHdrPayload } from "../helpers/file-payload-helper";
import { EnvironmentMapsPage } from "../pages/EnvironmentMapsPage";

const { Given, When, Then } = createBdd();

const apiHelper = new ApiHelper();

// Title of the shared CategoryManagerDialog on the environment maps page.
const TITLE = "Manage Environment Map Categories";

const runId = Date.now().toString(36).slice(-4);
const uniqueNames: Record<string, string> = {};
const maps: Record<string, { id: number; name: string }> = {};

function unique(base: string): string {
    if (!uniqueNames[base]) {
        uniqueNames[base] = `${base}-${runId}`;
    }
    return uniqueNames[base];
}

function resolve(base: string): string {
    const name = uniqueNames[base];
    if (!name) {
        throw new Error(`No tracked environment map category for "${base}".`);
    }
    return name;
}

// ── Manage (shared dialog) ────────────────────────────────────────────

When("I open the environment map category manager", async ({ page }) => {
    await new EnvironmentMapsPage(page).openCategoryManager();
});

When(
    "I create the environment map category {string}",
    async ({ page }, base: string) => {
        await createCategory(page, TITLE, unique(base));
    },
);

Then(
    "the environment map category {string} is listed",
    async ({ page }, base: string) => {
        await expect(categoryNode(page, TITLE, resolve(base))).toBeVisible({
            timeout: 10000,
        });
    },
);

Then(
    "the environment map category {string} is not listed",
    async ({ page }, base: string) => {
        await expect(categoryNode(page, TITLE, resolve(base))).toHaveCount(0, {
            timeout: 10000,
        });
    },
);

When(
    "I rename the environment map category {string} to {string}",
    async ({ page }, fromBase: string, toBase: string) => {
        await renameCategory(page, TITLE, resolve(fromBase), unique(toBase));
    },
);

When(
    "I delete the environment map category {string}",
    async ({ page }, base: string) => {
        await deleteCategory(page, TITLE, resolve(base));
    },
);

// ── Assign + filter ───────────────────────────────────────────────────

Given(
    "I have an environment map category {string}",
    async ({}, base: string) => {
        await apiHelper.createEnvironmentMapCategory(unique(base));
    },
);

Given(
    "I upload an environment map named {string}",
    async ({ page }, base: string) => {
        const name = unique(base);
        const { environmentMapId } = await new EnvironmentMapsPage(
            page,
        ).uploadSingleEnvironmentMapViaDialog({
            name,
            file: createUniqueSolidHdrPayload({
                filenamePrefix: base,
                width: 64,
                height: 32,
            }),
        });
        maps[base] = { id: environmentMapId, name };
    },
);

When(
    "I assign environment map {string} to category {string}",
    async ({ page }, mapBase: string, categoryBase: string) => {
        await new EnvironmentMapsPage(page).changeCategoryViaContextMenu(
            maps[mapBase].name,
            resolve(categoryBase),
        );
    },
);

When(
    "I filter environment maps by category {string}",
    async ({ page }, categoryBase: string) => {
        await new EnvironmentMapsPage(page).filterByCategory(
            resolve(categoryBase),
        );
    },
);

Then(
    "environment map {string} is visible in the list",
    async ({ page }, mapBase: string) => {
        const card = new EnvironmentMapsPage(page).getEnvironmentMapCardByName(
            maps[mapBase].name,
        );
        await expect(card.first()).toBeVisible({ timeout: 10000 });
    },
);
