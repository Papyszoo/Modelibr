import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared driver for the `CategoryTreePanel` sidebar's right-click category
 * management, used by every asset type (models, texture sets, environment
 * maps, sounds, …). The panel is the same component everywhere — only the
 * page-specific sidebar selector differs — so all the DOM interactions live
 * here once. The old per-type "Manage categories" modal was removed.
 */

/**
 * Exact-match category row in a sidebar tree. Exact text avoids the classic
 * substring collision (e.g. "Metal" also matching "Metallic").
 */
export function categoryTreeRow(
    page: Page,
    sidebar: string,
    name: string,
): Locator {
    return page
        .locator(`${sidebar} .category-tree-node-content`)
        .filter({ has: page.getByText(name, { exact: true }) });
}

async function clickContextMenuItem(page: Page, label: string): Promise<void> {
    // PrimeReact ContextMenu portals to document.body (the accepted .p-*
    // exception for body-mounted overlays).
    const item = page
        .locator(".p-contextmenu .p-menuitem-text")
        .filter({ hasText: label })
        .first();
    await expect(item).toBeVisible({ timeout: 5000 });
    await item.click();
}

async function commitInlineName(
    page: Page,
    sidebar: string,
    name: string,
): Promise<void> {
    const input = page
        .locator(`${sidebar} [data-testid="category-tree-inline-input"]`)
        .first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(name);
    await input.press("Enter");
    await expect(input).toBeHidden({ timeout: 10000 });
}

/** Right-click the "All" bucket → "Add category" → type the name inline. */
export async function createCategoryViaTree(
    page: Page,
    sidebar: string,
    name: string,
): Promise<void> {
    await page
        .locator(`${sidebar} [data-testid="category-tree-all"]`)
        .click({ button: "right" });
    await clickContextMenuItem(page, "Add category");
    await commitInlineName(page, sidebar, name);
}

export async function addSubcategoryViaTree(
    page: Page,
    sidebar: string,
    parentName: string,
    childName: string,
): Promise<void> {
    const parent = categoryTreeRow(page, sidebar, parentName);
    await expect(parent).toBeVisible({ timeout: 10000 });
    await parent.click({ button: "right" });
    await clickContextMenuItem(page, "Add subcategory");
    await commitInlineName(page, sidebar, childName);
}

export async function renameCategoryViaTree(
    page: Page,
    sidebar: string,
    oldName: string,
    newName: string,
): Promise<void> {
    const row = categoryTreeRow(page, sidebar, oldName);
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click({ button: "right" });
    await clickContextMenuItem(page, "Rename");
    await commitInlineName(page, sidebar, newName);
}

export async function deleteCategoryViaTree(
    page: Page,
    sidebar: string,
    name: string,
    opts: { branchWarning?: boolean } = {},
): Promise<void> {
    const row = categoryTreeRow(page, sidebar, name);
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click({ button: "right" });
    await clickContextMenuItem(page, "Delete");

    const dialog = page.locator(".p-confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    if (opts.branchWarning) {
        // The branch warning must spell out the consequences before the user
        // commits to removing subcategories and unassigning their assets.
        await expect(dialog).toContainText("subcategor");
        await expect(dialog).toContainText("uncategorized");
    }
    await dialog.locator("button.p-button-danger").click();
    await expect(dialog).toBeHidden({ timeout: 10000 });
}

/** Click a category row to make it the single active filter (sidebar nav). */
export async function clickCategoryInTree(
    page: Page,
    sidebar: string,
    name: string,
): Promise<void> {
    const row = categoryTreeRow(page, sidebar, name);
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
}
