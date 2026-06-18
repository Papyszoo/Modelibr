import { Page, expect } from "@playwright/test";
import { clickTab, navigateToTab } from "../helpers/navigation-helper";

/**
 * Page Object Model for the Script List page.
 * Covers navigation, script cards, the in-app create dialog, the code editor,
 * categories, and recycling.
 */
export class ScriptListPage {
    constructor(private page: Page) {}

    private readonly scriptCard = ".script-card";
    private readonly scriptName = ".script-name";
    private readonly contextMenu = ".p-contextmenu";
    private readonly categoryTab = ".category-tab";
    private readonly dialog = ".p-dialog";

    /** Navigate to the scripts page via UI (fresh app state). */
    async goto(): Promise<void> {
        await navigateToTab(this.page, "scripts");
        await this.waitForReady();
    }

    /**
     * Return to the already-open Scripts list tab (e.g. after editing a script
     * in its own tab) by clicking it in the dock — no app reset.
     */
    async returnToList(): Promise<void> {
        await clickTab(this.page, "scripts");
        await this.waitForReady();
    }

    private async waitForReady(): Promise<void> {
        await this.page
            .waitForSelector(
                ".script-list, .script-grid, .script-list-empty, input[type='file']",
                { state: "attached", timeout: 15000 },
            )
            .catch(() => {});
    }

    getScriptCardByName(name: string) {
        return this.page.locator(this.scriptCard).filter({
            has: this.page.locator(this.scriptName, { hasText: name }),
        });
    }

    getScriptCardById(scriptId: number) {
        return this.page.locator(`[data-script-id="${scriptId}"]`);
    }

    async scriptExists(name: string): Promise<boolean> {
        return (await this.getScriptCardByName(name).count()) > 0;
    }

    /** Upload a script file via the hidden file input. */
    async uploadScript(filePath: string): Promise<void> {
        const fileInput = this.page.locator("input[type='file']").first();
        await fileInput.setInputFiles(filePath);
        await this.page.waitForLoadState("domcontentloaded");
    }

    /** Open the in-app "New Script" dialog. */
    async openCreateDialog(): Promise<void> {
        await this.page
            .getByRole("button", { name: /^new script$/i })
            .click();
        await expect(
            this.page.locator('[data-testid="script-create-dialog"]'),
        ).toBeVisible({ timeout: 5000 });
    }

    /** Fill the New Script dialog (name + language + optional description) and submit. */
    async createScript(
        name: string,
        languageLabel: string,
        description?: string,
    ): Promise<void> {
        const dialog = this.page.locator('[data-testid="script-create-dialog"]');
        await dialog.locator('[data-testid="script-create-name"]').fill(name);

        // PrimeReact Dropdown: open and pick the language by visible label.
        await dialog.locator('[data-testid="script-create-language"]').click();
        await this.page
            .locator(".p-dropdown-item", { hasText: languageLabel })
            .first()
            .click();

        if (description) {
            await dialog
                .locator('[data-testid="script-create-description"]')
                .fill(description);
        }

        await dialog.locator('[data-testid="script-create-submit"]').click();
        // Creation opens the script in its own editor tab (a page, not a modal).
        await expect(
            this.page.locator('[data-testid="script-editor"]'),
        ).toBeVisible({ timeout: 10000 });
    }

    /** True once the live shader preview pane is rendered in the editor page. */
    async previewVisible(): Promise<boolean> {
        return this.page
            .locator('[data-testid="script-preview"]')
            .first()
            .isVisible()
            .catch(() => false);
    }

    /** The description text shown on a script card in the list, if any. */
    getCardDescription(name: string) {
        return this.getScriptCardByName(name).locator(".script-description");
    }

    /** Open a script card (by id) to launch the editor modal. */
    async openScriptById(scriptId: number): Promise<void> {
        const card = this.getScriptCardById(scriptId);
        const loadMore = 'button:has-text("Load More")';
        while (!(await card.isVisible().catch(() => false))) {
            const btn = this.page.locator(loadMore).first();
            if (!(await btn.isVisible().catch(() => false))) break;
            await btn.click();
            await this.page.waitForTimeout(500);
        }
        await expect(card).toBeVisible({ timeout: 10000 });
        await card.scrollIntoViewIfNeeded();
        await card.click();
        await expect(
            this.page.locator('[data-testid="script-editor"]'),
        ).toBeVisible({ timeout: 5000 });
    }

    /** Type into the CodeMirror editor (replaces current content). */
    async typeInEditor(text: string): Promise<void> {
        const editor = this.page.locator(
            '[data-testid="script-editor"] .cm-content',
        );
        await editor.click();
        await this.page.keyboard.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A",
        );
        await this.page.keyboard.press("Delete");
        await editor.pressSequentially(text);
    }

    /** Click Save in the editor and wait for the saved state. */
    async saveEditor(): Promise<void> {
        await this.page.locator('[data-testid="script-save"]').click();
        await expect(
            this.page.locator('[data-testid="script-save"]'),
        ).toBeDisabled({ timeout: 10000 });
    }

    async closeDialog(): Promise<void> {
        const closeButton = this.page.locator(
            ".p-dialog-header-close, .p-dialog button:has(.pi-times)",
        );
        if (await closeButton.first().isVisible().catch(() => false)) {
            await closeButton.first().click();
            await this.page
                .locator(this.dialog)
                .first()
                .waitFor({ state: "hidden", timeout: 5000 })
                .catch(() => {});
        }
    }

    // ===== Categories =====

    async openCategoryDialog(): Promise<void> {
        await this.page.locator("button:has-text('Add Category')").click();
        await expect(this.page.locator(this.dialog)).toBeVisible({
            timeout: 5000,
        });
    }

    async createCategory(name: string): Promise<void> {
        const dialog = this.page.locator(this.dialog);
        const nameInput = dialog.locator("#categoryName");
        await nameInput.waitFor({ state: "visible", timeout: 10000 });
        await nameInput.fill(name);
        await dialog.locator("button:has-text('Save')").click();
        await dialog.waitFor({ state: "hidden", timeout: 10000 });
    }

    getCategoryTab(name: string) {
        return this.page.locator(this.categoryTab).filter({ hasText: name });
    }

    async rightClickScriptByName(name: string): Promise<void> {
        await this.getScriptCardByName(name)
            .first()
            .click({ button: "right" });
        await this.page.waitForSelector(this.contextMenu, {
            state: "visible",
            timeout: 5000,
        });
    }

    async clickRecycleMenuItem(): Promise<void> {
        await this.page
            .locator(this.contextMenu)
            .locator(".p-menuitem")
            .filter({ hasText: /Recycle/ })
            .click();
        await this.page.waitForLoadState("domcontentloaded");
    }
}
