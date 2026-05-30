import { Page, Locator, expect } from "@playwright/test";

/**
 * Helpers for the shared CategoryManagerDialog used by every asset type
 * (Models, Texture Sets, …). The dialog DOM is identical regardless of
 * asset; only the dialog title differs, so callers pass it in.
 *
 * The dialog is a single window with two views: a category LIST (each row
 * has hover edit/delete actions and an "Add category" button) and an
 * add/edit FORM. Opening the manager is asset-specific (different toolbars),
 * so that lives on the per-asset page objects; these helpers drive the
 * already-open dialog.
 */

export function managerDialog(page: Page, title: string): Locator {
    return page.getByRole("dialog", { name: title });
}

/** The node for a category by exact name within the manager's list view. */
export function categoryNode(
    page: Page,
    title: string,
    name: string,
): Locator {
    return managerDialog(page, title)
        .locator(".category-manager-list .category-row-name")
        .getByText(name, { exact: true });
}

/** Add a category: open the form, fill the name, save, return to the list. */
export async function createCategory(
    page: Page,
    title: string,
    name: string,
): Promise<void> {
    const dialog = managerDialog(page, title);
    await dialog.getByRole("button", { name: "Add category" }).click();
    await dialog.locator("#category-name").fill(name);
    await dialog.getByRole("button", { name: "Create Category" }).click();
    await page
        .locator(".p-toast-message", { hasText: "Category created" })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
    await expect(categoryNode(page, title, name)).toBeVisible({
        timeout: 10000,
    });
}

/** Rename a category from the list: open its edit form, change name, save. */
export async function renameCategory(
    page: Page,
    title: string,
    fromName: string,
    toName: string,
): Promise<void> {
    const dialog = managerDialog(page, title);
    await dialog.getByRole("button", { name: `Edit ${fromName}` }).click();
    await dialog.locator("#category-name").fill(toName);
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await page
        .locator(".p-toast-message", { hasText: "Category updated" })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
}

/** Delete a category from the list row, confirming the destructive prompt. */
export async function deleteCategory(
    page: Page,
    title: string,
    name: string,
): Promise<void> {
    await managerDialog(page, title)
        .getByRole("button", { name: `Delete ${name}` })
        .click();
    // PrimeReact confirmDialog accept button.
    await page.locator(".p-confirm-dialog-accept").click();
    await page
        .locator(".p-toast-message", { hasText: "Category deleted" })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
}

export async function closeManager(page: Page, title: string): Promise<void> {
    const dialog = managerDialog(page, title);
    await dialog.locator(".p-dialog-header-close").click();
    await dialog.waitFor({ state: "hidden" });
}
