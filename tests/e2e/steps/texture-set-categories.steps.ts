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
import {
    narrowVirtualisedList,
    waitForCountLabelStable,
} from "../helpers/list-toolbar-helper";
import { TextureSetsPage } from "../pages/TextureSetsPage";

const { Given, When, Then } = createBdd();

const apiHelper = new ApiHelper();

// The Texture Sets tab's category tree lives in this sidebar. Its contents are
// scoped to the active kind (Global Materials vs Multi-Model), so switching
// the kind tab swaps the visible category pool.
const SIDEBAR = ".texture-set-category-sidebar";

// Tracks created category ids by base name (for API-level assertions).
const categoryIds: Record<string, number> = {};

// Run-unique suffix so repeated runs / serial scenarios don't collide on
// the (Kind, ParentId, Name) unique index.
const runId = Date.now().toString(36).slice(-4);

// Maps a human-friendly base name from the feature to the unique name we
// actually create. Shared by categories and texture sets — bases are
// distinct across scenarios.
const uniqueNames: Record<string, string> = {};

function unique(base: string): string {
    if (!uniqueNames[base]) {
        uniqueNames[base] = `${base}-${runId}`;
    }
    return uniqueNames[base];
}

function resolve(base: string): string {
    const name = uniqueNames[base];
    if (!name) {
        throw new Error(`No created entity tracked for base name "${base}".`);
    }
    return name;
}

const MODEL_SPECIFIC = 0;
const UNIVERSAL = 1;

// ── API setup ─────────────────────────────────────────────────────────

Given(
    "I have a model-specific texture set category {string}",
    async ({}, base: string) => {
        const created = await apiHelper.createTextureSetCategory(
            unique(base),
            MODEL_SPECIFIC,
        );
        categoryIds[base] = created.id;
    },
);

Given(
    "I have a universal texture set category {string}",
    async ({}, base: string) => {
        const created = await apiHelper.createTextureSetCategory(
            unique(base),
            UNIVERSAL,
        );
        categoryIds[base] = created.id;
    },
);

Given(
    "I have a model-specific texture set {string}",
    async ({}, base: string) => {
        await apiHelper.createTextureSetWithKind(unique(base), MODEL_SPECIFIC);
    },
);

Given(
    "I have a universal texture set {string}",
    async ({}, base: string) => {
        await apiHelper.createTextureSetWithKind(unique(base), UNIVERSAL);
    },
);

// ── Manage via the sidebar context menu (per active kind) ─────────────

When(
    "I create a texture set category {string} via the context menu",
    async ({ page }, base: string) => {
        await createCategoryViaTree(page, SIDEBAR, unique(base));
    },
);

Then(
    "the texture set category {string} is visible in the sidebar",
    async ({ page }, base: string) => {
        await expect(categoryTreeRow(page, SIDEBAR, resolve(base))).toBeVisible({
            timeout: 10000,
        });
    },
);

Then(
    "the texture set category {string} is not visible in the sidebar",
    async ({ page }, base: string) => {
        await expect(categoryTreeRow(page, SIDEBAR, resolve(base))).toHaveCount(
            0,
            { timeout: 10000 },
        );
    },
);

When(
    "I rename the texture set category {string} to {string} via the context menu",
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
    "I delete the texture set category {string} via the context menu",
    async ({ page }, base: string) => {
        await deleteCategoryViaTree(page, SIDEBAR, resolve(base));
    },
);

// ── Assignment + filtering ────────────────────────────────────────────

When(
    "I assign texture set {string} to category {string}",
    async ({ page }, setBase: string, categoryBase: string) => {
        const textureSetsPage = new TextureSetsPage(page);
        const setName = resolve(setBase);

        // Narrow the virtualised grid so the card is rendered in the DOM
        // before we right-click it.
        const search = await narrowVirtualisedList(page, setName);
        await textureSetsPage.assignCategoryViaContextMenu(
            setName,
            resolve(categoryBase),
        );
        await search.clear();
        await waitForCountLabelStable(page);
    },
);

When(
    "I filter texture sets by category {string}",
    async ({ page }, base: string) => {
        await clickCategoryInTree(page, SIDEBAR, resolve(base));
        await waitForCountLabelStable(page);
    },
);

Then(
    "texture set {string} is visible in the grid",
    async ({ page }, base: string) => {
        const textureSetsPage = new TextureSetsPage(page);
        const setName = resolve(base);
        // Narrow by name on top of the active category filter so the card
        // is guaranteed to be rendered even in a virtualised grid.
        await narrowVirtualisedList(page, setName);
        await expect(textureSetsPage.getCardByName(setName)).toBeVisible({
            timeout: 10000,
        });
    },
);

// ── Same-kind duplicate rejection (API-level, deterministic) ──────────

Then(
    "renaming category {string} to {string} is rejected",
    async ({}, fromBase: string, toBase: string) => {
        const id = categoryIds[fromBase];
        if (id === undefined) {
            throw new Error(`No tracked id for category "${fromBase}".`);
        }
        const status = await apiHelper.updateTextureSetCategoryStatus(
            id,
            resolve(toBase),
        );
        expect(status).toBe(400);
    },
);

// ── Same-kind duplicate rejection (UI: rename surfaces an error toast) ─

Then(
    "renaming the texture set category {string} to {string} via the context menu surfaces an error",
    async ({ page }, fromBase: string, toBase: string) => {
        await renameCategoryViaTree(
            page,
            SIDEBAR,
            resolve(fromBase),
            resolve(toBase),
        );
        // The rename mutation's onError raises a failure toast; the tree keeps
        // showing the original name because the collision was rejected.
        await expect(
            page
                .locator(".p-toast-message", { hasText: "Failed to rename" })
                .first(),
        ).toBeVisible({ timeout: 5000 });
        await expect(
            categoryTreeRow(page, SIDEBAR, resolve(fromBase)),
        ).toBeVisible({ timeout: 10000 });
    },
);
