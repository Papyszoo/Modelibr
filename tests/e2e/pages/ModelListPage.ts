import { Page, expect, Locator } from "@playwright/test";
import { navigateToAppClean } from "../helpers/navigation-helper";

export class ModelListPage {
    constructor(private page: Page) {}

    async goto() {
        // Navigate with clean state — default tab is modelList
        await navigateToAppClean(this.page);

        // Wait for the model list content to be visible
        await this.page.waitForSelector(
            ".model-card, .no-results, .empty-state",
            {
                state: "visible",
                timeout: 10000,
            },
        );
    }

    async uploadModel(filePath: string, keepWindowOpen: boolean = false) {
        // Wait for page to be fully stable before uploading
        // This prevents race conditions with page refresh that cause SignalR to miss notifications

        // 1. Wait for load state
        await this.page.waitForLoadState("domcontentloaded", {
            timeout: 10000,
        });

        // 2. Wait for load state
        await this.page.waitForLoadState("load", { timeout: 15000 });

        // 3. Ensure model grid is fully rendered
        await this.page
            .waitForSelector(
                ".model-card, .no-results, .empty-state, .model-grid",
                {
                    state: "visible",
                    timeout: 10000,
                },
            )
            .catch(() => {
                console.log(
                    "[Upload] Model grid selector timeout, proceeding anyway",
                );
            });

        // 4. Wait for React hydration and any initial data fetching to complete
        // This is critical to prevent the "upload too fast" race condition
        // where React re-renders after upload, causing SignalR reconnection
        console.log("[Upload] Waiting for page to fully stabilize...");
        await this.page.waitForTimeout(2000);

        const fileChooserPromise = this.page.waitForEvent("filechooser");

        // Find the upload button by aria-label
        const uploadButton = this.page.getByLabel("Upload models");
        await expect(uploadButton).toBeVisible({ timeout: 10000 });
        await uploadButton.click();

        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePath);

        // Wait for upload to complete in the side panel
        // We look for "completed" text in the summary text element
        await expect(
            this.page
                .locator(".upload-summary-text")
                .getByText(/\d+ completed/i),
        ).toBeVisible({ timeout: 30000 });

        // Ensure we don't match "0 completed"
        await expect(async () => {
            const text = await this.page
                .locator(".upload-summary-text")
                .textContent();
            const completedMatch = text?.match(/(\d+) completed/i);
            const count = completedMatch ? parseInt(completedMatch[1], 10) : 0;
            expect(count).toBeGreaterThan(0);
        }).toPass({ timeout: 30000 });

