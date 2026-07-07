import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import {
    categoryTreeRow,
    clickCategoryInTree,
    createCategoryViaTree,
    deleteCategoryViaTree,
    renameCategoryViaTree,
} from "../helpers/category-tree-helper";
import { createUniqueSolidHdrPayload } from "../helpers/file-payload-helper";
import { EnvironmentMapsPage } from "../pages/EnvironmentMapsPage";
import { revealVirtualizedCard } from "../helpers/reveal-virtualized-card";

const { Given, When, Then } = createBdd();

const apiHelper = new ApiHelper();

// The Environment Maps tab's category tree lives in this sidebar.
const SIDEBAR = ".environment-map-category-sidebar";

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

// ── Manage via the sidebar context menu ───────────────────────────────

When(
    "I create an environment map category {string} via the context menu",
    async ({ page }, base: string) => {
        await createCategoryViaTree(page, SIDEBAR, unique(base));
    },
);

Then(
    "the environment map category {string} is visible in the sidebar",
    async ({ page }, base: string) => {
        await expect(categoryTreeRow(page, SIDEBAR, resolve(base))).toBeVisible({
            timeout: 10000,
        });
    },
);

Then(
    "the environment map category {string} is not visible in the sidebar",
    async ({ page }, base: string) => {
        await expect(categoryTreeRow(page, SIDEBAR, resolve(base))).toHaveCount(
            0,
            { timeout: 10000 },
        );
    },
);

When(
    "I rename the environment map category {string} to {string} via the context menu",
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
    "I delete the environment map category {string} via the context menu",
    async ({ page }, base: string) => {
        await deleteCategoryViaTree(page, SIDEBAR, resolve(base));
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
        await clickCategoryInTree(page, SIDEBAR, resolve(categoryBase));
    },
);

Then(
    "environment map {string} is visible in the list",
    async ({ page }, mapBase: string) => {
        const card = new EnvironmentMapsPage(page).getEnvironmentMapCardByName(
            maps[mapBase].name,
        );
        // The filtered card can sit below the fold in the narrower
        // sidebar-open grid — reveal it in the virtualised list first.
        await revealVirtualizedCard(page, ".environment-map-list-main", card);
        await expect(card.first()).toBeVisible({ timeout: 10000 });
    },
);
