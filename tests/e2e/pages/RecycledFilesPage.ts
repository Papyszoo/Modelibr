import { Page, expect } from "@playwright/test";

/**
 * Page Object for the Recycled Files Page (Recycle Bin)
 */
export class RecycledFilesPage {
    constructor(private page: Page) {}

    // Main container selectors
    private readonly recycledFilesList = ".recycled-files-list";
    private readonly recycledFilesHeader = ".recycled-files-header h2";
    private readonly refreshButton = ".recycled-files-header .p-button-outlined";
    private readonly emptyState = ".recycled-files-empty";
    private readonly loading = ".recycled-files-loading";

    // Section selectors
    private readonly modelsSection = ".recycled-section:has(.pi-box)";
    private readonly modelVersionsSection = ".recycled-section:has(.pi-clone)";
    private readonly textureSetsSection = ".recycled-section:has(.pi-images)";
    private readonly spritesSection = ".recycled-section[data-section='sprites']";

    // Card selectors
    private readonly recycledCard = ".recycled-card";
    private readonly recycledCardName = ".recycled-card-name";
    private readonly recycledCardMeta = ".recycled-card-meta";
    private readonly restoreButton = ".p-button-success";
    private readonly deleteForeverButton = ".p-button-danger";

    // Delete confirmation dialog
    private readonly deleteDialog = ".p-dialog";
    private readonly deleteDialogHeader = ".p-dialog-title";
    private readonly deletePreview = ".delete-preview";
    private readonly filesToDelete = ".files-to-delete ul li";
    private readonly confirmDeleteButton = ".p-dialog-footer .p-button-danger";
    private readonly cancelButton = ".p-dialog-footer .p-button-text";

    /**
     * Navigate to the Recycled Files page
     */
    async goto(): Promise<void> {
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
        await this.page.goto(`${baseUrl}/?leftTabs=recycledFiles&activeLeft=recycledFiles`);
        await this.waitForLoaded();
    }

    /**
     * Wait for the page to finish loading
     */
    async waitForLoaded(): Promise<void> {
        // Wait for loading to finish - either content or empty state
        await this.page.waitForSelector(
            `${this.recycledFilesList}:not(:has(${this.loading}))`,
            { state: "visible", timeout: 15000 }
        );
        // Give UI time to settle
        await this.page.waitForTimeout(500);
    }

    /**
     * Check if the recycle bin is visible
     */
    async isVisible(): Promise<boolean> {
        return await this.page.locator(this.recycledFilesList).isVisible();
    }

    /**
     * Get the header text
     */
    async getHeaderText(): Promise<string | null> {
        return await this.page.locator(this.recycledFilesHeader).textContent();
    }

    /**
     * Check if the empty state is displayed
     */
    async isEmptyStateVisible(): Promise<boolean> {
        return await this.page.locator(this.emptyState).isVisible();
    }

    /**
     * Click the refresh button
     */
    async refresh(): Promise<void> {
        await this.page.locator(this.refreshButton).click();
        await this.waitForLoaded();
    }

    // ===== Models Section =====

    /**
     * Get count of recycled models
     */
    async getRecycledModelCount(): Promise<number> {
        const section = this.page.locator(this.modelsSection);
        if (!(await section.isVisible())) return 0;
        return await section.locator(this.recycledCard).count();
    }

    /**
     * Get a recycled model card by index
     */
    getModelCard(index: number) {
        return this.page.locator(this.modelsSection).locator(this.recycledCard).nth(index);
    }

    /**
     * Get the name of a recycled model
     */
    async getModelName(index: number): Promise<string | null> {
        const card = this.getModelCard(index);
        return await card.locator(this.recycledCardName).textContent();
    }

    /**
     * Click restore on a recycled model
     */
    async restoreModel(index: number): Promise<void> {
        const card = this.getModelCard(index);
        await card.hover();
        await card.locator(this.restoreButton).click();
        // Wait for the action to complete
        await this.page.waitForTimeout(1000);
    }

