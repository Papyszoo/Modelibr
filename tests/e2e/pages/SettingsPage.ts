import { Page } from "@playwright/test";

export class SettingsPage {
    private readonly page: Page;

    // Container
    private readonly container = ".settings-container";
    private readonly title = ".settings-title";
    private readonly loadingState = ".settings-loading";
    private readonly errorBanner = ".settings-error";
    private readonly successBanner = ".settings-success";

    // Form
    private readonly form = ".settings-form";
    private readonly saveButton = 'button[type="submit"]';
    private readonly unsavedChanges = ".settings-unsaved-changes";

    // Accordion sections
    private readonly sectionHeader = ".settings-section-header";
    private readonly sectionContent = ".settings-section-content";

    // Appearance
    private readonly themeSelect = "#colorTheme";

    // File Upload Settings
    private readonly maxFileSizeInput = "#maxFileSize";
    private readonly maxThumbnailSizeInput = "#maxThumbnailSize";

    // Thumbnail Generation Settings
    private readonly generateThumbnailCheckbox =
        '.settings-checkbox-label input[type="checkbox"]';
    private readonly frameCountInput = "#frameCount";
    private readonly cameraAngleInput = "#cameraAngle";
    private readonly thumbnailWidthInput = "#thumbnailWidth";
    private readonly thumbnailHeightInput = "#thumbnailHeight";

    // Validation
    private readonly errorMessage = ".settings-error-message";
    private readonly inputError = ".settings-input-error";
    private readonly dirtyIndicator = ".settings-dirty-indicator";

    constructor(page: Page) {
        this.page = page;
    }

    async navigateToSettings(): Promise<void> {
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(this.page, "settings");
    }

    async waitForLoaded(): Promise<void> {
        await this.page
            .locator(this.container)
            .waitFor({ state: "visible", timeout: 10000 });
        // Wait for loading to disappear
        await this.page
            .locator(this.loadingState)
            .waitFor({ state: "hidden", timeout: 10000 })
            .catch(() => {});
    }

    async isVisible(): Promise<boolean> {
        return await this.page.locator(this.container).isVisible();
    }

    async getTitle(): Promise<string | null> {
        return await this.page.locator(this.title).textContent();
    }

    // ===== Field Getters =====

    async getMaxFileSize(): Promise<string> {
        return (
            (await this.page.locator(this.maxFileSizeInput).inputValue()) || ""
        );
    }

    async getMaxThumbnailSize(): Promise<string> {
        return (
            (await this.page
                .locator(this.maxThumbnailSizeInput)
                .inputValue()) || ""
        );
    }

    async getFrameCount(): Promise<string> {
        return (
            (await this.page.locator(this.frameCountInput).inputValue()) || ""
        );
    }

    async getCameraAngle(): Promise<string> {
        return (
            (await this.page.locator(this.cameraAngleInput).inputValue()) || ""
        );
    }

    async getThumbnailWidth(): Promise<string> {
        return (
            (await this.page.locator(this.thumbnailWidthInput).inputValue()) ||
            ""
        );
    }

    async getThumbnailHeight(): Promise<string> {
        return (
            (await this.page.locator(this.thumbnailHeightInput).inputValue()) ||
            ""
        );
    }

    async getTheme(): Promise<string> {
        return (await this.page.locator(this.themeSelect).inputValue()) || "";
    }

    async isGenerateThumbnailChecked(): Promise<boolean> {
        return await this.page
            .locator(this.generateThumbnailCheckbox)
            .isChecked();
    }

    // ===== Field Setters =====

    async setMaxFileSize(value: string): Promise<void> {
        await this.page.locator(this.maxFileSizeInput).fill(value);
    }

    async setMaxThumbnailSize(value: string): Promise<void> {
        await this.page.locator(this.maxThumbnailSizeInput).fill(value);
    }

    async setFrameCount(value: string): Promise<void> {
        await this.page.locator(this.frameCountInput).fill(value);
    }

    async setCameraAngle(value: string): Promise<void> {
        await this.page.locator(this.cameraAngleInput).fill(value);
    }

    async setThumbnailWidth(value: string): Promise<void> {
        await this.page.locator(this.thumbnailWidthInput).fill(value);
    }

    async setThumbnailHeight(value: string): Promise<void> {
        await this.page.locator(this.thumbnailHeightInput).fill(value);
    }

    async setTheme(value: "light" | "dark"): Promise<void> {
        await this.page.locator(this.themeSelect).selectOption(value);
    }

    async toggleGenerateThumbnail(): Promise<void> {
        await this.page.locator(this.generateThumbnailCheckbox).click();
    }

    // ===== Actions =====

    async save(): Promise<void> {
        await this.page.locator(this.saveButton).click();
    }

    async isSaveEnabled(): Promise<boolean> {
        return await this.page.locator(this.saveButton).isEnabled();
    }

    async hasUnsavedChanges(): Promise<boolean> {
        return await this.page.locator(this.unsavedChanges).isVisible();
    }

    async isSuccessVisible(): Promise<boolean> {
        return await this.page.locator(this.successBanner).isVisible();
    }

    async getSuccessMessage(): Promise<string | null> {
        return await this.page.locator(this.successBanner).textContent();
    }

    // ===== Validation =====

    async getValidationErrors(): Promise<string[]> {
        const errors = this.page.locator(this.errorMessage);
        const count = await errors.count();
        const messages: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await errors.nth(i).textContent();
            if (text) messages.push(text);
        }
        return messages;
    }

    async hasValidationErrors(): Promise<boolean> {
        return (await this.page.locator(this.inputError).count()) > 0;
    }

    async hasDirtyFields(): Promise<boolean> {
        return (await this.page.locator(this.dirtyIndicator).count()) > 0;
    }

    async getErrorBannerText(): Promise<string | null> {
        if (await this.page.locator(this.errorBanner).isVisible()) {
            return await this.page.locator(this.errorBanner).textContent();
        }
        return null;
    }
}
