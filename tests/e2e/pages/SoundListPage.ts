import { Page, expect } from "@playwright/test";

/**
 * Page Object Model for interacting with the Sound List page.
 * Provides methods for navigating to sounds, interacting with sound cards,
 * using the context menu, managing categories, and recycling sounds.
 */
export class SoundListPage {
    constructor(private page: Page) {}

    // Selectors
    private readonly soundCard = ".sound-card";
    private readonly soundGrid = ".sound-grid";
    private readonly soundName = ".sound-name";
    private readonly contextMenu = ".p-contextmenu";
    private readonly recycleMenuItem = ".p-menuitem";
    private readonly categoryTab = ".category-tab";
    private readonly toastMessage = ".p-toast-message";
    private readonly dialog = ".p-dialog";

    /**
     * Navigate to the sounds page
     */
    async goto(): Promise<void> {
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
        await this.page.goto(`${baseUrl}/?leftTabs=sounds&activeLeft=sounds`);
        await this.page.waitForLoadState("networkidle").catch(() => {});
        // Wait for sounds grid or empty state to be visible
        await this.page
            .waitForSelector(`${this.soundGrid}, .sound-list-empty`, {
                state: "visible",
                timeout: 10000,
            })
            .catch(() => {
                // Grid might not exist if no sounds, that's ok
            });
    }

    /**
     * Get a sound card by index
     */
    getSoundCard(index: number) {
        return this.page.locator(this.soundCard).nth(index);
    }

    /**
     * Get a sound card by name
     */
    getSoundCardByName(name: string) {
        return this.page.locator(this.soundCard).filter({
            has: this.page.locator(this.soundName, { hasText: name }),
        });
    }

    /**
     * Get the total count of sounds visible
     */
    async getSoundCount(): Promise<number> {
        return await this.page.locator(this.soundCard).count();
    }

    /**
     * Click on a sound card by name to open the modal
     */
    async clickSoundByName(name: string): Promise<void> {
        const card = this.getSoundCardByName(name);
        await card.first().click();
        await expect(this.page.locator(this.dialog)).toBeVisible({
            timeout: 5000,
        });
    }

    /**
     * Click on a sound card by data-sound-id attribute
     */
    async clickSoundById(soundId: number): Promise<void> {
        const card = this.page.locator(`[data-sound-id="${soundId}"]`);
        await expect(card).toBeVisible({ timeout: 10000 });
        await card.scrollIntoViewIfNeeded();
        await card.click();
        await expect(this.page.locator(this.dialog)).toBeVisible({
            timeout: 5000,
        });
    }

    /**
     * Right-click on a sound card to show context menu
     */
    async rightClickSound(index: number): Promise<void> {
        const card = this.getSoundCard(index);
        await card.click({ button: "right" });
        await this.page.waitForSelector(this.contextMenu, {
            state: "visible",
            timeout: 5000,
        });
    }

    /**
     * Right-click on a sound card by name to show context menu
     */
    async rightClickSoundByName(name: string): Promise<void> {
        const card = this.getSoundCardByName(name);
        await card.first().click({ button: "right" });
        await this.page.waitForSelector(this.contextMenu, {
            state: "visible",
            timeout: 5000,
        });
    }

    /**
     * Click the Recycle menu item in the context menu
     */
    async clickRecycleMenuItem(): Promise<void> {
        const menu = this.page.locator(this.contextMenu);
        await menu
            .locator(this.recycleMenuItem)
            .filter({ hasText: /Recycle/ })
            .click();
        await this.page.waitForLoadState("networkidle").catch(() => {});
    }

    /**
     * Recycle a sound by name (right-click + click Recycle)
     */
    async recycleSoundByName(name: string): Promise<void> {
        await this.rightClickSoundByName(name);
        await this.clickRecycleMenuItem();
    }

    /**
     * Upload a sound from a file path using the file input
     */
    async uploadSound(filePath: string): Promise<void> {
        const fileInput = this.page.locator("input[type='file']").first();
        await fileInput.setInputFiles(filePath);
        await this.page.waitForLoadState("networkidle").catch(() => {});
    }

    /**
     * Wait for sound to appear in the list
     */
    async waitForSoundByName(name: string, timeout = 10000): Promise<void> {
        await expect(this.getSoundCardByName(name).first()).toBeVisible({
            timeout,
        });
    }

    /**
     * Check if a sound exists by name
     */
    async soundExists(name: string): Promise<boolean> {
        const card = this.getSoundCardByName(name);
        return (await card.count()) > 0;
    }

    // ===== Dialog Interaction Methods =====

