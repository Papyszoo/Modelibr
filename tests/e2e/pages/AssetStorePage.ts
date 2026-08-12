import { Page, Locator, expect } from "@playwright/test";
import { navigateToTab } from "../helpers/navigation-helper";

/**
 * Page object for the Asset Store tab (src/frontend/src/features/asset-store).
 * The store behind it in e2e runs is the store-fixture-e2e container; its
 * fixture account is hardcoded in fixtures/store-fixture/server.mjs.
 */
export const STORE_FIXTURE_EMAIL = "artist@store.test";
export const STORE_FIXTURE_PASSWORD = "e2e-store-pass";

export class AssetStorePage {
    readonly page: Page;
    readonly root: Locator;
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly submitButton: Locator;
    readonly userChip: Locator;

    constructor(page: Page) {
        this.page = page;
        this.root = page.getByTestId("asset-store-page");
        this.emailInput = page.getByTestId("asset-store-email");
        this.passwordInput = page.getByTestId("asset-store-password");
        this.submitButton = page.getByTestId("asset-store-login-submit");
        this.userChip = page.getByTestId("asset-store-user");
    }

    async navigateTo(): Promise<void> {
        await navigateToTab(this.page, "assetStore");
        await expect(this.root).toBeVisible({ timeout: 15000 });
        console.log("[Navigation] On Asset Store tab");
    }

    async signIn(email: string, password: string): Promise<void> {
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        // Scope the wait to the exact login call so a slow fixture start
        // doesn't race the assertion on the signed-in header.
        const loginResponse = this.page.waitForResponse(
            (r) =>
                r.url().includes("/api/auth/login") &&
                r.request().method() === "POST",
        );
        await this.submitButton.click();
        await loginResponse;
        await expect(this.userChip).toBeVisible({ timeout: 15000 });
        console.log(`[Action] Signed into the store as ${email}`);
    }

    libraryTile(assetId: string): Locator {
        return this.page.locator(`[data-store-asset-id="${assetId}"]`);
    }

    // Import moved into the per-pack detail view (per-item selection): the
    // grid tile only opens the detail; the detail hosts the import + open
    // actions.
    packDetail(): Locator {
        return this.page.getByTestId("asset-store-detail");
    }

    importSelectedButton(): Locator {
        return this.page.getByTestId("asset-store-detail-import");
    }

    openInLibraryButton(): Locator {
        return this.page.getByTestId("asset-store-detail-open");
    }

    itemList(): Locator {
        return this.page.getByTestId("asset-store-item-list");
    }

    /** The nth selectable item row in the open pack detail (0-based). */
    itemRow(index = 0): Locator {
        return this.itemList().locator("li").nth(index);
    }

    /** The row's own selection checkbox - the control, not the row-click affordance. */
    itemCheckbox(index = 0): Locator {
        return this.itemRow(index).locator("input[type=checkbox]");
    }

    /**
     * Opens the pack detail, or no-ops when it is already open - the detail view
     * REPLACES the library grid, so a second click on the (now absent) tile would
     * just time out.
     */
    async openPackDetail(assetId: string): Promise<void> {
        if (await this.packDetail().isVisible()) {
            console.log(`[Action] Pack detail already open for ${assetId}`);
            return;
        }
        await this.libraryTile(assetId).click();
        await expect(this.packDetail()).toBeVisible({ timeout: 15000 });
        console.log(`[Action] Opened pack detail for ${assetId}`);
    }

    async importAsset(assetId: string): Promise<void> {
        await this.openPackDetail(assetId);
        // The button stays disabled until the pack CONTENTS have loaded - a pack
        // whose detail request failed reports zero items, and importing then
        // would silently pull the whole pack. Wait for it explicitly so that
        // case fails here with a clear message instead of inside the click.
        await expect(this.importSelectedButton()).toBeEnabled({
            timeout: 15000,
        });
        // All items are selected by default - "Import selected (N)" imports
        // the whole pack.
        await this.importSelectedButton().click();
        console.log(`[Action] Started import of ${assetId} from pack detail`);
    }
}