        // Optionally close the upload progress window
        if (!keepWindowOpen) {
            const closeButton = this.page
                .locator(
                    '#upload-progress-window button[aria-label="Close"], #upload-progress-window .pi-times',
                )
                .first();
            if (
                await closeButton
                    .waitFor({ state: "visible", timeout: 1000 })
                    .then(() => true)
                    .catch(() => false)
            ) {
                await closeButton.click();
                // Wait for window to disappear
                await expect(
                    this.page.locator("#upload-progress-window"),
                ).not.toBeVisible();
            }
        }
    }

    /**
     * Upload multiple model files at once (batch upload)
     * Does NOT wait for completion or close the window - allows test to verify upload state
     */
    async uploadMultipleModels(filePaths: string[]) {
        const fileChooserPromise = this.page.waitForEvent("filechooser");

        // Find the upload button by aria-label
        const uploadButton = this.page.getByLabel("Upload models");
        await expect(uploadButton).toBeVisible({ timeout: 10000 });
        await uploadButton.click();

        const fileChooser = await fileChooserPromise;
        // Set multiple files at once - this triggers batch upload
        await fileChooser.setFiles(filePaths);

        console.log(
            `[Upload] Started batch upload of ${filePaths.length} files`,
        );
    }

    async expectModelStatus(modelName: string, status: string) {
        const nameWithoutExt = modelName.split(".").slice(0, -1).join(".");
        // Try multiple possible selectors for the model item
        const modelItem = this.page
            .locator(
                ".model-card, .model-grid-item, .p-card, [class*='model']",
                {
                    hasText: nameWithoutExt,
                },
            )
            .first();
        await expect(modelItem.getByText(status)).toBeVisible({
            timeout: 60000,
        });
    }

    async expectModelVisible(modelName: string) {
        await expect(this.page.getByText(modelName).first()).toBeVisible({
            timeout: 30000,
        });
    }

    async openModel(modelName: string) {
        const nameWithoutExt =
            modelName.split(".").slice(0, -1).join(".") || modelName;

        // Navigate to model list first
        await this.goto();

        // Find the model card container that contains the model name
        // The card has cursor=pointer and contains both the thumbnail and the name
        const modelCard = this.page
            .locator('[class*="model-card"], [class*="model-list-item"]')
            .filter({ hasText: nameWithoutExt })
            .first();

        // If no specific card class, try finding clickable container with the text
        const fallbackCard = this.page
            .locator('div[style*="cursor"]')
            .filter({ hasText: nameWithoutExt })
            .first();

        // Try the model card first, then fallback
        const cardToClick =
            (await modelCard.count()) > 0 ? modelCard : fallbackCard;

        if ((await cardToClick.count()) === 0) {
            // Last resort: find the image with alt text matching the model
            const imgCard = this.page
                .locator(`img[alt="${nameWithoutExt}"]`)
                .locator("..");
            await imgCard.click();
        } else {
            await cardToClick.click();
        }

        // Wait for the model viewer to load (canvas element)
        await this.page.waitForSelector("canvas", {
            state: "visible",
            timeout: 30000,
        });
    }

    /**
     * Get a model card locator by name or ID
     */
    getModelCard(name: string, id?: number): Locator {
        if (id) {
            return this.page.locator(`.model-card[data-model-id="${id}"]`);
        }
        return this.page.locator(`.model-card:has-text("${name}")`).first();
    }

    /**
     * Get the filter token/chip locators in the filter bar
     */
    getFilterTokens(): Locator {
        return this.page.locator(".filter-bar .p-multiselect-token");
    }

    /**
     * Filter the model list by pack name using the filter bar multiselect.
     * Waits for the "Filter by Packs" dropdown to appear (packs query may be slow),
     * then retries with reload if the specific pack isn't listed.
     */
    async filterByPack(packName: string): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            // Wait for the Packs multiselect to appear (packs query must complete)
            const packsMultiselect = this.page.locator(
                '.filter-bar .p-multiselect:has(.p-placeholder:has-text("Packs"))',
            );
            try {
                await packsMultiselect.waitFor({
                    state: "visible",
                    timeout: 10000,
                });
            } catch {
                console.log(
                    `[Retry] Packs multiselect not visible (attempt ${attempt + 1}/3), reloading...`,
                );
                await this.page.reload({ waitUntil: "domcontentloaded" });
                await this.page.waitForSelector(
                    ".model-card, .no-results, .empty-state",
                    { state: "visible", timeout: 10000 },
                );
                continue;
            }

            await packsMultiselect.click();
            await this.page
                .locator(".p-multiselect-panel")
                .waitFor({ state: "visible", timeout: 5000 });

            const packOption = this.page.locator(
                `.p-multiselect-panel .p-multiselect-item:has-text("${packName}")`,
            );

            if (await packOption.isVisible().catch(() => false)) {
                await packOption.click();
                await this.page.keyboard.press("Escape");
                await this.page
                    .locator(".p-multiselect-panel")
                    .waitFor({ state: "hidden", timeout: 5000 });
                return;
            }

            // Pack not in dropdown yet — close panel, reload page, retry
            await this.page.keyboard.press("Escape");
            await this.page
                .locator(".p-multiselect-panel")
                .waitFor({ state: "hidden", timeout: 5000 });
            console.log(
                `[Retry] Pack "${packName}" not in dropdown (attempt ${attempt + 1}/3), reloading...`,
            );
            await this.page.reload({ waitUntil: "domcontentloaded" });
            await this.page.waitForSelector(
                ".model-card, .no-results, .empty-state",
                { state: "visible", timeout: 10000 },
            );
        }

        throw new Error(
            `Pack "${packName}" not found in filter dropdown after 3 attempts`,
        );
    }

    /**
     * Filter the model list by project name using the filter bar multiselect.
     * Retries with a page reload if the project isn't in the dropdown yet.
     */
    async filterByProject(projectName: string): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            const projectsMultiselect = this.page.locator(
                '.filter-bar .p-multiselect:has([class*="placeholder"]:has-text("Projects"))',
            );
            await projectsMultiselect.click();
            await this.page
                .locator(".p-multiselect-panel")
                .waitFor({ state: "visible", timeout: 5000 });

            const projectOption = this.page.locator(
                `.p-multiselect-panel .p-multiselect-item:has-text("${projectName}")`,
            );

            if (await projectOption.isVisible().catch(() => false)) {
                await projectOption.click();
                await this.page.keyboard.press("Escape");
                await this.page
                    .locator(".p-multiselect-panel")
                    .waitFor({ state: "hidden", timeout: 5000 });
                return;
            }

            await this.page.keyboard.press("Escape");
            await this.page
                .locator(".p-multiselect-panel")
                .waitFor({ state: "hidden", timeout: 5000 });
            console.log(
                `[Retry] Project "${projectName}" not in dropdown (attempt ${attempt + 1}/3), reloading...`,
            );
            await this.page.reload({ waitUntil: "domcontentloaded" });
            await this.page.waitForSelector(
                ".model-card, .no-results, .empty-state",
                { state: "visible", timeout: 10000 },
            );
        }

        throw new Error(
            `Project "${projectName}" not found in filter dropdown after 3 attempts`,
        );
    }

    /**
     * Clear all active filters in the filter bar
     */
    async clearFilters(): Promise<void> {
        const clearButton = this.page.locator(".clear-filters-btn");
        if (await clearButton.isVisible()) {
            await clearButton.click();
            await this.page.waitForLoadState("domcontentloaded");
        } else {
            const packsClear = this.page
                .locator(".filter-bar .p-multiselect")
                .first()
                .locator(".p-multiselect-clear-icon");
            if (await packsClear.isVisible()) {
                await packsClear.click();
            }
            const projectsClear = this.page
                .locator(".filter-bar .p-multiselect")
                .nth(1)
                .locator(".p-multiselect-clear-icon");
            if (await projectsClear.isVisible()) {
                await projectsClear.click();
            }
            await this.page.waitForLoadState("domcontentloaded");
        }
    }
}
