import { Page, expect } from "@playwright/test";

export class ModelListPage {
    constructor(private page: Page) {}

    async goto() {
        // Clear local storage and force clean state
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
        await this.page.goto(baseUrl);
        await this.page.evaluate(() => {
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (e) {
                // Ignore errors if storage not accessible
            }
        });

        // Now navigate to the desired state
        await this.page.goto(
            `${baseUrl}/?leftTabs=modelList&activeLeft=modelList`,
        );

        // Wait for the page to be fully loaded and check for model list specific elements
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

        // 2. Wait for network to settle
        await this.page
            .waitForLoadState("networkidle", { timeout: 15000 })
            .catch(() => {
                console.log("[Upload] Network idle timeout, proceeding anyway");
            });

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
            if (await closeButton.isVisible({ timeout: 1000 })) {
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
}
