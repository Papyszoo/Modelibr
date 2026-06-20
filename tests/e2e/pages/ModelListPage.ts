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

    /** Toggle the "Animated" only filter on. */
    async enableAnimatedFilter(): Promise<void> {
        await this.ensureFiltersOpen();
        const toggle = this.page.getByTestId("animated-only-filter");
        await toggle.scrollIntoViewIfNeeded();
        await toggle.click();
    }

    /** Set the minimum triangle-count filter (clears it when value is null). */
    async setMinTriangleCount(value: number | null): Promise<void> {
        await this.ensureFiltersOpen();
        // PrimeReact InputNumber forwards data-testid to a wrapper, so target
        // the inner <input> (matching whichever element carries the testid).
        const input = this.page
            .locator(
                'input[data-testid="min-triangle-filter"], [data-testid="min-triangle-filter"] input',
            )
            .first();
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await input.fill(value === null ? "" : String(value));
        // Commit the value so PrimeReact's onValueChange fires.
        await input.press("Enter");
    }

    /**
     * Open the model category manager. Mirrors the texture-set flow: the
     * toolbar panel is `pointer-events: none` until it has `.is-open`, so we
     * gate on that class before clicking the picker trigger / manage button.
     */
    async openCategoryManager(): Promise<void> {
        const openPanel = this.page.locator(
            "#model-grid-filters-panel.is-open",
        );
        if (!(await openPanel.count())) {
            await this.page
                .getByRole("button", { name: /^filters$/i })
                .click();
        }
        await openPanel.waitFor({ state: "visible", timeout: 5000 });

        const panel = this.page.locator("#model-grid-filters-panel");
        const trigger = panel.locator(
            'button[aria-label="Filter by model categories"]',
        );
        if (await trigger.count()) {
            await trigger.scrollIntoViewIfNeeded();
            await trigger.click();
            const overlay = this.page.locator(".p-overlaypanel");
            await overlay.waitFor({ state: "visible" });
            await overlay
                .locator('button[aria-label="Manage categories"]')
                .click();
        } else {
            await panel
                .getByRole("button", { name: "Manage categories" })
                .click();
        }
        await this.page
            .getByRole("dialog", { name: "Manage Model Categories" })
            .waitFor({ state: "visible" });
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

    /** Assign a model to a category via the right-click "Change category". */
    async changeCategoryViaContextMenu(
        card: Locator,
        categoryName: string,
    ): Promise<void> {
        await card.click({ button: "right" });
        await this.page.waitForSelector(".p-contextmenu", { timeout: 5000 });
        await this.page
            .locator(
                '.p-contextmenu .p-menuitem:has-text("Change category") .p-menuitem-link',
            )
            .click();

        const dialog = this.page.getByRole("dialog", {
            name: "Change Category",
        });
        await dialog.waitFor({ state: "visible" });
        await dialog
            .locator(".model-category-tree .p-treenode-content", {
                hasText: categoryName,
            })
            .first()
            .click();
        await dialog.getByRole("button", { name: "Move" }).click();
        await dialog.waitFor({ state: "hidden" });
    }

    /** Filter the model list by a category via the filter-picker popover. */
    async filterByCategory(categoryName: string): Promise<void> {
        await this.ensureFiltersOpen();
        const trigger = this.page
            .locator("#model-grid-filters-panel")
            .locator('button[aria-label="Filter by model categories"]');
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const overlay = this.page.locator(".p-overlaypanel");
        await overlay.waitFor({ state: "visible" });
        await overlay
            .locator(".category-tree .p-treenode-content", {
                hasText: categoryName,
            })
            .first()
            .locator(".p-checkbox")
            .click();
        await this.page.keyboard.press("Escape");
        await overlay.waitFor({ state: "hidden" });
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
     * Waits for the "Packs" dropdown to appear (packs query may be slow),
     * then retries with reload if the specific pack isn't listed.
     */
    async filterByPack(packName: string): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            await this.ensureFiltersOpen();

            // Wait for the Packs multiselect to appear (packs query must complete)
            const packsMultiselect = this.page.locator(
                '#model-grid-filters-panel .p-multiselect:has-text("Packs")',
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
                '#model-grid-filters-panel .p-multiselect:has-text("Projects")',
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
     * Select multiple packs in a single open of the Packs multiselect.
     *
     * `filterByPack` uses `:has-text("Packs")` to locate the multiselect,
     * but PrimeReact's `display="chip"` mode replaces the placeholder
     * text with selected-item chips. Calling `filterByPack` a second
     * time can therefore fail to find the multiselect because "Packs"
     * is no longer in its DOM. This method opens the multiselect once,
     * clicks every requested option in turn, then closes it.
     */
    async filterByPacks(packNames: string[]): Promise<void> {
        if (packNames.length === 0) return;
        await this.ensureFiltersOpen();

        // Prefer the stable `data-testid="pack-filter"` (PrimeReact
        // forwards unknown attrs onto the .p-multiselect root). Fall
        // back to position-based selection for older builds that don't
        // have the attribute yet so this remains robust across rollbacks.
        const taggedPackFilter = this.page.locator(
            '#model-grid-filters-panel [data-testid="pack-filter"]',
        );
        const packsMultiselect =
            (await taggedPackFilter.count()) > 0
                ? taggedPackFilter.first()
                : this.page
                      .locator("#model-grid-filters-panel .p-multiselect")
                      .first();
        await packsMultiselect.waitFor({ state: "visible", timeout: 15000 });

        const panel = this.page.locator(".p-multiselect-panel");

        // PrimeReact fills the panel from an async packs fetch, so it can open
        // before the requested options have rendered. Rather than assume a
        // single fixed wait is enough on a slow CI runner, retry: open the
        // panel if it's closed and wait until every requested option appears.
        await expect(async () => {
            if (!(await panel.isVisible())) {
                await packsMultiselect.click();
            }
            for (const packName of packNames) {
                await expect(
                    panel.locator(`.p-multiselect-item:has-text("${packName}")`),
                ).toBeVisible({ timeout: 2000 });
            }
        }).toPass({ timeout: 20000 });

        for (const packName of packNames) {
            const option = panel.locator(
                `.p-multiselect-item:has-text("${packName}")`,
            );
            // The selected state is reflected on the .p-multiselect-item
            // (PrimeReact adds .p-highlight). Skip if already selected so
            // a re-call doesn't deselect.
            const alreadySelected = await option.evaluate((el: Element) =>
                el.classList.contains("p-highlight"),
            );
            if (!alreadySelected) {
                await option.click();
            }
        }

        await this.page.keyboard.press("Escape");
        await panel.waitFor({ state: "hidden", timeout: 5000 });
        await this.page.waitForLoadState("domcontentloaded");
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
