import { Page, expect } from "@playwright/test";

/**
 * Page Object for the Upload History Page
 * Handles interactions with the history page that shows past uploads
 */
export class UploadHistoryPage {
    constructor(private page: Page) {}

    // Main container
    private readonly historyContainer = ".history-container";
    private readonly historyToolbar = ".history-toolbar";
    private readonly historyHeader = ".history-toolbar h2";
    private readonly refreshButton = ".history-toolbar button";
    
    // Loading state
    private readonly loadingIndicator = ".history-loading";
    
    // Empty state
    private readonly emptyState = ".history-empty";
    
    // History list
    private readonly historyList = ".history-list";
    
    // Batch selectors
    private readonly historyBatch = ".history-batch";
    private readonly historyBatchHeader = ".history-batch-header";
    private readonly historyBatchTitle = ".history-batch-title";
    private readonly historyBatchTimestamp = ".history-batch-timestamp";
    private readonly historyBatchToggle = ".history-batch-toggle";
    private readonly historyBatchItems = ".history-batch-items";
    
    // Item selectors
    private readonly historyItem = ".history-item";
    private readonly historyItemName = ".history-item-name";
    private readonly historyItemUploadedTo = ".history-item-uploaded-to";
    private readonly historyItemTimestamp = ".history-item-timestamp";
    private readonly historyItemExtIcon = ".history-item-ext-icon";
    private readonly historyItemExtName = ".history-item-ext-name";
    private readonly historyItemTypeIcon = ".history-item-type-icon";
    
    // Action buttons
    private readonly openModelButton = 'button[title="Open Model"]';
    private readonly openTextureSetButton = 'button[title="Open Texture Set"]';
    private readonly openPackButton = 'button[title="Open Pack"]';
    private readonly openProjectButton = 'button[title="Open Project"]';

    /**
     * Navigate to the Upload History page
     */
    async goto(): Promise<void> {
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
        // History is typically accessed via URL params
        await this.page.goto(`${baseUrl}/?leftTabs=history&activeLeft=history`);
        await this.waitForHistoryLoaded();
    }

    /**
     * Wait for the history page to finish loading
     */
    async waitForHistoryLoaded(): Promise<void> {
        // Wait for loading to disappear or list/empty to appear
        await this.page.waitForSelector(
            `${this.historyList}, ${this.emptyState}`,
            { state: "visible", timeout: 15000 }
        );
    }

    /**
     * Check if the history container is visible
     */
    async isVisible(): Promise<boolean> {
        return await this.page.locator(this.historyContainer).isVisible();
    }

    /**
     * Get the header text
     */
    async getHeaderText(): Promise<string | null> {
        return await this.page.locator(this.historyHeader).textContent();
    }

    /**
     * Click the refresh button
     */
    async refresh(): Promise<void> {
        const button = this.page.locator(this.refreshButton);
        await button.click();
        // Wait for refresh to complete
        await this.page.waitForTimeout(1000);
    }

    /**
     * Check if the empty state is displayed
     */
    async isEmptyStateVisible(): Promise<boolean> {
        return await this.page.locator(this.emptyState).isVisible();
    }

    /**
     * Check if there are any upload entries
     */
    async hasEntries(): Promise<boolean> {
        const count = await this.page.locator(this.historyItem).count();
        return count > 0;
    }

    // === Batch Methods ===

    /**
     * Get the number of batch groups
     */
    async getBatchCount(): Promise<number> {
        return await this.page.locator(this.historyBatch).count();
    }

    /**
     * Get batch by index
     */
    getBatch(index: number) {
        return this.page.locator(this.historyBatch).nth(index);
    }

    /**
     * Get the title of a batch (e.g., "Batch Upload - 3 files")
     */
    async getBatchTitle(index: number): Promise<string | null> {
        const batch = this.getBatch(index);
        return await batch.locator(this.historyBatchTitle).textContent();
    }

    /**
     * Get the timestamp of a batch
     */
    async getBatchTimestamp(index: number): Promise<string | null> {
        const batch = this.getBatch(index);
        return await batch.locator(this.historyBatchTimestamp).textContent();
    }

