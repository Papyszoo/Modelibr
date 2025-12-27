import { Page, expect } from "@playwright/test";

/**
 * Page Object for the Upload Progress Window
 * Handles interactions with the floating upload progress window that appears during file uploads
 */
export class UploadProgressPage {
    constructor(private page: Page) {}

    // Selectors
    private readonly uploadWindow = ".upload-progress-window";
    private readonly uploadItem = ".upload-item";
    private readonly uploadItemName = ".upload-item-name";
    private readonly uploadItemSize = ".upload-item-size";
    private readonly uploadItemExtIcon = ".upload-item-ext-icon";
    private readonly uploadItemExtName = ".upload-item-ext-name";
    private readonly uploadItemProgress = ".upload-item-progress";
    private readonly uploadItemCompleted = ".upload-item-completed";
    private readonly uploadItemError = ".upload-item-error";
    private readonly openInTabButton = 'button[title="Open in new tab"]';
    private readonly removeButton = 'button[title="Remove"]';
    private readonly clearCompletedButton = 'button:has-text("Clear Completed")';
    
    // Batch selectors
    private readonly batchGroup = ".upload-batch";
    private readonly batchHeader = ".upload-batch-header";
    private readonly batchTitle = ".upload-batch-title";
    private readonly batchStatus = ".upload-batch-status";
    private readonly batchProgress = ".upload-batch-progress";
    private readonly batchToggle = ".upload-batch-toggle";
    private readonly batchItems = ".upload-batch-items";
    private readonly batchRemoveButton = ".upload-batch-actions button";

    // Summary selectors
    private readonly uploadSummary = ".upload-summary";
    private readonly uploadSummaryText = ".upload-summary-text";
    private readonly uploadSummaryProgress = ".upload-summary-progress";

    /**
     * Wait for the upload progress window to be visible
     */
    async waitForWindowVisible(): Promise<void> {
        await this.page.waitForSelector(this.uploadWindow, {
            state: "visible",
            timeout: 10000,
        });
    }

    /**
     * Check if the upload progress window is visible
     */
    async isWindowVisible(): Promise<boolean> {
        return await this.page.locator(this.uploadWindow).isVisible();
    }

    /**
     * Wait for an upload to complete by filename
     */
    async waitForUploadComplete(filename: string, timeout: number = 30000): Promise<void> {
        const item = this.page.locator(this.uploadItem).filter({
            has: this.page.locator(this.uploadItemName, { hasText: filename }),
        });
        
        // Wait for the item to have "completed" status class
        await expect(item).toHaveClass(/upload-item-completed/, { timeout });
    }

    /**
     * Get the upload item locator by filename
     */
    getUploadItem(filename: string) {
        return this.page.locator(this.uploadItem).filter({
            has: this.page.locator(this.uploadItemName, { hasText: filename }),
        });
    }

    /**
     * Check if a file is displayed in the upload window
     */
    async isFileDisplayed(filename: string): Promise<boolean> {
        const item = this.getUploadItem(filename);
        return await item.isVisible();
    }

    /**
     * Get the extension icon class for a file
     */
    async getExtensionIcon(filename: string): Promise<string | null> {
        const item = this.getUploadItem(filename);
        const icon = item.locator(this.uploadItemExtIcon);
        return await icon.getAttribute("class");
    }

    /**
     * Get the extension name displayed for a file
     */
    async getExtensionName(filename: string): Promise<string | null> {
        const item = this.getUploadItem(filename);
        const extName = item.locator(this.uploadItemExtName);
        return await extName.textContent();
    }

    /**
     * Check if the "Open in Tab" button is visible for a file
     */
    async isOpenInTabButtonVisible(filename: string): Promise<boolean> {
        const item = this.getUploadItem(filename);
        const button = item.locator(this.openInTabButton);
        return await button.isVisible();
    }

    /**
     * Click the "Open in Tab" button for a file
     */
    async clickOpenInTab(filename: string): Promise<void> {
        const item = this.getUploadItem(filename);
        const button = item.locator(this.openInTabButton);
        await expect(button).toBeVisible();
        await button.click();
        // Wait for navigation/URL change
        await this.page.waitForTimeout(500);
    }

    /**
     * Get the upload status for a file (from class name)
     */
    async getUploadStatus(filename: string): Promise<string> {
        const item = this.getUploadItem(filename);
        const className = await item.getAttribute("class");
        if (className?.includes("upload-item-completed")) return "completed";
        if (className?.includes("upload-item-error")) return "error";
        if (className?.includes("upload-item-uploading")) return "uploading";
        return "pending";
    }

    /**
     * Click the "Clear Completed" button
     */
    async clickClearCompleted(): Promise<void> {
        const button = this.page.locator(this.clearCompletedButton);
        await expect(button).toBeVisible();
        await button.click();
    }

    /**
     * Remove an individual upload by filename
     */
    async removeUpload(filename: string): Promise<void> {
        const item = this.getUploadItem(filename);
        const button = item.locator(this.removeButton);
        await button.click();
    }

    // === Batch Methods ===

    /**
     * Get the number of batch groups displayed
     */
    async getBatchCount(): Promise<number> {
        return await this.page.locator(this.batchGroup).count();
    }

    /**
     * Get batch group by index (0-based)
     */
    getBatch(index: number) {
        return this.page.locator(this.batchGroup).nth(index);
    }

    /**
     * Get the title text of a batch (e.g., "Batch Upload - 3 files")
     */
    async getBatchTitle(index: number): Promise<string | null> {
        const batch = this.getBatch(index);
        const title = batch.locator(this.batchTitle);
        return await title.textContent();
    }

    /**
     * Get the status text of a batch
     */
    async getBatchStatus(index: number): Promise<string | null> {
        const batch = this.getBatch(index);
        const status = batch.locator(this.batchStatus);
        return await status.textContent();
    }

    /**
     * Check if a batch is collapsed
     */
    async isBatchCollapsed(index: number): Promise<boolean> {
        const batch = this.getBatch(index);
        const toggle = batch.locator(this.batchToggle);
        const className = await toggle.getAttribute("class");
        return className?.includes("pi-chevron-right") ?? false;
    }

    /**
     * Toggle batch collapse/expand
     */
    async toggleBatch(index: number): Promise<void> {
        const batch = this.getBatch(index);
        const header = batch.locator(this.batchHeader);
        await header.click();
    }

    /**
     * Check if batch items are visible (expanded)
     */
    async areBatchItemsVisible(index: number): Promise<boolean> {
        const batch = this.getBatch(index);
        const items = batch.locator(this.batchItems);
        return await items.isVisible();
    }

    /**
     * Get the number of files in a batch
     */
    async getBatchFileCount(index: number): Promise<number> {
        const batch = this.getBatch(index);
        return await batch.locator(this.uploadItem).count();
    }

    /**
     * Remove an entire batch
     */
    async removeBatch(index: number): Promise<void> {
        const batch = this.getBatch(index);
        const removeBtn = batch.locator(this.batchRemoveButton);
        await removeBtn.click();
    }

    // === Summary Methods ===

    /**
     * Get the summary text (e.g., "Uploading 3 files..." or "2 completed")
     */
    async getSummaryText(): Promise<string | null> {
        return await this.page.locator(this.uploadSummaryText).textContent();
    }

    /**
     * Get the total upload count from window
     */
    async getTotalUploadCount(): Promise<number> {
        return await this.page.locator(this.uploadItem).count();
    }
}
