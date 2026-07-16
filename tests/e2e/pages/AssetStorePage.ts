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

    importButton(assetId: string): Locator {
        return this.page.getByTestId(`asset-store-import-${assetId}`);
    }

    openInLibraryButton(assetId: string): Locator {
        return this.page.getByTestId(`asset-store-open-${assetId}`);
    }

    async importAsset(assetId: string): Promise<void> {
        await this.importButton(assetId).click();
        console.log(`[Action] Started import of ${assetId}`);
    }
}