    /**
     * Check if a batch is collapsed
     */
    async isBatchCollapsed(index: number): Promise<boolean> {
        const batch = this.getBatch(index);
        const toggle = batch.locator(this.historyBatchToggle);
        const className = await toggle.getAttribute("class");
        return className?.includes("pi-chevron-right") ?? false;
    }

    /**
     * Toggle batch collapse/expand
     */
    async toggleBatch(index: number): Promise<void> {
        const batch = this.getBatch(index);
        const header = batch.locator(this.historyBatchHeader);
        await header.click();
    }

    /**
     * Get number of items in a batch
     */
    async getBatchItemCount(index: number): Promise<number> {
        const batch = this.getBatch(index);
        return await batch.locator(this.historyItem).count();
    }

    // === Item Methods ===

    /**
     * Get total number of history items (across all batches)
     */
    async getTotalItemCount(): Promise<number> {
        return await this.page.locator(this.historyItem).count();
    }

    /**
     * Get a history item by index
     */
    getItem(index: number) {
        return this.page.locator(this.historyItem).nth(index);
    }

    /**
     * Get the filename of an item
     */
    async getItemFilename(index: number): Promise<string | null> {
        const item = this.getItem(index);
        return await item.locator(this.historyItemName).textContent();
    }

    /**
     * Get the "Uploaded to" text of an item
     */
    async getItemUploadedTo(index: number): Promise<string | null> {
        const item = this.getItem(index);
        return await item.locator(this.historyItemUploadedTo).textContent();
    }

    /**
     * Get the timestamp of an item
     */
    async getItemTimestamp(index: number): Promise<string | null> {
        const item = this.getItem(index);
        return await item.locator(this.historyItemTimestamp).textContent();
    }

    /**
     * Get the extension name displayed for an item
     */
    async getItemExtensionName(index: number): Promise<string | null> {
        const item = this.getItem(index);
        return await item.locator(this.historyItemExtName).textContent();
    }

    // === Navigation Actions ===

    /**
     * Check if the "Open Model" button is visible for an item
     */
    async isOpenModelButtonVisible(index: number): Promise<boolean> {
        const item = this.getItem(index);
        return await item.locator(this.openModelButton).isVisible();
    }

    /**
     * Click the "Open Model" button for an item
     */
    async clickOpenModel(index: number): Promise<void> {
        const item = this.getItem(index);
        const button = item.locator(this.openModelButton);
        await expect(button).toBeVisible();
        await button.click();
        // Wait for tab navigation
        await this.page.waitForTimeout(1000);
    }

    /**
     * Check if the "Open Texture Set" button is visible for an item
     */
    async isOpenTextureSetButtonVisible(index: number): Promise<boolean> {
        const item = this.getItem(index);
        return await item.locator(this.openTextureSetButton).isVisible();
    }

    /**
     * Click the "Open Texture Set" button for an item
     */
    async clickOpenTextureSet(index: number): Promise<void> {
        const item = this.getItem(index);
        const button = item.locator(this.openTextureSetButton);
        await expect(button).toBeVisible();
        await button.click();
        await this.page.waitForTimeout(1000);
    }

    /**
     * Check if the "Open Pack" button is visible for an item
     */
    async isOpenPackButtonVisible(index: number): Promise<boolean> {
        const item = this.getItem(index);
        return await item.locator(this.openPackButton).isVisible();
    }

    /**
     * Click the "Open Pack" button for an item
     */
    async clickOpenPack(index: number): Promise<void> {
        const item = this.getItem(index);
        const button = item.locator(this.openPackButton);
        await expect(button).toBeVisible();
        await button.click();
        await this.page.waitForTimeout(1000);
    }

    /**
     * Find history item by filename
     */
    async findItemByFilename(filename: string): Promise<number> {
        const count = await this.getTotalItemCount();
        for (let i = 0; i < count; i++) {
            const itemFilename = await this.getItemFilename(i);
            if (itemFilename?.includes(filename)) {
                return i;
            }
        }
        return -1;
    }
}
