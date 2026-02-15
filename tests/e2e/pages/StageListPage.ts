import { Page } from "@playwright/test";

export class StageListPage {
    private readonly page: Page;

    // Container
    private readonly container = ".stage-list-container";
    private readonly header = ".stage-list-header";
    private readonly grid = ".stage-grid";
    private readonly emptyState = ".stage-grid-empty";
    private readonly loadingState = ".stage-grid-loading";

    // Cards
    private readonly stageCard = ".stage-card";
    private readonly stageName = ".stage-card-name";
    private readonly stageDate = ".stage-card-date";
    private readonly cardContent = ".stage-card-content";
    private readonly cardActions = ".stage-card-actions";
    private readonly deleteButton = ".p-button-danger";

    // Search
    private readonly searchInput = ".search-input";

    // Create dialog
    private readonly createButton = ".header-actions .p-button-primary";
    private readonly createDialog = ".p-dialog";
    private readonly stageNameInput = "#stage-name";
    private readonly dialogCreateButton =
        ".p-dialog-footer button:not(.p-button-text)";
    private readonly dialogCancelButton = ".p-dialog-footer .p-button-text";

    // Confirm dialog (delete)
    private readonly confirmDialog = ".p-confirm-dialog";
    private readonly confirmAcceptButton =
        ".p-confirm-dialog .p-confirm-dialog-accept";
    private readonly confirmRejectButton =
        ".p-confirm-dialog .p-confirm-dialog-reject";

    // Toast
    private readonly toastMessage = ".p-toast-message";

    constructor(page: Page) {
        this.page = page;
    }

    async navigateToStageList(): Promise<void> {
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(this.page, "stageList");
    }

    async waitForLoaded(): Promise<void> {
        await this.page
            .locator(this.container)
            .waitFor({ state: "visible", timeout: 10000 });
    }

    async isVisible(): Promise<boolean> {
        return await this.page.locator(this.container).isVisible();
    }

    async isEmpty(): Promise<boolean> {
        return await this.page.locator(this.emptyState).isVisible();
    }

    // ===== Card Methods =====

    async getStageCount(): Promise<number> {
        if (await this.isEmpty()) return 0;
        return await this.page.locator(this.stageCard).count();
    }

    async getStageNames(): Promise<string[]> {
        const names: string[] = [];
        const cards = this.page.locator(this.stageName);
        const count = await cards.count();
        for (let i = 0; i < count; i++) {
            const text = await cards.nth(i).textContent();
            if (text) names.push(text.trim());
        }
        return names;
    }

    async isStageVisible(name: string): Promise<boolean> {
        const card = this.page
            .locator(this.stageCard)
            .filter({
                has: this.page.locator(this.stageName, { hasText: name }),
            });
        return (await card.count()) > 0;
    }

    async clickStage(name: string): Promise<void> {
        const card = this.page
            .locator(this.stageCard)
            .filter({
                has: this.page.locator(this.stageName, { hasText: name }),
            });
        await card.locator(this.cardContent).click();
    }

    // ===== Create =====

    async openCreateDialog(): Promise<void> {
        await this.page.locator(this.createButton).click();
        await this.page
            .locator(this.createDialog)
            .waitFor({ state: "visible", timeout: 5000 });
    }

    async createStage(name: string): Promise<void> {
        await this.openCreateDialog();
        await this.page.locator(this.stageNameInput).fill(name);
        await this.page.locator(this.dialogCreateButton).click();
        await this.page
            .locator(this.createDialog)
            .waitFor({ state: "hidden", timeout: 5000 });
    }

    async isCreateButtonEnabled(): Promise<boolean> {
        return await this.page.locator(this.dialogCreateButton).isEnabled();
    }

    // ===== Delete =====

    async deleteStage(name: string): Promise<void> {
        const card = this.page
            .locator(this.stageCard)
            .filter({
                has: this.page.locator(this.stageName, { hasText: name }),
            });
        await card.hover();
        await card.locator(this.deleteButton).click();
        // Wait for confirm dialog
        await this.page
            .locator(this.confirmDialog)
            .waitFor({ state: "visible", timeout: 5000 });
    }

    async confirmDelete(): Promise<void> {
        await this.page.locator(this.confirmAcceptButton).click();
    }

    async cancelDelete(): Promise<void> {
        await this.page.locator(this.confirmRejectButton).click();
    }

    // ===== Search =====

    async search(text: string): Promise<void> {
        await this.page.locator(this.searchInput).fill(text);
    }

    async clearSearch(): Promise<void> {
        await this.page.locator(this.searchInput).fill("");
    }

    // ===== Toast =====

    async getToastMessage(): Promise<string | null> {
        const toast = this.page.locator(this.toastMessage);
        if (await toast.isVisible()) {
            return await toast.textContent();
        }
        return null;
    }

    async waitForToast(timeout = 5000): Promise<string | null> {
        try {
            await this.page
                .locator(this.toastMessage)
                .waitFor({ state: "visible", timeout });
            return await this.page.locator(this.toastMessage).textContent();
        } catch {
            return null;
        }
    }
}
