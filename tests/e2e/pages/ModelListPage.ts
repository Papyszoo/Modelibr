import { Page, expect } from "@playwright/test";

export class ModelListPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/");
        // Wait for the page to be fully loaded
        await this.page.waitForSelector('.model-list, .model-grid, [class*="model"]', {
            state: "visible",
            timeout: 10000,
        });
    }

    async uploadModel(filePath: string) {
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
            this.page.locator(".upload-summary-text").getByText(/completed/i)
        ).toBeVisible({ timeout: 30000 });

        // Close the upload progress window so it doesn't block clicks
        const closeButton = this.page
            .locator(
                '#upload-progress-window button[aria-label="Close"], #upload-progress-window .pi-times'
            )
            .first();
        if (await closeButton.isVisible({ timeout: 1000 })) {
            await closeButton.click();
            // Wait for window to disappear
            await expect(
                this.page.locator("#upload-progress-window")
            ).not.toBeVisible();
        }
    }

    async expectModelStatus(modelName: string, status: string) {
        const nameWithoutExt = modelName.split(".").slice(0, -1).join(".");
        // Try multiple possible selectors for the model item
        const modelItem = this.page
            .locator(".model-card, .model-grid-item, .p-card, [class*='model']", {
                hasText: nameWithoutExt,
            })
            .first();
        await expect(modelItem.getByText(status)).toBeVisible({
            timeout: 60000,
        });
    }

    async expectModelVisible(modelName: string) {
        const nameWithoutExt = modelName.split(".").slice(0, -1).join(".");
        await expect(
            this.page
                .getByText(modelName)
                .or(this.page.getByText(nameWithoutExt))
                .first()
        ).toBeVisible({ timeout: 30000 });
    }

    async openModel(modelName: string) {
        const nameWithoutExt = modelName.split(".").slice(0, -1).join(".");
        
        // Find the model element and click on it
        const modelElement = this.page
            .getByText(modelName)
            .or(this.page.getByText(nameWithoutExt))
            .first();
        
        await expect(modelElement).toBeVisible({ timeout: 10000 });
        await modelElement.click();

        // Wait for the model viewer to load
        await this.page.waitForSelector("canvas", {
            state: "visible",
            timeout: 30000,
        });
    }
}
