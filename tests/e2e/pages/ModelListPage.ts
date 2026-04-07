import { Page, expect, Locator } from "@playwright/test";
import { navigateToAppClean } from "../helpers/navigation-helper";

export class ModelListPage {
    constructor(private page: Page) {}

    private async ensureSearchOpen(): Promise<void> {
        const searchPanel = this.page.locator("#model-grid-search-panel");
        const isVisible = await searchPanel.isVisible().catch(() => false);

        if (isVisible) {
            return;
        }

        const searchButton = this.page.getByRole("button", {
            name: /^search$/i,
        });
        await searchButton.click();
        await searchPanel.waitFor({ state: "visible", timeout: 5000 });
    }

    private async ensureFiltersOpen(): Promise<void> {
        const filterPanel = this.page.locator("#model-grid-filters-panel");
        const isVisible = await filterPanel.isVisible().catch(() => false);

        if (isVisible) {
            return;
        }

        const filtersButton = this.page.getByRole("button", {
            name: /^filters$/i,
        });
        await filtersButton.click();
        await filterPanel.waitFor({ state: "visible", timeout: 5000 });
    }

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

    async expectModelVisible(modelName: string, modelId?: number) {
        const modelCard = modelId
            ? this.page.locator(`[data-model-id="${modelId}"]`).first()
            : this.page
                  .locator(
                      ".model-card, .model-grid-item, .p-card, [class*='model-card'], [class*='model-list-item']",
                  )
                  .filter({ hasText: modelName })
                  .first();

        await expect(async () => {
            const visible = await modelCard.isVisible().catch(() => false);
            if (!visible) {
                await this.page.reload({ waitUntil: "domcontentloaded" });
                await this.page.waitForSelector(
                    ".model-card, .model-grid, .no-results, .empty-state",
                    {
                        state: "visible",
                        timeout: 15000,
                    },
                );
            }

            await expect(modelCard).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 60000, intervals: [1000, 2000, 5000] });
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
     * Get active filter chips in the current filter panel.
     * The current UI renders active pack/project selections as PrimeReact
     * multiselect tokens inside the panel rather than in a separate summary bar.
     */
    getFilterTokens(): Locator {
        return this.page.locator(
            "#model-grid-filters-panel .p-multiselect-token",
        );
    }

    /**
     * Filter the model list by pack name using the filter bar multiselect.
     * Waits for the "Filter by Packs" dropdown to appear (packs query may be slow),
     * then retries with reload if the specific pack isn't listed.
     */
    async filterByPack(packName: string): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            await this.ensureFiltersOpen();

            // Wait for the Packs multiselect to appear (packs query must complete)
            const packsMultiselect = this.page.locator(
                '#model-grid-filters-panel .p-multiselect:has-text("Filter by Packs")',
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
            await this.ensureFiltersOpen();

            const projectsMultiselect = this.page.locator(
                '#model-grid-filters-panel .p-multiselect:has-text("Filter by Projects")',
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
        await this.ensureFiltersOpen();

        const clearButton = this.page.locator(
            "#model-grid-filters-panel .list-filters-clear",
        );
        if (await clearButton.isVisible().catch(() => false)) {
            await clearButton.click();
            await this.page.waitForLoadState("domcontentloaded");
        } else {
            const packsClear = this.page
                .locator("#model-grid-filters-panel .p-multiselect")
                .first()
                .locator(".p-multiselect-clear-icon");
            if (await packsClear.isVisible().catch(() => false)) {
                await packsClear.click();
            }
            const projectsClear = this.page
                .locator("#model-grid-filters-panel .p-multiselect")
                .nth(1)
                .locator(".p-multiselect-clear-icon");
            if (await projectsClear.isVisible().catch(() => false)) {
                await projectsClear.click();
            }
            await this.page.waitForLoadState("domcontentloaded");
        }
    }

    async enableConceptArtFilter(): Promise<void> {
        await this.ensureFiltersOpen();

        const filterToggle = this.page.locator(
            '.models-filter-switch:has-text("Concept art") .p-inputswitch',
        );
        await filterToggle.waitFor({ state: "visible", timeout: 10000 });

        const responsePromise = this.page.waitForResponse(
            (response) => {
                const url = response.url();
                return (
                    url.includes("/models?") &&
                    url.includes("hasConceptImages=true") &&
                    response.status() >= 200 &&
                    response.status() < 300
                );
            },
            { timeout: 15000 },
        );

        await filterToggle.click();
        await responsePromise;
        await this.page.waitForLoadState("domcontentloaded");
    }

    async searchForModels(text: string): Promise<void> {
        await this.ensureSearchOpen();

        const searchInput = this.page.locator(
            '#model-grid-search-panel input[placeholder="Search models..."], #model-grid-search-panel .search-input',
        );
        await expect(searchInput).toBeVisible({ timeout: 5000 });
        await searchInput.fill(text);
    }
}
