import { expect, type Locator, type Page } from "@playwright/test";

import {
    serializeUploadFilePayloads,
    type UploadFilePayload,
} from "../helpers/file-payload-helper";
import { navigateToAppClean } from "../helpers/navigation-helper";

interface EnvironmentMapDialogValues {
    name?: string;
    sizeLabel?: string;
    file?: UploadFilePayload;
    cubeFaces?: Partial<
        Record<"px" | "nx" | "py" | "ny" | "pz" | "nz", UploadFilePayload>
    >;
    thumbnailFile?: UploadFilePayload;
}

interface CardThumbnailTransitionRecord {
    exists: boolean;
    hasPlaceholder: boolean;
    hasImage: boolean;
    imageSrc: string | null;
    currentSrc: string | null;
    isLoaded: boolean;
    timestamp: number;
}

export class EnvironmentMapsPage {
    constructor(private page: Page) {}

    private get listRoot() {
        return this.page.locator(".environment-map-list");
    }

    private get listLoading() {
        return this.page.locator(".environment-map-list-loading");
    }

    private get uploadDialog() {
        return this.page
            .locator(".p-dialog")
            .filter({ hasText: "Upload Environment Map" });
    }

    private get viewerRoot() {
        return this.page.locator(".environment-map-viewer");
    }

    private get viewerMenubar() {
        return this.page.locator('[data-testid="environment-map-viewer-menubar"]');
    }

    private get previewCanvas() {
        return this.page.locator(".environment-map-preview-canvas");
    }

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
            const addButton = this.page.locator(".dock-bar-left .dock-add-button");
            await expect(addButton).toBeVisible({ timeout: 10000 });
            await addButton.click();

