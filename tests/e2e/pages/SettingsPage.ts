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
        '.settings-checkbox-label input[type="checkbox"]:not(#generateAnimatedThumbnail)';
    private readonly generateAnimatedThumbnailCheckbox =
        "#generateAnimatedThumbnail";
    private readonly frameCountInput = "#frameCount";
    private readonly thumbnailSizeSelect = "#thumbnailSize";

    // Regenerate All Thumbnails (matches by visible label so it survives style refactors)
    private readonly regenerateAllButton = 'button:has-text("Regenerate All Thumbnails")';

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

    async getThumbnailSize(): Promise<string> {
        return (
            (await this.page.locator(this.thumbnailSizeSelect).inputValue()) ||
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

    async isGenerateAnimatedThumbnailChecked(): Promise<boolean> {
        return await this.page
            .locator(this.generateAnimatedThumbnailCheckbox)
            .isChecked();
    }

    async isFrameCountVisible(): Promise<boolean> {
        return await this.page.locator(this.frameCountInput).isVisible();
    }

    // ===== Field Setters =====

    async setMaxFileSize(value: string): Promise<void> {
        const input = this.page.locator(this.maxFileSizeInput);
        await input.fill(value);
        await input.press("Tab");
    }

    async setMaxThumbnailSize(value: string): Promise<void> {
        await this.page.locator(this.maxThumbnailSizeInput).fill(value);
    }

    async setFrameCount(value: string): Promise<void> {
        await this.page.locator(this.frameCountInput).fill(value);
    }

    async setThumbnailSize(value: string): Promise<void> {
        await this.page.locator(this.thumbnailSizeSelect).selectOption(value);
    }

    async setTheme(value: "light" | "dark"): Promise<void> {
        await this.page.locator(this.themeSelect).selectOption(value);
    }

    async toggleGenerateThumbnail(): Promise<void> {
        await this.page.locator(this.generateThumbnailCheckbox).click();
    }

    async toggleGenerateAnimatedThumbnail(): Promise<void> {
        await this.page
            .locator(this.generateAnimatedThumbnailCheckbox)
            .click();
    }

    async isRegenerateAllButtonVisible(): Promise<boolean> {
        return await this.page.locator(this.regenerateAllButton).isVisible();
    }

    /**
     * Click "Regenerate All Thumbnails". The button opens a PrimeReact
     * ConfirmDialog modal — we wait for it to appear and click the
     * "Regenerate" accept button.
     */
    async clickRegenerateAll(): Promise<void> {
        await this.page.locator(this.regenerateAllButton).click();
        const modalAcceptButton = this.page.locator(
            '.p-confirm-dialog .p-confirm-dialog-accept, .p-confirm-dialog button:has-text("Regenerate")'
        ).first();
        await modalAcceptButton.waitFor({ state: "visible", timeout: 5000 });
        await modalAcceptButton.click();
    }

    /**
     * Waits briefly for the PrimeReact ConfirmDialog to mount, then reports
     * visibility. The dialog is rendered imperatively after a React tick, so a
     * raw `isVisible()` immediately after the trigger click races.
     */
    async isRegenerateConfirmDialogVisible(): Promise<boolean> {
        try {
            await this.page
                .locator(".p-confirm-dialog")
                .waitFor({ state: "visible", timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async cancelRegenerateConfirmDialog(): Promise<void> {
        await this.page
            .locator(
                '.p-confirm-dialog .p-confirm-dialog-reject, .p-confirm-dialog button:has-text("Cancel")'
            )
            .first()
            .click();
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
        try {
            await this.page
                .locator(this.successBanner)
                .waitFor({ state: "visible", timeout: 10000 });
            return true;
        } catch {
            return false;
        }
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
