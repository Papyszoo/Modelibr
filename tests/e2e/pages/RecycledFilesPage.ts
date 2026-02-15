import { Page, expect } from "@playwright/test";
import { navigateToTab } from "../helpers/navigation-helper";

/**
 * Page Object for the Recycled Files Page (Recycle Bin)
 */
export class RecycledFilesPage {
    constructor(private page: Page) {}

    // Main container selectors
    private readonly recycledFilesList = ".recycled-files-list";
    private readonly recycledFilesHeader = ".recycled-files-header h2";
    private readonly refreshButton =
        ".recycled-files-header .p-button-outlined";
    private readonly emptyState = ".recycled-files-empty";
    private readonly loading = ".recycled-files-loading";

    // Section selectors
    private readonly modelsSection = ".recycled-section:has(.pi-box)";
    private readonly modelVersionsSection = ".recycled-section:has(.pi-clone)";
    private readonly textureSetsSection = ".recycled-section:has(.pi-images)";
    private readonly spritesSection =
        ".recycled-section[data-section='sprites']";

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
     * Navigate to the Recycled Files page via UI interaction
     */
    async goto(): Promise<void> {
        await navigateToTab(this.page, "recycledFiles");
        await this.waitForLoaded();
    }

    /**
     * Wait for the page to finish loading
     */
    async waitForLoaded(): Promise<void> {
        // Wait for loading to finish - either content or empty state
        await this.page.waitForSelector(
            `${this.recycledFilesList}:not(:has(${this.loading}))`,
            { state: "visible", timeout: 15000 },
        );
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
        return this.page
            .locator(this.modelsSection)
            .locator(this.recycledCard)
            .nth(index);
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
        // Wait for the card to disappear after restore
        await card.waitFor({ state: "hidden", timeout: 10000 });
    }

    /**
     * Click "Delete Forever" on a recycled model
     */
    async clickDeleteForeverModel(index: number): Promise<void> {
        const card = this.getModelCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        // Wait for dialog to appear
        await this.page.waitForSelector(this.deleteDialog, {
            state: "visible",
        });
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
        return this.page
            .locator(this.modelVersionsSection)
            .locator(this.recycledCard)
            .nth(index);
    }

    /**
     * Click restore on a recycled model version
     */
    async restoreModelVersion(index: number): Promise<void> {
        const card = this.getModelVersionCard(index);
        await card.hover();
        await card.locator(this.restoreButton).click();
        await card.waitFor({ state: "hidden", timeout: 10000 });
    }

    /**
     * Find a recycled model version by its parent model ID
     * @returns The index of the version card, or -1 if not found
     */
    async findModelVersionByModelId(modelId: number): Promise<number> {
        const section = this.page.locator(this.modelVersionsSection);
        if (!(await section.isVisible())) return -1;

        const cards = section.locator(this.recycledCard);
        const count = await cards.count();

        for (let i = 0; i < count; i++) {
            const card = cards.nth(i);
            const cardModelId = await card.getAttribute("data-model-id");
            if (cardModelId && parseInt(cardModelId) === modelId) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Restore a recycled model version by its parent model ID
     * @returns true if restored, false if no version found for the model
     */
    async restoreModelVersionByModelId(modelId: number): Promise<boolean> {
        const index = await this.findModelVersionByModelId(modelId);
        if (index < 0) {
            console.log(
                `[RecycledFiles] No recycled version found for model ${modelId}`,
            );
            return false;
        }
        await this.restoreModelVersion(index);
        return true;
    }

    /**
     * Click "Delete Forever" on a recycled model version
     */
    async clickDeleteForeverModelVersion(index: number): Promise<void> {
        const card = this.getModelVersionCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        await this.page.waitForSelector(this.deleteDialog, {
            state: "visible",
        });
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
        return this.page
            .locator(this.textureSetsSection)
            .locator(this.recycledCard)
            .nth(index);
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
        await card.waitFor({ state: "hidden", timeout: 10000 });
    }

    /**
     * Click "Delete Forever" on a recycled texture set
     */
    async clickDeleteForeverTextureSet(index: number): Promise<void> {
        const card = this.getTextureSetCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        await this.page.waitForSelector(this.deleteDialog, {
            state: "visible",
        });
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
        return this.page
            .locator(this.spritesSection)
            .locator(this.recycledCard)
            .nth(index);
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
        // Wait for the card to disappear after restore
        await card.waitFor({ state: "hidden", timeout: 10000 });
    }

    /**
     * Click "Delete Forever" on a recycled sprite
     */
    async clickDeleteForeverSprite(index: number): Promise<void> {
        const card = this.getSpriteCard(index);
        await card.hover();
        await card.locator(this.deleteForeverButton).click();
        await this.page.waitForSelector(this.deleteDialog, {
            state: "visible",
        });
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
        await this.page.waitForSelector(this.deletePreview, {
            state: "visible",
            timeout: 5000,
        });
        // Wait for file list items to populate
        // Optional: file items may not have populated yet
        await this.page
            .locator(this.filesToDelete)
            .first()
            .waitFor({ state: "visible", timeout: 5000 })
            .catch(() => {});

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
        // Use accessible role selector - more reliable than CSS class selectors
        // which can match dormant PrimeReact ConfirmDialog buttons
        const deleteButton = this.page.getByRole("button", {
            name: "Delete Forever",
        });
        await expect(deleteButton).toBeVisible({ timeout: 5000 });
        await expect(deleteButton).toBeEnabled({ timeout: 5000 });

        console.log("[Delete] Found Delete Forever button, clicking...");

        // Set up response listener BEFORE clicking to catch the API call
        const responsePromise = this.page
            .waitForResponse(
                (resp) =>
                    resp.request().method() === "DELETE" &&
                    resp.url().includes("/permanent"),
                { timeout: 15000 },
            )
            .catch(() => null);

        // Click the button
        await deleteButton.click();

        // Wait for the API response to confirm the delete actually executed
        let response = await responsePromise;

        if (!response) {
            // Playwright click didn't trigger the React handler — retry with native DOM click
            console.log(
                "[Delete] API not called by Playwright click, retrying with JS click...",
            );
            const retryResponsePromise = this.page
                .waitForResponse(
                    (resp) =>
                        resp.request().method() === "DELETE" &&
                        resp.url().includes("/permanent"),
                    { timeout: 15000 },
                )
                .catch(() => null);

            await this.page.evaluate(() => {
                const footers = document.querySelectorAll(".p-dialog-footer");
                for (const footer of footers) {
                    const btn = Array.from(
                        footer.querySelectorAll("button"),
                    ).find(
                        (b) =>
                            b.textContent?.includes("Delete Forever") &&
                            b.offsetParent !== null,
                    );
                    if (btn) {
                        btn.click();
                        return;
                    }
                }
            });

            response = await retryResponsePromise;
            if (!response) {
                throw new Error(
                    "Permanent delete API call was never made despite clicking Delete Forever button",
                );
            }
        }

        console.log(`[Delete] API response: ${response.status()}`);

        // Wait for dialog to close
        try {
            await this.page.waitForSelector(this.deleteDialog, {
                state: "hidden",
                timeout: 10000,
            });
        } catch {
            // Dialog might already be closed
        }

        console.log("[Delete] Permanent delete confirmed successfully");
        // Wait for the page to reflect the deletion
        await this.page.waitForLoadState("domcontentloaded");
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
            const cardName = await cards
                .nth(i)
                .locator(this.recycledCardName)
                .textContent();
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
            const cardName = await cards
                .nth(i)
                .locator(this.recycledCardName)
                .textContent();
            if (cardName?.includes(name)) return i;
        }
        return -1;
    }
}