    /**
     * Close the currently open dialog
     */
    async closeDialog(): Promise<void> {
        const closeButton = this.page.locator(
            ".p-dialog-header-close, .p-dialog button:has-text('Close')",
        );
        if (await closeButton.isVisible()) {
            await closeButton.click();
            await this.page
                .locator(this.dialog)
                .waitFor({ state: "hidden", timeout: 5000 })
                .catch(() => {});
        }
    }

    /**
     * Fill the name input in a dialog
     */
    async fillDialogNameInput(name: string): Promise<void> {
        const dialog = this.page.locator(this.dialog);
        const nameInput = dialog.locator(
            '[data-testid="sound-name-input"], #soundName, input[type="text"]',
        );
        await nameInput.waitFor({ state: "visible", timeout: 5000 });
        await nameInput.clear();
        await nameInput.fill(name);
    }

    /**
     * Click the Save button in a dialog
     */
    async clickDialogSaveButton(): Promise<void> {
        const dialog = this.page.locator(this.dialog);
        const saveButton = dialog.locator(
            '[data-testid="sound-dialog-save"], button:has-text("Save")',
        );
        await saveButton.click();
        await dialog.waitFor({ state: "hidden", timeout: 10000 });
    }

    // ===== Category Methods =====

    /**
     * Click the Add Category button to open category dialog
     */
    async openCategoryDialog(): Promise<void> {
        const addCategoryButton = this.page.locator(
            "button:has-text('Add Category')",
        );
        await addCategoryButton.click();
        await expect(this.page.locator(this.dialog)).toBeVisible({
            timeout: 5000,
        });
    }

    /**
     * Create a category with name and optional description
     */
    async createCategory(name: string, description?: string): Promise<void> {
        const dialog = this.page.locator(this.dialog);
        await dialog.waitFor({ state: "visible", timeout: 5000 });

        const nameInput = dialog.locator("#categoryName");
        await nameInput.waitFor({ state: "visible", timeout: 10000 });
        await nameInput.fill(name);

        if (description) {
            const descInput = dialog.locator("#categoryDescription");
            if (await descInput.isVisible()) {
                await descInput.fill(description);
            }
        }

        const saveButton = dialog.locator("button:has-text('Save')");
        await saveButton.click();
        await dialog.waitFor({ state: "hidden", timeout: 10000 });
    }

    /**
     * Get a category tab by name
     */
    getCategoryTab(name: string) {
        return this.page.locator(this.categoryTab).filter({ hasText: name });
    }

    /**
     * Check if a category tab is visible
     */
    async isCategoryVisible(name: string): Promise<boolean> {
        return await this.getCategoryTab(name).isVisible();
    }

    /**
     * Click on a category tab to filter sounds
     */
    async filterByCategory(name: string): Promise<void> {
        const tab = this.getCategoryTab(name);
        await tab.click();
        await this.page.waitForLoadState("networkidle").catch(() => {});
    }

    /**
     * Edit a category (click the pencil icon on the category tab)
     */
    async editCategory(name: string): Promise<void> {
        await this.page.keyboard.press("Escape");
        const tab = this.getCategoryTab(name);
        await tab.waitFor({ state: "visible", timeout: 5000 });
        await tab.click();
        const editButton = tab.locator("button:has(.pi-pencil)");
        await editButton.click();
        const dialog = this.page.locator(
            '[data-testid="category-dialog"], .p-dialog',
        );
        await dialog.waitFor({ state: "visible", timeout: 5000 });
    }

    /**
     * Delete a category (click the trash icon on the category tab)
     */
    async deleteCategory(name: string): Promise<void> {
        await this.page.keyboard.press("Escape");
        const tab = this.getCategoryTab(name);
        await tab.waitFor({ state: "visible", timeout: 5000 });
        await tab.click();
        const deleteButton = tab.locator("button:has(.pi-trash)");
        await deleteButton.click();

        // Confirm deletion in dialog
        const confirmDialog = this.page.locator(".p-confirm-dialog, .p-dialog");
        await confirmDialog.waitFor({ state: "visible", timeout: 5000 });
        const confirmButton = confirmDialog.locator(
            "button.p-button-danger, button:has-text('Yes'), button:has-text('Delete')",
        );
        await confirmButton.click();
        await confirmDialog.waitFor({ state: "hidden", timeout: 10000 });
    }

    /**
     * Wait for toast message to appear
     */
    async waitForToast(text: string, timeout = 5000): Promise<void> {
        await expect(
            this.page.locator(this.toastMessage).filter({ hasText: text }),
        ).toBeVisible({ timeout });
    }
}
