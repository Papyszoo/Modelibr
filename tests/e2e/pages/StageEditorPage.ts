import { Page, expect, Locator } from '@playwright/test';

export class StageEditorPage {
    readonly page: Page;
    readonly baseUrl: string;

    constructor(page: Page, baseUrl: string = process.env.FRONTEND_URL || 'http://localhost:3002') {
        this.page = page;
        this.baseUrl = baseUrl;
    }

    async gotoList() {
        await this.page.goto(`/?leftTabs=stageList&activeLeft=stageList`);
        await this.page.waitForSelector('.stage-list', { timeout: 10000 });
    }

    async createStage(name: string) {
        await this.page.getByRole('button', { name: 'New Stage' }).click();
        await this.page.getByPlaceholder('Stage Name').fill(name);
        await this.page.getByRole('button', { name: 'Create' }).click();
        await this.page.waitForSelector(`.stage-list-item:has-text("${name}")`);
    }

    async openStage(name: string) {
        await this.page.locator(`.stage-list-item:has-text("${name}")`).dblclick();
        // Wait for editor tab
        await this.page.waitForSelector('.scene-editor-canvas');
    }

    async addComponent(type: string) {
        // Assume component library is open or accessible
        await this.page.getByText(type).dragTo(this.page.locator('.scene-editor-canvas'));
        // Or click add button
    }

    async expectHierarchyItem(name: string) {
        await expect(this.page.locator(`.stage-hierarchy-item:has-text("${name}")`)).toBeVisible();
    }
}