    /**
     * Click "Delete Forever" on a recycled model
     */
    async clickDeleteForeverModel(index: number): Promise<void> {
        const card = this.getModelCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        // Wait for dialog to appear
        await this.page.waitForSelector(this.deleteDialog, { state: "visible" });
    }

    // ===== Model Versions Section =====

    /**
     * Get count of recycled model versions
     */
    async getRecycledModelVersionCount(): Promise<number> {
        const section = this.page.locator(this.modelVersionsSection);
        if (!(await section.isVisible())) return 0;
        return await section.locator(this.recycledCard).count();
    }

    /**
     * Get a recycled model version card by index
     */
    getModelVersionCard(index: number) {
        return this.page.locator(this.modelVersionsSection).locator(this.recycledCard).nth(index);
    }

    /**
     * Click restore on a recycled model version
     */
    async restoreModelVersion(index: number): Promise<void> {
        const card = this.getModelVersionCard(index);
        await card.hover();
        await card.locator(this.restoreButton).click();
        await this.page.waitForTimeout(1000);
    }

    /**
     * Click "Delete Forever" on a recycled model version
     */
    async clickDeleteForeverModelVersion(index: number): Promise<void> {
        const card = this.getModelVersionCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        await this.page.waitForSelector(this.deleteDialog, { state: "visible" });
    }

    // ===== Texture Sets Section =====

    /**
     * Get count of recycled texture sets
     */
    async getRecycledTextureSetCount(): Promise<number> {
        const section = this.page.locator(this.textureSetsSection);
        if (!(await section.isVisible())) return 0;
        return await section.locator(this.recycledCard).count();
    }

    /**
     * Get a recycled texture set card by index
     */
    getTextureSetCard(index: number) {
        return this.page.locator(this.textureSetsSection).locator(this.recycledCard).nth(index);
    }

    /**
     * Get the name of a recycled texture set
     */
    async getTextureSetName(index: number): Promise<string | null> {
        const card = this.getTextureSetCard(index);
        return await card.locator(this.recycledCardName).textContent();
    }

    /**
     * Click restore on a recycled texture set
     */
    async restoreTextureSet(index: number): Promise<void> {
        const card = this.getTextureSetCard(index);
        await card.hover();
        await card.locator(this.restoreButton).click();
        await this.page.waitForTimeout(1000);
    }

    /**
     * Click "Delete Forever" on a recycled texture set
     */
    async clickDeleteForeverTextureSet(index: number): Promise<void> {
        const card = this.getTextureSetCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        await this.page.waitForSelector(this.deleteDialog, { state: "visible" });
    }

    // ===== Sprites Section =====

    /**
     * Get count of recycled sprites
     */
    async getRecycledSpriteCount(): Promise<number> {
        const section = this.page.locator(this.spritesSection);
        if (!(await section.isVisible())) return 0;
        return await section.locator(this.recycledCard).count();
    }

    /**
     * Get a recycled sprite card by index
     */
    getSpriteCard(index: number) {
        return this.page.locator(this.spritesSection).locator(this.recycledCard).nth(index);
    }

    /**
     * Get the name of a recycled sprite
     */
    async getSpriteName(index: number): Promise<string | null> {
        const card = this.getSpriteCard(index);
        return await card.locator(this.recycledCardName).textContent();
    }

    /**
     * Click restore on a recycled sprite
     */
    async restoreSprite(index: number): Promise<void> {
        const card = this.getSpriteCard(index);
        await card.hover();
        await card.locator(this.restoreButton).click();
        // Wait for the action to complete
        await this.page.waitForTimeout(1000);
    }

    /**
     * Click "Delete Forever" on a recycled sprite
     */
    async clickDeleteForeverSprite(index: number): Promise<void> {
        const card = this.getSpriteCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        await this.page.waitForSelector(this.deleteDialog, { state: "visible" });
    }

    // ===== Delete Dialog Methods =====

    /**
     * Check if the delete confirmation dialog is visible
     */
    async isDeleteDialogVisible(): Promise<boolean> {
        return await this.page.locator(this.deleteDialog).isVisible();
    }

