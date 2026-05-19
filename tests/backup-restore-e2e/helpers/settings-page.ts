import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for the Settings tab and its "Backup & Restore" accordion section.
 *
 * Modelibr opens tabs through a dock-bar "+" button → "New Tab" picker. The
 * Settings tab type is reached by clicking the picker's "Settings" tile.
 * This mirrors the main e2e suite's `openTabViaMenu` helper.
 */
export class SettingsPage {
    constructor(public readonly page: Page) {}

    async goto(): Promise<void> {
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3102";
        await this.page.goto(baseUrl);
        await this.page.waitForSelector(".p-splitter", {
            state: "visible",
            timeout: 30000,
        });
        await this.openSettingsTab();
        await this.expandBackupSection();
    }

    private async openSettingsTab(): Promise<void> {
        // If Settings is already open in any panel, click that existing tab.
        const existing = this.page
            .locator(".draggable-tab:has(.pi-cog)")
            .first();
        if (await existing.count()) {
            await existing.click();
        } else {
            // Open via the left dock bar's "+" button → New Tab page → Settings tile.
            await this.page.locator(".dock-bar-left .dock-add-button").click();
            const newtabPage = this.page.locator(".newtab-page").last();
            await expect(newtabPage).toBeVisible({ timeout: 10000 });

            const tile = newtabPage
                .locator(".newtab-tile")
                .filter({
                    has: this.page.locator(".newtab-tile-title", {
                        hasText: /^Settings$/,
                    }),
                })
                .first();
            await expect(tile).toBeVisible({ timeout: 10000 });
            await tile.click();
            await expect(newtabPage).toBeHidden({ timeout: 10000 });
        }

        await expect(
            this.page.getByRole("heading", { name: /application settings/i }),
        ).toBeVisible({ timeout: 30000 });
    }

    private async expandBackupSection(): Promise<void> {
        const header = this.page
            .locator(".settings-section-header")
            .filter({ hasText: /backup\s*&\s*restore/i })
            .first();
        await expect(header).toBeVisible();
        // Sections default to expanded for non-demo mode. If the body isn't
        // already in the DOM (different layout, e.g. mobile), expand it.
        const list = this.page.locator(".backups-section");
        if (!(await list.isVisible())) {
            await header.click();
        }
        await expect(list).toBeVisible();
        // Scroll the section into view for stable button clicks.
        await header.scrollIntoViewIfNeeded();
    }

    // ── Operations ──────────────────────────────────────────────────────

    async clickCreateBackup(): Promise<void> {
        await this.page
            .locator(".backups-toolbar")
            .getByRole("button", { name: /create backup/i })
            .click();
        await expect(this.page.locator(".backups-modal")).toBeVisible();
    }

    async setIncludeThumbnails(value: boolean): Promise<void> {
        const checkboxes = this.page
            .locator(".backups-modal .settings-checkbox-label input[type='checkbox']");
        // Order: Database (disabled, checked), Uploads (disabled, checked), Thumbnails (enabled)
        const thumb = checkboxes.nth(2);
        if ((await thumb.isChecked()) !== value) {
            await thumb.click();
        }
    }

    async confirmCreateBackup(): Promise<void> {
        await this.page
            .locator(".backups-modal")
            .getByRole("button", { name: /^create backup$/i })
            .click();
        await expect(this.page.locator(".backups-modal")).toBeHidden();
    }

    /** Wait until at least one row exists in the backups table. Returns its filename. */
    async waitForFirstBackupRow(timeoutMs: number = 30000): Promise<string> {
        const firstRow = this.page.locator(".backups-table tbody tr").first();
        await expect(firstRow).toBeVisible({ timeout: timeoutMs });
        return (await firstRow.locator(".backups-filename").innerText()).trim();
    }

    /** Wait until the row's status badge disappears (status flips to ready). */
    async waitForRowReady(fileName: string, timeoutMs: number = 120000): Promise<void> {
        const row = this.rowFor(fileName);
        await expect(row).toBeVisible();
        // "ready" rows have Download/Restore/Delete buttons rather than the badge.
        await expect(row.getByRole("button", { name: /^delete$/i }))
            .toBeVisible({ timeout: timeoutMs });
    }

    rowFor(fileName: string): Locator {
        return this.page
            .locator(".backups-table tbody tr")
            .filter({ has: this.page.locator(".backups-filename", { hasText: fileName }) })
            .first();
    }

    async clickDownload(fileName: string) {
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            this.rowFor(fileName).getByRole("link", { name: /download/i }).click(),
        ]);
        return download;
    }

    async clickRestore(fileName: string): Promise<void> {
        await this.rowFor(fileName)
            .getByRole("button", { name: /^restore$/i })
            .click();
        // PrimeReact's confirmDialog renders as a .p-dialog. Scope to it to
        // avoid colliding with the "Restore" button on the row.
        const dialog = this.page.locator(".p-confirm-dialog, .p-dialog").last();
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await dialog
            .getByRole("button", { name: /stage restore/i })
            .click();
        await expect(dialog).toBeHidden({ timeout: 5000 });
    }

    async clickDelete(fileName: string): Promise<void> {
        await this.rowFor(fileName)
            .getByRole("button", { name: /^delete$/i })
            .click();
        const dialog = this.page.locator(".p-confirm-dialog, .p-dialog").last();
        await expect(dialog).toBeVisible({ timeout: 5000 });
        await dialog
            .getByRole("button", { name: /^delete$/i })
            .click();
        await expect(dialog).toBeHidden({ timeout: 5000 });
    }

    async getRowCount(): Promise<number> {
        return this.page.locator(".backups-table tbody tr").count();
    }
}
