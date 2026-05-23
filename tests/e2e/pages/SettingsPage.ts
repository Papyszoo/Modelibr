import { Page } from "@playwright/test";

/**
 * Page object for the new grid + detail Settings UI. Getters/setters for
 * section-scoped fields automatically navigate into their section so callers
 * don't have to remember the new two-level layout. Use openGrid()/openSection()
 * directly when the test is specifically about navigation.
 */
export type SettingsSectionKey =
    | "appearance"
    | "fileUpload"
    | "thumbnails"
    | "textureProxy"
    | "blender"
    | "ssl"
    | "webdav"
    | "backup";

const SECTION_LABELS: Record<SettingsSectionKey, string> = {
    appearance: "Appearance",
    fileUpload: "File Upload",
    thumbnails: "Thumbnail Generation",
    textureProxy: "Texture Proxy",
    blender: "Blender",
    ssl: "SSL Certificate",
    webdav: "WebDAV",
    backup: "Backup & Restore",
};

const FIELD_SECTION: Record<string, SettingsSectionKey> = {
    "#colorTheme": "appearance",
    "#mobileBarPosition": "appearance",
    "#maxFileSize": "fileUpload",
    "#maxThumbnailSize": "fileUpload",
    "#duplicateNamePolicy": "fileUpload",
    "#frameCount": "thumbnails",
    "#thumbnailSize": "thumbnails",
    "#generateAnimatedThumbnail": "thumbnails",
    "#textureProxySize": "textureProxy",
};

export class SettingsPage {
    private readonly page: Page;

    // Container
    private readonly container = ".settings-container";
    private readonly title = ".settings-title";
    private readonly loadingState = ".settings-loading";
    private readonly errorBanner = ".settings-error";
    private readonly successBanner = ".settings-success";

    // Grid view
    private readonly settingsGrid = ".settings-grid";
    private readonly settingCard = ".setting-card";
    private readonly searchInput = ".settings-search";
    private readonly searchResults = ".search-results";
    private readonly searchResultItem = ".search-result-item";

    // Detail view
    private readonly sectionDetail = ".section-detail";
    private readonly sectionDetailTitle = ".section-detail-title";
    private readonly backButton = ".btn-back";
    private readonly saveButton = 'button[type="submit"]';
    private readonly discardButton = ".section-detail-footer .btn-secondary";
    private readonly unsavedChanges = ".settings-unsaved-changes";

    // Form
    private readonly form = ".settings-form";

    // Animated thumbnail uses the toggle markup — locate via the input id, but
    // clicks need to land on the visible toggle pill (the input is sr-only).
    private readonly animatedThumbToggleLabel =
        'label.toggle-field:has(input#generateAnimatedThumbnail)';
    private readonly generateAnimatedThumbnailInput = "#generateAnimatedThumbnail";
    private readonly generateThumbnailInput =
        '.section-fields .toggle-field input[type="checkbox"]:not(#generateAnimatedThumbnail)';
    private readonly generateThumbnailToggleLabel =
        'label.toggle-field:has(input[type="checkbox"]:not(#generateAnimatedThumbnail))';

