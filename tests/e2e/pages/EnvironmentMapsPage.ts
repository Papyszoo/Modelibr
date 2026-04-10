import { expect, Page } from "@playwright/test";
import { navigateToAppClean } from "../helpers/navigation-helper";

export class EnvironmentMapsPage {
    constructor(private page: Page) {}

    private readonly listRoot = ".environment-map-list";
    private readonly listLoading = ".environment-map-list-loading";
    private readonly listReady =
        ".environment-map-list, .environment-map-list-empty, .environment-map-grid";
    private readonly card = ".environment-map-card";
    private readonly viewerRoot = ".environment-map-viewer";
    private readonly variantListButtons =
        ".environment-map-variant-list button";
    private readonly variantSizeInput = ".environment-map-variant-size-input";
    private readonly confirmDialog = ".p-confirm-dialog, .p-dialog";
    private readonly dockAddButton = ".dock-bar-left .dock-add-button";
    private readonly dockAddMenu = ".dock-add-menu";

    async goto(): Promise<void> {
        await navigateToAppClean(this.page);

        const navLink = this.page.getByRole("link", {
            name: /Environment Maps/i,
        });
        const navMenuItem = this.page.getByRole("menuitem", {
            name: /Environment Maps/i,
        });

        if (
            (await navLink.count()) > 0 &&
            (await navLink.first().isVisible().catch(() => false))
        ) {
            await navLink.first().click();
        } else if (
            (await navMenuItem.count()) > 0 &&
            (await navMenuItem.first().isVisible().catch(() => false))
        ) {
            await navMenuItem.first().click();
        } else {
            const addButton = this.page.locator(this.dockAddButton);
            await expect(addButton).toBeVisible({ timeout: 10000 });
            await addButton.click();

            const addMenu = this.page.locator(this.dockAddMenu);
            await expect(addMenu).toBeVisible({ timeout: 5000 });

            const environmentMapsItem = addMenu.getByText("Environment Maps", {
                exact: true,
            });

            if ((await environmentMapsItem.count()) === 0) {
                const menuLabels = (await addMenu.locator("li").allTextContents())
                    .map((text) => text.trim())
                    .filter(Boolean);

                throw new Error(
                    `Environment Maps tab is not available in the current frontend menu. Visible add-tab items: ${menuLabels.join(", ")}`,
                );
            }

            await environmentMapsItem.click();
        }

        await this.waitForListReady();
    }

    async waitForListReady(): Promise<void> {
        await this.page.waitForSelector(this.listReady, {
            state: "attached",
            timeout: 15000,
        });

        const loading = this.page.locator(this.listLoading);
        if (await loading.isVisible().catch(() => false)) {
            await loading.waitFor({ state: "hidden", timeout: 30000 });
        }

        await expect(this.page.locator(this.listRoot).first()).toBeVisible({
            timeout: 10000,
        });
    }

    getEnvironmentMapCardByName(name: string) {
        return this.page.locator(this.card).filter({
            has: this.page.locator(".environment-map-card-title", {
                hasText: name,
            }),
        });
    }

    async uploadEnvironmentMap(
        filePath: string,
    ): Promise<{ environmentMapId: number }> {
        const fileInput = this.page.locator(
            `${this.listRoot} input[type="file"]`,
        );
        await expect(fileInput).toBeAttached({ timeout: 10000 });

        const uploadResponsePromise = this.page.waitForResponse(
            (response) =>
                response.url().includes("/environment-maps/with-file") &&
                response.request().method() === "POST",
        );

        await fileInput.setInputFiles(filePath);
        const uploadResponse = await uploadResponsePromise;
        if (!uploadResponse.ok()) {
            throw new Error(
                `Environment map upload failed (${uploadResponse.status()}): ${await uploadResponse.text()}`,
            );
        }
        const payload = await uploadResponse.json();

        await this.waitForListReady();

        return {
            environmentMapId: payload.environmentMapId ?? payload.id,
        };
    }

    async waitForEnvironmentMapByName(
        name: string,
        timeout = 15000,
    ): Promise<void> {
        await expect(this.getEnvironmentMapCardByName(name)).toBeVisible({
            timeout,
        });
    }

    async openEnvironmentMapByName(name: string): Promise<void> {
        const card = this.getEnvironmentMapCardByName(name);
        await expect(card).toBeVisible({ timeout: 15000 });
        await card.click();
        await this.waitForViewer(name);
    }

    async waitForViewer(name: string): Promise<void> {
        await expect(this.page.locator(this.viewerRoot)).toBeVisible({
            timeout: 15000,
        });
        await expect(
            this.page.locator(`${this.viewerRoot} h2`, { hasText: name }),
        ).toBeVisible({ timeout: 15000 });
    }

    async getPreviewSizeLabels(): Promise<string[]> {
        return (await this.page.locator(this.variantListButtons).allTextContents())
            .map((text) => text.trim())
            .filter(Boolean);
    }

    async waitForPreviewSizeLabel(label: string, timeout = 15000): Promise<void> {
        await expect
            .poll(
                async () => {
                    const labels = await this.getPreviewSizeLabels();
                    return labels.includes(label);
                },
                { timeout },
            )
            .toBe(true);
    }

    async getViewerVariantCount(): Promise<number> {
        const row = this.page.locator(
            ".environment-map-detail-list > div",
        ).filter({
            has: this.page.locator("dt", { hasText: "Variants" }),
        });
        const text = (await row.locator("dd").textContent())?.trim() ?? "0";
        return Number(text);
    }

    async uploadVariant(filePath: string, sizeLabel: string): Promise<void> {
        await expect(this.page.locator(this.viewerRoot)).toBeVisible({
            timeout: 10000,
        });

        await this.page.locator(this.variantSizeInput).fill(sizeLabel);

        const fileInput = this.page.locator(
            `${this.viewerRoot} input[type="file"]`,
        );
        await expect(fileInput).toBeAttached({ timeout: 10000 });

        const uploadResponsePromise = this.page.waitForResponse(
            (response) =>
                /\/environment-maps\/\d+\/variants\/with-file/.test(
                    response.url(),
                ) &&
                response.request().method() === "POST",
        );

        await fileInput.setInputFiles(filePath);
        const uploadResponse = await uploadResponsePromise;
        if (!uploadResponse.ok()) {
            throw new Error(
                `Environment map variant upload failed (${uploadResponse.status()}): ${await uploadResponse.text()}`,
            );
        }
    }

    async recycleEnvironmentMapByName(name: string): Promise<void> {
        const card = this.getEnvironmentMapCardByName(name);
        await expect(card).toBeVisible({ timeout: 15000 });
        await card.hover();
        await card.locator(".environment-map-card-actions button").click();

        const confirmDialog = this.page.locator(this.confirmDialog);
        await confirmDialog.waitFor({ state: "visible", timeout: 5000 });
        await confirmDialog
            .locator("button.p-button-danger, button:has-text('Yes')")
            .first()
            .click();
        await confirmDialog.waitFor({ state: "hidden", timeout: 10000 });
    }
}
