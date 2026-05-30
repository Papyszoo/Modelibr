import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import {
    categoryNode,
    closeManager,
    createCategory,
    deleteCategory,
    managerDialog,
    renameCategory,
} from "../helpers/category-manager-helper";
import {
    narrowVirtualisedList,
    waitForCountLabelStable,
} from "../helpers/list-toolbar-helper";
import { TextureSetsPage } from "../pages/TextureSetsPage";

const { Given, When, Then } = createBdd();

const apiHelper = new ApiHelper();

// Title of the shared CategoryManagerDialog on the texture-sets page.
const TS_TITLE = "Manage Categories";

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

// ── Category manager (shared CategoryManagerDialog) ───────────────────

When("I open the category manager", async ({ page }) => {
    await new TextureSetsPage(page).openCategoryManager();
});

When("I create the category {string}", async ({ page }, base: string) => {
    await createCategory(page, TS_TITLE, unique(base));
});

Then(
    "the category {string} is listed in the manager",
    async ({ page }, base: string) => {
        await expect(categoryNode(page, TS_TITLE, resolve(base))).toBeVisible({
            timeout: 10000,
        });
    },
);

Then(
    "the category {string} is not listed in the manager",
    async ({ page }, base: string) => {
        await expect(categoryNode(page, TS_TITLE, resolve(base))).toHaveCount(
            0,
            { timeout: 10000 },
        );
    },
);

When("I close the category manager", async ({ page }) => {
    await closeManager(page, TS_TITLE);
});

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
        await new TextureSetsPage(page).filterByCategory(resolve(base));
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

// ── Editing (rename / delete) ─────────────────────────────────────────

When(
    "I rename the category {string} to {string}",
    async ({ page }, fromBase: string, toBase: string) => {
        await renameCategory(page, TS_TITLE, resolve(fromBase), unique(toBase));
    },
);

When(
    "I delete the texture set category {string}",
    async ({ page }, base: string) => {
        await deleteCategory(page, TS_TITLE, resolve(base));
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

Then(
    "renaming the category {string} to {string} fails in the manager",
    async ({ page }, fromBase: string, toBase: string) => {
        const dialog = managerDialog(page, TS_TITLE);
        await dialog
            .getByRole("button", { name: `Edit ${resolve(fromBase)}` })
            .click();
        await dialog.locator("#category-name").fill(resolve(toBase));
        await dialog.getByRole("button", { name: "Save Changes" }).click();
        // Error toast surfaces the rejection; success toast must NOT appear.
        await page
            .locator(".p-toast-message", {
                hasText: "Could not update category",
            })
            .first()
            .waitFor({ state: "visible", timeout: 5000 });
        await expect(
            page.locator(".p-toast-message", {
                hasText: "Category updated",
            }),
        ).toHaveCount(0);
        // Form stays open; return to the list for subsequent assertions.
        await dialog.getByRole("button", { name: "Cancel" }).click();
    },
);