            const addMenu = this.page.locator(".dock-add-menu");
            await expect(addMenu).toBeVisible({ timeout: 5000 });
            await addMenu.getByText("Environment Maps", { exact: true }).click();
        }

        await this.waitForListReady();
    }

    async waitForListReady(): Promise<void> {
        await expect(this.listRoot).toBeVisible({ timeout: 15000 });

        if (await this.listLoading.isVisible().catch(() => false)) {
            await this.listLoading.waitFor({ state: "hidden", timeout: 30000 });
        }
    }

    async expectToolbarActions(labels: string[]): Promise<void> {
        for (const label of labels) {
            await expect(
                this.page.getByRole("button", {
                    name: new RegExp(`^${escapeForRegex(label)}$`, "i"),
                }),
            ).toBeVisible();
        }
    }

    async getToolbarCountLabel(): Promise<string> {
        const label =
            (await this.page
                .locator(".environment-map-toolbar-count span")
                .textContent()) ?? "";
        return label.trim();
    }

    async waitForToolbarCountLabel(
        expectedLabel: string,
        timeout = 15000,
    ): Promise<void> {
        await expect
            .poll(async () => this.getToolbarCountLabel(), { timeout })
            .toBe(expectedLabel);
    }

    getEnvironmentMapCardByName(name: string) {
        return this.page
            .locator(".environment-map-card")
            .filter({
                has: this.page.locator(".environment-map-card-name", {
                    hasText: name,
                }),
            });
    }

    getEnvironmentMapCardThumbnailByName(name: string) {
        return this.getEnvironmentMapCardByName(name).getByTestId(
            "environment-map-card-thumbnail",
        );
    }

    getEnvironmentMapCardPlaceholderByName(name: string) {
        return this.getEnvironmentMapCardByName(name).locator(
            ".environment-map-card-placeholder",
        );
    }

    async dragAndDropUpload(
        payloads: UploadFilePayload[],
    ): Promise<{ environmentMapId: number }> {
        const uploadResponsePromise = this.page.waitForResponse(
            (response) =>
                response.url().includes("/environment-maps/with-file") &&
                response.request().method() === "POST",
        );

        const serializedPayloads = serializeUploadFilePayloads(payloads);
        await this.listRoot.evaluate(
            (element, files) => {
                const dataTransfer = new DataTransfer();

                for (const file of files) {
                    const bytes = Uint8Array.from(atob(file.base64), (char) =>
                        char.charCodeAt(0),
                    );
                    dataTransfer.items.add(
                        new File([bytes], file.name, {
                            type: file.mimeType,
                            lastModified: Date.now(),
                        }),
                    );
                }

                for (const type of ["dragenter", "dragover", "drop"]) {
                    element.dispatchEvent(
                        new DragEvent(type, {
                            bubbles: true,
                            cancelable: true,
                            dataTransfer,
                        }),
                    );
                }
            },
            serializedPayloads,
        );

        const uploadResponse = await uploadResponsePromise;
        await expect(uploadResponse.ok()).toBeTruthy();
        const payload = await uploadResponse.json();

        await this.waitForListReady();

        return {
            environmentMapId: payload.environmentMapId ?? payload.id,
        };
    }

    async openUploadDialog(): Promise<void> {
        await this.page.getByRole("button", { name: /^Upload$/i }).click();
        await expect(this.uploadDialog).toBeVisible({ timeout: 10000 });
    }

    async uploadSingleEnvironmentMapViaDialog(
        values: EnvironmentMapDialogValues,
    ): Promise<{ environmentMapId: number }> {
        await this.openUploadDialog();
        await this.fillCreateDialog(values);

        const uploadResponsePromise = this.page.waitForResponse(
            (response) =>
                response.url().includes("/environment-maps/with-file") &&
                response.request().method() === "POST",
        );

        await this.uploadDialog
            .getByRole("button", { name: /^Upload$/i })
            .last()
            .click();

        const uploadResponse = await uploadResponsePromise;
        await expect(uploadResponse.ok()).toBeTruthy();
        const payload = await uploadResponse.json();

        await expect(this.uploadDialog).toBeHidden({ timeout: 30000 });
        await this.waitForListReady();

        return {
            environmentMapId: payload.environmentMapId ?? payload.id,
        };
    }

    async uploadCubeEnvironmentMapViaDialog(
        values: EnvironmentMapDialogValues & {
            cubeFaces: Record<
                "px" | "nx" | "py" | "ny" | "pz" | "nz",
                UploadFilePayload
            >;
        },
    ): Promise<{ environmentMapId: number }> {
        await this.openUploadDialog();
        await this.fillCreateDialog(values);

        const uploadResponsePromise = this.page.waitForResponse(
            (response) =>
                response.url().includes("/environment-maps/with-file") &&
                response.request().method() === "POST",
        );

        await this.uploadDialog
            .getByRole("button", { name: /^Upload$/i })
            .last()
            .click();

        const uploadResponse = await uploadResponsePromise;
        await expect(uploadResponse.ok()).toBeTruthy();
        const payload = await uploadResponse.json();

        await expect(this.uploadDialog).toBeHidden({ timeout: 30000 });
        await this.waitForListReady();

        return {
            environmentMapId: payload.environmentMapId ?? payload.id,
        };
    }

    async waitForEnvironmentMapByName(
        name: string,
        timeout = 30000,
    ): Promise<void> {
        const card = this.getEnvironmentMapCardByName(name);
        const firstAttemptTimeout = Math.min(timeout, 15000);
        try {
            await expect(card).toBeVisible({ timeout: firstAttemptTimeout });
        } catch {
            await this.page.reload({ waitUntil: "domcontentloaded" });
            await this.waitForListReady();
            await expect(card).toBeVisible({
                timeout: Math.max(timeout - firstAttemptTimeout, 15000),
            });
        }
    }

    async openEnvironmentMapByName(name: string): Promise<void> {
        const card = this.getEnvironmentMapCardByName(name);
        await expect(card).toBeVisible({ timeout: 15000 });
        await card.click();
        await this.waitForViewer(name);
    }

    async waitForViewer(name: string): Promise<void> {
        void name;
        await expect(this.viewerRoot).toBeVisible({ timeout: 15000 });
        await expect(this.viewerMenubar).toBeVisible({ timeout: 15000 });
    }

    async waitForPreviewSizeLabel(label: string, timeout = 15000): Promise<void> {
        await this.openViewerMenu("Variants");
        await expect(
            this.page
                .locator(
                    `.p-submenu-list:visible .p-menuitem-link:has(.p-menuitem-text:text-is("${label}"))`,
                )
                .first(),
        ).toBeVisible({ timeout });
        await this.page.keyboard.press("Escape").catch(() => {});
    }

    async getPreviewSizeLabels(): Promise<string[]> {
        return (await this.page
            .locator(".p-submenu-list .p-menuitem-text")
            .allTextContents())
            .map((text) => text.trim())
            .filter(Boolean);
    }

    async getViewerVariantCount(): Promise<number> {
        return this.getDetailValueNumber("Variants");
    }

    async getDetailValue(label: string): Promise<string> {
        const row = this.page
            .locator(".environment-map-detail-list > div")
            .filter({ has: this.page.locator("dt", { hasText: label }) });

        if ((await row.count()) === 0) {
            await this.openViewerPanel("Left Panel", "Informations");
        }

        return ((await row.first().locator("dd").first().textContent()) ?? "").trim();
    }

    async getDetailValueNumber(label: string): Promise<number> {
        return Number(await this.getDetailValue(label));
    }

    async waitForThreeJsPreviewLoaded(timeout = 30000): Promise<void> {
        await expect(
            this.page.locator(".environment-map-preview-placeholder"),
        ).toHaveCount(0, { timeout });
        await expect(
            this.page.locator(".environment-map-preview-overlay"),
        ).toHaveCount(0, { timeout });
        await expect(this.previewCanvas).toBeVisible({ timeout });
        await expect(async () => {
            const box = await this.previewCanvas.boundingBox();
            expect(box).not.toBeNull();
            expect((box?.width ?? 0) > 0).toBe(true);
            expect((box?.height ?? 0) > 0).toBe(true);
        }).toPass({ timeout });
    }

    async waitForCardThumbnailLoaded(name: string, timeout = 30000): Promise<void> {
        const image = this.getEnvironmentMapCardThumbnailByName(name);
        await expect(image).toBeVisible({ timeout });

        await expect
            .poll(
                async () => {
                    const state = await image.evaluate((node) => {
                        if (!(node instanceof HTMLImageElement)) {
                            return { loaded: false };
                        }
                        return {
                            loaded:
                                node.complete &&
                                node.naturalWidth > 0 &&
                                node.naturalHeight > 0,
                        };
                    });
                    return state.loaded;
                },
                { timeout, intervals: [1000, 2000, 3000] },
            )
            .toBe(true);
    }

    async getCardThumbnailState(name: string): Promise<{
        hasPlaceholder: boolean;
        hasImage: boolean;
        imageSrc: string | null;
        currentSrc: string | null;
        isLoaded: boolean;
    }> {
        const placeholder = this.getEnvironmentMapCardPlaceholderByName(name);
        const image = this.getEnvironmentMapCardThumbnailByName(name);
        const hasImage = (await image.count()) > 0;

        if (!hasImage) {
            return {
                hasPlaceholder:
                    (await placeholder.count()) > 0 &&
                    (await placeholder.first().isVisible().catch(() => false)),
                hasImage: false,
                imageSrc: null,
                currentSrc: null,
                isLoaded: false,
            };
        }

        const imageState = await image.first().evaluate((node) => {
            if (!(node instanceof HTMLImageElement)) {
                return {
                    src: null,
                    currentSrc: null,
                    isLoaded: false,
                };
            }

            return {
                src: node.getAttribute("src"),
                currentSrc: node.currentSrc || null,
                isLoaded:
                    node.complete &&
                    node.naturalWidth > 0 &&
                    node.naturalHeight > 0,
            };
        });

        return {
            hasPlaceholder:
                (await placeholder.count()) > 0 &&
                (await placeholder.first().isVisible().catch(() => false)),
            hasImage: true,
            imageSrc: imageState.src,
            currentSrc: imageState.currentSrc,
            isLoaded: imageState.isLoaded,
        };
    }

    async startCardThumbnailTransitionTracking(name: string): Promise<void> {
        await this.page.evaluate((targetName) => {
            const key = "__environmentMapThumbnailTracking";
            const existing = (window as any)[key];
            if (existing?.observer) {
                existing.observer.disconnect();
            }
            if (existing?.intervalId) {
                window.clearInterval(existing.intervalId);
            }

            const records: CardThumbnailTransitionRecord[] = [];
            const readState = (): CardThumbnailTransitionRecord => {
                const cards = Array.from(
                    document.querySelectorAll(".environment-map-card"),
                );
                const card = cards.find(
                    (candidate) =>
                        candidate
                            .querySelector(".environment-map-card-name")
                            ?.textContent?.trim() === targetName,
                );

                if (!card) {
                    return {
                        exists: false,
                        hasPlaceholder: false,
                        hasImage: false,
                        imageSrc: null,
                        currentSrc: null,
                        isLoaded: false,
                        timestamp: Date.now(),
                    };
                }

                const placeholder = card.querySelector(
                    ".environment-map-card-placeholder",
                );
                const image = card.querySelector(
                    '[data-testid="environment-map-card-thumbnail"]',
                );

                if (!(image instanceof HTMLImageElement)) {
                    return {
                        exists: true,
                        hasPlaceholder: Boolean(placeholder),
                        hasImage: false,
                        imageSrc: null,
                        currentSrc: null,
                        isLoaded: false,
                        timestamp: Date.now(),
                    };
                }

                return {
                    exists: true,
                    hasPlaceholder: Boolean(placeholder),
                    hasImage: true,
                    imageSrc: image.getAttribute("src"),
                    currentSrc: image.currentSrc || null,
                    isLoaded:
                        image.complete &&
                        image.naturalWidth > 0 &&
                        image.naturalHeight > 0,
                    timestamp: Date.now(),
                };
            };

            const pushState = () => {
                const next = readState();
                const previous = records[records.length - 1];
                const hasChanged =
                    !previous ||
                    previous.exists !== next.exists ||
                    previous.hasPlaceholder !== next.hasPlaceholder ||
                    previous.hasImage !== next.hasImage ||
                    previous.imageSrc !== next.imageSrc ||
                    previous.currentSrc !== next.currentSrc ||
                    previous.isLoaded !== next.isLoaded;

                if (hasChanged) {
                    records.push(next);
                }
            };

            pushState();

            const observer = new MutationObserver(() => {
                pushState();
            });
            observer.observe(
                document.querySelector(".environment-map-list") ?? document.body,
                {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["src", "class"],
                },
            );

            const intervalId = window.setInterval(pushState, 100);
            (window as any)[key] = { records, observer, intervalId };
        }, name);
    }

    async getTrackedCardThumbnailTransitions(): Promise<CardThumbnailTransitionRecord[]> {
        return this.page.evaluate(() => {
            const tracking = (window as any).__environmentMapThumbnailTracking;
            return tracking?.records ?? [];
        });
    }

    async stopCardThumbnailTransitionTracking(): Promise<void> {
        await this.page.evaluate(() => {
            const key = "__environmentMapThumbnailTracking";
            const tracking = (window as any)[key];
            if (tracking?.observer) {
                tracking.observer.disconnect();
            }
            if (tracking?.intervalId) {
                window.clearInterval(tracking.intervalId);
            }
            delete (window as any)[key];
        });
    }

    async waitForCardThumbnailToUseGeneratedPreview(
        name: string,
        environmentMapId: number,
        timeout = 180000,
    ): Promise<void> {
        await expect
            .poll(
                async () => {
                    const state = await this.getCardThumbnailState(name);
                    return {
                        hasPlaceholder: state.hasPlaceholder,
                        src: state.currentSrc ?? state.imageSrc ?? "",
                        isLoaded: state.isLoaded,
                    };
                },
                { timeout, intervals: [500, 1000, 2000, 5000] },
            )
            .toEqual({
                hasPlaceholder: false,
                src: expect.stringContaining(
                    `/environment-maps/${environmentMapId}/preview`,
                ),
                isLoaded: true,
            });
    }

    async getCardThumbnailSrc(name: string): Promise<string> {
        await this.waitForCardThumbnailLoaded(name);
        return (await this.getEnvironmentMapCardThumbnailByName(name).getAttribute("src")) ?? "";
    }

    async uploadCustomThumbnailInViewer(
        payload: UploadFilePayload,
    ): Promise<void> {
        await expect(this.viewerRoot).toBeVisible({ timeout: 10000 });
        await this.openViewerPanel("Left Panel", "Thumbnail");
        const input = this.page.locator(
            ".environment-map-thumbnail-panel input[type='file']",
        );
        await input.setInputFiles(payload);
    }

    async waitForViewerCustomThumbnailLoaded(timeout = 30000): Promise<void> {
        await this.openViewerPanel("Left Panel", "Thumbnail");
        const image = this.page.locator(".environment-map-thumbnail-card img");

        await expect
            .poll(
                async () => {
                    const state = await image.first().evaluate((node) => {
                        if (!(node instanceof HTMLImageElement)) {
                            return { loaded: false };
                        }
                        return {
                            loaded: node.complete && node.naturalWidth > 0,
                        };
                    });
                    return state.loaded;
                },
                { timeout, intervals: [1000, 2000, 3000] },
            )
            .toBe(true);
    }

    async getViewerThumbnailSrc(): Promise<string> {
        await this.waitForViewerCustomThumbnailLoaded();
        return (
            (await this.page
                .locator(".environment-map-thumbnail-card img")
                .getAttribute("src")) ?? ""
        );
    }

    async getViewerCustomThumbnailSrc(): Promise<string> {
        return this.getViewerThumbnailSrc();
    }

    async regenerateThumbnailInViewer(): Promise<void> {
        await expect(this.viewerRoot).toBeVisible({ timeout: 10000 });
        await this.openViewerPanel("Left Panel", "Thumbnail");
        const regenerateResponsePromise = this.page.waitForResponse(
            (response) =>
                response.url().includes("/thumbnail/regenerate") &&
                response.request().method() === "POST",
            { timeout: 10000 },
        );
        const generateButton = this.page
            .locator(".environment-map-thumbnail-panel")
            .getByRole("button", { name: /^Generate$/i });
        await generateButton.evaluate((node) => {
            (node as HTMLButtonElement).click();
        });
        await regenerateResponsePromise;
    }

    async recycleEnvironmentMapByName(name: string): Promise<void> {
        const card = this.getEnvironmentMapCardByName(name);
        await expect(card).toBeVisible({ timeout: 15000 });
        await card.hover();
        await card.locator(".environment-map-card-actions button").click();

        const confirmDialog = this.page.locator(".p-confirm-dialog, .p-dialog");
        await confirmDialog.waitFor({ state: "visible", timeout: 5000 });
        await confirmDialog
            .locator("button.p-button-danger, button:has-text('Yes')")
            .first()
            .click();
        await confirmDialog.waitFor({ state: "hidden", timeout: 10000 });
    }

    private async fillCreateDialog(values: EnvironmentMapDialogValues): Promise<void> {
        if (values.name) {
            await this.uploadDialog.locator("#environment-map-name").fill(values.name);
        }

        if (values.sizeLabel) {
            await this.uploadDialog
                .locator("#environment-map-size-label")
                .fill(values.sizeLabel);
        }

        if (values.cubeFaces) {
            await this.uploadDialog
                .getByRole("button", { name: /^Cube Faces$/i })
                .click();
            await expect(
                this.uploadDialog.locator(".environment-map-cube-grid"),
            ).toBeVisible({ timeout: 10000 });

            const faceIndex: Record<
                "px" | "nx" | "py" | "ny" | "pz" | "nz",
                number
            > = {
                px: 0,
                nx: 1,
                py: 2,
                ny: 3,
                pz: 4,
                nz: 5,
            };

            for (const face of Object.keys(faceIndex) as Array<
                keyof typeof faceIndex
            >) {
                const payload = values.cubeFaces[face];
                if (!payload) {
                    continue;
                }

                const cubeCard = this.uploadDialog
                    .locator(".environment-map-cube-card")
                    .nth(faceIndex[face]);
                await cubeCard.locator("input[type='file']").setInputFiles(payload);
                await expect(
                    cubeCard.locator(".environment-map-upload-file-name"),
                ).toContainText(payload.name);
            }
        } else if (values.file) {
            const field = this.uploadDialog
                .locator(".environment-map-upload-field")
                .filter({ hasText: "Environment Map File" });
            await field.locator("input[type='file']").setInputFiles(values.file);
            await expect(
                field.locator(".environment-map-upload-file-name"),
            ).toContainText(values.file.name);
        }

        if (values.thumbnailFile) {
            const field = this.uploadDialog
                .locator(".environment-map-upload-field")
                .filter({ hasText: "Custom Thumbnail" });
            await field.locator("input[type='file']").setInputFiles(values.thumbnailFile);
            await expect(
                field.locator(".environment-map-upload-file-name"),
            ).toContainText(values.thumbnailFile.name);
        }
    }

    private async openViewerMenu(menuName: string): Promise<Locator> {
        await expect(this.viewerMenubar).toBeVisible({ timeout: 10000 });

        const menuItem = this.viewerMenubar
            .locator(`.p-menuitem:has(.p-menuitem-text:text-is("${menuName}"))`)
            .first();
        const menuLink = menuItem
            .locator(
                `.p-menuitem-link:has(.p-menuitem-text:text-is("${menuName}"))`,
            )
            .first();
        await expect(menuLink).toBeVisible({ timeout: 5000 });
        await menuLink.scrollIntoViewIfNeeded();
        await menuLink.click({ timeout: 5000 });
        await expect(menuItem.locator('.p-submenu-list').first()).toBeVisible({ timeout: 3000 });
        return menuItem;
    }

    private async openViewerPanel(menuName: string, itemLabel: string): Promise<void> {
        const panelSelector =
            itemLabel === "Informations"
                ? ".environment-map-detail-list"
                : ".environment-map-thumbnail-panel";

        if (await this.page.locator(panelSelector).isVisible().catch(() => false)) {
            return;
        }

        const menuCandidates = [
            menuName,
            "Left Panel",
            "Right Panel",
            "Top Panel",
            "Bottom Panel",
        ].filter((candidate, index, array) => array.indexOf(candidate) === index);

        for (const candidate of menuCandidates) {
            try {
                const menuItem = await this.openViewerMenu(candidate);

                const submenuItem = menuItem
                    .locator(
                        `.p-submenu-list .p-menuitem-link:has(.p-menuitem-text:text-is("${itemLabel}"))`,
                    )
                    .first();
                const submenuVisible = await submenuItem.isVisible().catch(() => false);

                if (submenuVisible) {
                    await submenuItem.click({ force: true, timeout: 2000 });
                } else {
                    await submenuItem.evaluate((node) => {
                        (node as HTMLElement).click();
                    });
                }

                const panelVisible = await this.page
                    .locator(panelSelector)
                    .isVisible({ timeout: 3000 })
                    .catch(() => false);

                if (panelVisible) {
                    return;
                }
            } catch {
                // Try the next panel menu.
            }
        }

        throw new Error(
            `Unable to open "${itemLabel}" panel from any viewer panel menu.`,
        );
    }
}

function escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