    // Regenerate All Thumbnails (label match survives style refactors)
    private readonly regenerateAllButton =
        'button:has-text("Regenerate All Thumbnails")';

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
        await this.page
            .locator(this.loadingState)
            .waitFor({ state: "hidden", timeout: 10000 })
            .catch(() => {});
    }

    async isVisible(): Promise<boolean> {
        return await this.page.locator(this.container).isVisible();
    }

    async getTitle(): Promise<string | null> {
        // Title only exists on the grid view; navigate there first if needed.
        if (!(await this.isOnGrid())) {
            await this.openGrid();
        }
        return await this.page.locator(this.title).textContent();
    }

    // ── Grid navigation ────────────────────────────────────────────────

    async isOnGrid(): Promise<boolean> {
        return await this.page.locator(this.settingsGrid).isVisible();
    }

    async isInSection(key: SettingsSectionKey): Promise<boolean> {
        const detail = this.page.locator(this.sectionDetail);
        if (!(await detail.isVisible())) return false;
        const titleText = (
            await this.page.locator(this.sectionDetailTitle).textContent()
        )?.trim();
        return titleText?.includes(SECTION_LABELS[key]) ?? false;
    }

    async openGrid(): Promise<void> {
        if (await this.isOnGrid()) return;
        await this.page.locator(this.backButton).click();
        await this.page
            .locator(this.settingsGrid)
            .waitFor({ state: "visible", timeout: 5000 });
    }

    async openSection(key: SettingsSectionKey): Promise<void> {
        if (await this.isInSection(key)) return;
        if (!(await this.isOnGrid())) {
            await this.openGrid();
        }
        await this.page
            .locator(`${this.settingCard}:has-text("${SECTION_LABELS[key]}")`)
            .first()
            .click();
        await this.page
            .locator(`${this.sectionDetailTitle}:has-text("${SECTION_LABELS[key]}")`)
            .waitFor({ state: "visible", timeout: 5000 });
    }

    async clickBack(): Promise<void> {
        await this.page.locator(this.backButton).click();
    }

    async getVisibleCardLabels(): Promise<string[]> {
        const cards = this.page.locator(
            `${this.settingCard}:not(.dimmed) .card-title`,
        );
        const count = await cards.count();
        const labels: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await cards.nth(i).textContent();
            if (text) labels.push(text.trim());
        }
        return labels;
    }

    async getAllCardLabels(): Promise<string[]> {
        const cards = this.page.locator(`${this.settingCard} .card-title`);
        const count = await cards.count();
        const labels: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await cards.nth(i).textContent();
            if (text) labels.push(text.trim());
        }
        return labels;
    }

    async getDimmedCardLabels(): Promise<string[]> {
        const cards = this.page.locator(
            `${this.settingCard}.dimmed .card-title`,
        );
        const count = await cards.count();
        const labels: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await cards.nth(i).textContent();
            if (text) labels.push(text.trim());
        }
        return labels;
    }

    async getLockedCardLabels(): Promise<string[]> {
        const cards = this.page.locator(
            `${this.settingCard}.locked .card-title`,
        );
        const count = await cards.count();
        const labels: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await cards.nth(i).textContent();
            if (text) labels.push(text.trim());
        }
        return labels;
    }

    // ── Search ────────────────────────────────────────────────────────

    async searchFor(text: string): Promise<void> {
        if (!(await this.isOnGrid())) await this.openGrid();
        const input = this.page.locator(this.searchInput);
        await input.click();
        await input.fill(text);
    }

    async clearSearch(): Promise<void> {
        const input = this.page.locator(this.searchInput);
        await input.fill("");
    }

    async getSearchResultLabels(): Promise<string[]> {
        const items = this.page.locator(this.searchResultItem);
        const count = await items.count();
        const labels: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await items.nth(i).textContent();
            if (text) labels.push(text.trim());
        }
        return labels;
    }

    async clickFirstSearchResult(): Promise<void> {
        await this.page.locator(this.searchResultItem).first().click();
    }

    async isSearchDropdownVisible(): Promise<boolean> {
        return await this.page.locator(this.searchResults).isVisible();
    }

    // ── Field Getters (auto-navigate) ────────────────────────────────

    private async ensureFieldVisible(selector: string): Promise<void> {
        const key = FIELD_SECTION[selector];
        if (key) await this.openSection(key);
    }

    async getMaxFileSize(): Promise<string> {
        await this.ensureFieldVisible("#maxFileSize");
        return (await this.page.locator("#maxFileSize").inputValue()) || "";
    }

    async getMaxThumbnailSize(): Promise<string> {
        await this.ensureFieldVisible("#maxThumbnailSize");
        return (
            (await this.page.locator("#maxThumbnailSize").inputValue()) || ""
        );
    }

    async getFrameCount(): Promise<string> {
        await this.ensureFieldVisible("#frameCount");
        return (await this.page.locator("#frameCount").inputValue()) || "";
    }

    async getThumbnailSize(): Promise<string> {
        await this.ensureFieldVisible("#thumbnailSize");
        return (await this.page.locator("#thumbnailSize").inputValue()) || "";
    }

    async getTheme(): Promise<string> {
        await this.ensureFieldVisible("#colorTheme");
        return (await this.page.locator("#colorTheme").inputValue()) || "";
    }

    async getMobileBarPosition(): Promise<string> {
        await this.ensureFieldVisible("#mobileBarPosition");
        return (
            (await this.page.locator("#mobileBarPosition").inputValue()) || ""
        );
    }

    async getTextureProxySize(): Promise<string> {
        await this.ensureFieldVisible("#textureProxySize");
        return (
            (await this.page.locator("#textureProxySize").inputValue()) || ""
        );
    }

    async getDuplicateNamePolicy(): Promise<string> {
        await this.ensureFieldVisible("#duplicateNamePolicy");
        return (
            (await this.page.locator("#duplicateNamePolicy").inputValue()) || ""
        );
    }

    async isGenerateThumbnailChecked(): Promise<boolean> {
        await this.ensureFieldVisible("#generateAnimatedThumbnail");
        return await this.page.locator(this.generateThumbnailInput).isChecked();
    }

    async isGenerateAnimatedThumbnailChecked(): Promise<boolean> {
        await this.ensureFieldVisible("#generateAnimatedThumbnail");
        return await this.page
            .locator(this.generateAnimatedThumbnailInput)
            .isChecked();
    }

    async isFrameCountVisible(): Promise<boolean> {
        await this.ensureFieldVisible("#generateAnimatedThumbnail");
        return await this.page.locator("#frameCount").isVisible();
    }

    // ── Field Setters ─────────────────────────────────────────────────

    async setMaxFileSize(value: string): Promise<void> {
        await this.ensureFieldVisible("#maxFileSize");
        const input = this.page.locator("#maxFileSize");
        await input.fill(value);
        await input.press("Tab");
    }

    async setMaxThumbnailSize(value: string): Promise<void> {
        await this.ensureFieldVisible("#maxThumbnailSize");
        await this.page.locator("#maxThumbnailSize").fill(value);
    }

    async setFrameCount(value: string): Promise<void> {
        await this.ensureFieldVisible("#frameCount");
        await this.page.locator("#frameCount").fill(value);
    }

    async setThumbnailSize(value: string): Promise<void> {
        await this.ensureFieldVisible("#thumbnailSize");
        await this.page.locator("#thumbnailSize").selectOption(value);
    }

    async setTextureProxySize(value: string): Promise<void> {
        await this.ensureFieldVisible("#textureProxySize");
        await this.page.locator("#textureProxySize").selectOption(value);
    }

    async setDuplicateNamePolicy(value: string): Promise<void> {
        await this.ensureFieldVisible("#duplicateNamePolicy");
        await this.page.locator("#duplicateNamePolicy").selectOption(value);
    }

    async setTheme(value: "light" | "dark"): Promise<void> {
        await this.ensureFieldVisible("#colorTheme");
        // Visible theme picker buttons drive the same state — click those so
        // we exercise the real UI, not the sr-only fallback select.
        const card =
            value === "dark"
                ? this.page.locator('.theme-card:has-text("Dark")')
                : this.page.locator('.theme-card:has-text("Light")');
        await card.click();
    }

    async setMobileBarPosition(
        value: "top" | "bottom" | "left",
    ): Promise<void> {
        await this.ensureFieldVisible("#mobileBarPosition");
        await this.page.locator("#mobileBarPosition").selectOption(value);
    }

    async toggleGenerateThumbnail(): Promise<void> {
        await this.ensureFieldVisible("#generateAnimatedThumbnail");
        await this.page.locator(this.generateThumbnailToggleLabel).click();
    }

    async toggleGenerateAnimatedThumbnail(): Promise<void> {
        await this.ensureFieldVisible("#generateAnimatedThumbnail");
        await this.page.locator(this.animatedThumbToggleLabel).click();
    }

    async isRegenerateAllButtonVisible(): Promise<boolean> {
        await this.openSection("thumbnails");
        return await this.page.locator(this.regenerateAllButton).isVisible();
    }

    async clickRegenerateAll(): Promise<void> {
        await this.openSection("thumbnails");
        await this.page.locator(this.regenerateAllButton).click();
        const modalAcceptButton = this.page
            .locator(
                '.p-confirm-dialog .p-confirm-dialog-accept, .p-confirm-dialog button:has-text("Regenerate")',
            )
            .first();
        await modalAcceptButton.waitFor({ state: "visible", timeout: 5000 });
        await modalAcceptButton.click();
    }

    async openRegenerateAllConfirmation(): Promise<void> {
        await this.openSection("thumbnails");
        await this.page.locator(this.regenerateAllButton).click();
    }

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
                '.p-confirm-dialog .p-confirm-dialog-reject, .p-confirm-dialog button:has-text("Cancel")',
            )
            .first()
            .click();
    }

    // ── Actions ──────────────────────────────────────────────────────

    async save(): Promise<void> {
        await this.page.locator(this.saveButton).click();
    }

    async discard(): Promise<void> {
        await this.page.locator(this.discardButton).click();
    }

    async isSaveEnabled(): Promise<boolean> {
        return await this.page.locator(this.saveButton).isEnabled();
    }

    async isSaveButtonVisible(): Promise<boolean> {
        return await this.page.locator(this.saveButton).isVisible();
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

    // ── Validation ───────────────────────────────────────────────────

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

    // ── SSL ──────────────────────────────────────────────────────────

    async getSslCertificateDownloadHref(): Promise<string | null> {
        await this.openSection("ssl");
        const link = this.page.locator(
            'a[download][href*="modelibr-cert.crt"]',
        );
        if (!(await link.isVisible())) return null;
        return await link.getAttribute("href");
    }
}