    /**
     * Get the files listed for deletion in the preview
     */
    async getFilesToDeleteList(): Promise<string[]> {
        // Wait for the delete preview to load
        await this.page.waitForSelector(this.deletePreview, { state: "visible", timeout: 5000 });
        await this.page.waitForTimeout(500); // Wait for content to populate
        
        const fileItems = this.page.locator(this.filesToDelete);
        const count = await fileItems.count();
        const files: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await fileItems.nth(i).textContent();
            if (text) files.push(text.trim());
        }
        return files;
    }

    /**
     * Confirm the permanent delete action
     */
    async confirmPermanentDelete(): Promise<void> {
        // Find the Delete Forever button in the dialog footer
        const dialogFooter = this.page.locator(".p-dialog-footer");
        await expect(dialogFooter).toBeVisible({ timeout: 5000 });
        
        // The button has class p-button-danger and label "Delete Forever"
        const deleteButton = dialogFooter.locator(".p-button-danger");
        await expect(deleteButton).toBeVisible({ timeout: 5000 });
        
        // Wait for the button to be enabled (not disabled)
        await expect(deleteButton).toBeEnabled({ timeout: 5000 });
        
        console.log("[Delete] Found Delete Forever button, clicking...");
        
        // Regular click - should trigger React onClick properly
        await deleteButton.click();
        
        // Short wait to see if dialog closes quickly
        await this.page.waitForTimeout(2000);
        
        // Check if dialog is already closed
        const isStillVisible = await this.page.locator(this.deleteDialog).isVisible();
        if (!isStillVisible) {
            console.log("[Delete] Dialog closed successfully (quick)");
            return;
        }
        
        // Dialog still visible - try clicking via JavaScript
        console.log("[Delete] Dialog still visible, trying JS click...");
        await this.page.evaluate(() => {
            const button = document.querySelector('.p-dialog-footer .p-button-danger') as HTMLButtonElement;
            if (button) {
                button.click();
            }
        });
        
        console.log("[Delete] Clicked via JS, waiting for dialog to close...");
        
        // Wait for dialog to close - this may take time for API call
        try {
            await this.page.waitForSelector(this.deleteDialog, { 
                state: "hidden", 
                timeout: 40000 
            });
            console.log("[Delete] Dialog closed successfully");
        } catch (e) {
            // Check if there's an error toast
            const errorToast = this.page.locator(".p-toast-message-error");
            if (await errorToast.isVisible()) {
                const errorText = await errorToast.textContent();
                console.log(`[Delete] Error occurred: ${errorText}`);
                throw new Error(`Delete failed: ${errorText}`);
            }
            
            // Take screenshot for debugging
            await this.page.screenshot({ path: "test-results/delete-dialog-stuck.png" });
            console.log("[Delete] Dialog still visible after 30s, screenshot saved");
            throw e;
        }
        
        await this.page.waitForTimeout(1000);
    }

    /**
     * Cancel the delete dialog
     */
    async cancelDelete(): Promise<void> {
        await this.page.locator(this.cancelButton).click();
        await this.page.waitForSelector(this.deleteDialog, { state: "hidden" });
    }

    /**
     * Check if a model with specific name exists in the recycle bin
     */
    async hasModelWithName(name: string): Promise<boolean> {
        const section = this.page.locator(this.modelsSection);
        if (!(await section.isVisible())) return false;
        
        const cards = section.locator(this.recycledCard);
        const count = await cards.count();
        
        for (let i = 0; i < count; i++) {
            const cardName = await cards.nth(i).locator(this.recycledCardName).textContent();
            if (cardName?.includes(name)) return true;
        }
        return false;
    }

    /**
     * Find index of a model by name
     */
    async findModelIndexByName(name: string): Promise<number> {
        const section = this.page.locator(this.modelsSection);
        if (!(await section.isVisible())) return -1;
        
        const cards = section.locator(this.recycledCard);
        const count = await cards.count();
        
        for (let i = 0; i < count; i++) {
            const cardName = await cards.nth(i).locator(this.recycledCardName).textContent();
            if (cardName?.includes(name)) return i;
        }
        return -1;
    }
}
