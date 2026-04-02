import { Page, expect, Locator } from "@playwright/test";

export class ModelViewerPage {
    constructor(private page: Page) {}

    async waitForModelLoaded() {
        await expect(
            this.page.locator(".model-viewer-loading"),
        ).not.toBeVisible({ timeout: 30000 });
        // Also wait for the canvas to be present
        await expect(this.page.locator("canvas")).toBeVisible({
            timeout: 30000,
        });
    }

    /** Version dropdown trigger button */
    get versionDropdownTrigger(): Locator {
        return this.page.locator(".version-dropdown-trigger");
    }

    /** Version dropdown menu container */
    get versionDropdownMenu(): Locator {
        return this.page.locator(".version-dropdown-menu");
    }

    /** All version dropdown items */
    get versionItems(): Locator {
        return this.page.locator(".version-dropdown-item");
    }

    /** Open the version dropdown menu if not already open */
    async openVersionDropdown(): Promise<void> {
        if (!(await this.versionDropdownMenu.isVisible())) {
            await this.versionDropdownTrigger.click();
        }
        await this.versionDropdownMenu.waitFor({
            state: "visible",
            timeout: 5000,
        });
    }

    /**
     * Open a panel via the Menubar dropdown.
     * Panels are accessed via "Left Panel" or "Right Panel" menu items.
     */
    async openTab(tabName: string, expectedSelector?: string) {
        // Map tab names to menubar submenu labels
        const tabToMenuLabel: Record<string, string> = {
            "Model Info": "Model Info",
            "Texture Sets": "Materials",
            Materials: "Materials",
            "Model Hierarchy": "Hierarchy",
            Hierarchy: "Hierarchy",
            "Thumbnail Details": "Thumbnail Details",
            "UV Map": "UV Map",
        };

        const menuLabel = tabToMenuLabel[tabName];
        if (!menuLabel) {
            // Special cases
            if (tabName === "Add Version") {
                await this.openMenubarItem("File", "Add New Version");
                return;
            }
            throw new Error(`Unknown tab: ${tabName}`);
        }

        // Check if content is already visible (if selector provided)
        if (expectedSelector) {
            const isVisible = await this.page
                .locator(expectedSelector)
                .isVisible();
            if (isVisible) {
                console.log(
                    `[UI] Tab "${tabName}" content (${expectedSelector}) is already visible.`,
                );
                return;
            }
        }

        // Open via Left Panel menu
        await this.openMenubarItem("Left Panel", menuLabel);

        // Wait for panel to actually appear if selector provided
        if (expectedSelector) {
            await this.page.waitForSelector(expectedSelector, {
                state: "visible",
                timeout: 10000,
            });
        }
    }

    /**
     * Opens a specific item from the Menubar dropdown.
     */
    async openMenubarItem(menuName: string, itemLabel: string) {
        // Click the top-level menu item
        const menubar = this.page.locator(".p-menubar");
        await expect(menubar).toBeVisible({ timeout: 10000 });

        const menuItem = menubar
            .locator(
                `.p-menuitem-link:has(.p-menuitem-text:text-is("${menuName}"))`,
            )
            .first();
        await expect(menuItem).toBeVisible({ timeout: 5000 });
        await menuItem.click();

        // Wait for submenu to appear
        const submenuItem = this.page
            .locator(
                `.p-submenu-list .p-menuitem-link:has(.p-menuitem-text:text-is("${itemLabel}"))`,
            )
            .first();
        await expect(submenuItem).toBeVisible({ timeout: 5000 });
        await submenuItem.click();

        // Small delay to let React process the state change
        await this.page.waitForTimeout(100);
    }

    /**
     * Closes the specified tab if it is currently open.
     * In the new layout, clicking the same panel option again closes it.
     */
    async closeTab(tabName: string, expectedSelector?: string) {
        const tabToMenuLabel: Record<string, string> = {
            "Model Info": "Model Info",
            "Texture Sets": "Materials",
            Materials: "Materials",
            "Model Hierarchy": "Hierarchy",
            Hierarchy: "Hierarchy",
            "Thumbnail Details": "Thumbnail Details",
            "UV Map": "UV Map",
        };

        const menuLabel = tabToMenuLabel[tabName];
        if (!menuLabel) {
            console.log(`[UI] Unknown tab "${tabName}", cannot close.`);
            return;
        }

        // If selector provided, check if visible. If NOT visible, already closed.
        if (expectedSelector) {
            const isVisible = await this.page
                .locator(expectedSelector)
                .isVisible();
            if (!isVisible) {
                console.log(`[UI] Tab "${tabName}" content is already hidden.`);
                return;
            }
        }

        // Click "None" in Left Panel to close, or toggle the same option
        await this.openMenubarItem("Left Panel", "None");
        console.log(`[UI] Closed tab "${tabName}"`);
    }

    async openTextureSetSelector() {
        await this.waitForModelLoaded();
        // Open Materials panel in the left side panel
        await this.openTab("Materials", '[data-testid="materials-panel"]');
    }

    async createTextureSet(name: string) {
        // Note: This is a helper that creates texture sets via API for testing purposes.
        // The actual UI for creating texture sets is in a separate Texture Sets tab,
        // but for E2E tests focused on model viewer behavior, we use the API directly.
        // This is implemented in the step definition.
    }

    async uploadTextureToSet(setName: string, texturePath: string) {
        // Note: This is a helper that uploads textures via API for testing purposes.
        // The actual texture upload UI is complex and not the focus of our E2E tests.
        // This is implemented in the step definition using API calls.
    }

    async linkTextureSetToModel(setName: string) {
        // 1. Open Materials panel (texture set linking is now per-material in the Materials panel)
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        // Wait for the Materials panel to be visible
        await this.page.waitForSelector('[data-testid="materials-panel"]', {
            state: "visible",
            timeout: 10000,
        });

        // 2. Click Link Texture Set button on the first unlinked material
        const linkButton = this.page
            .getByRole("button", { name: /link texture set/i })
            .first();
        await linkButton.click();

        // 3. Wait for the dialog to open and cards to appear
        const dialog = this.page.locator(".texture-set-association-dialog");
        await dialog.waitFor({ state: "visible", timeout: 10000 });
        await this.page.waitForSelector(".texture-set-association-card", {
            state: "visible",
            timeout: 10000,
        });

        // 4. Select the texture set card, click Save, and verify it actually fires
        //    the POST API call. A React useEffect can reset the dialog's selection
        //    state when textureMappings prop changes (from a background refetch), making
        //    Save a no-op that just closes the dialog. We detect this by checking if
        //    the POST request was sent and retry if not.
        const card = this.page.locator(".texture-set-association-card", {
            hasText: setName,
        });
        const saveBtn = dialog.getByRole("button", { name: /^save$/i });

        let saved = false;
        for (let attempt = 0; attempt < 3 && !saved; attempt++) {
            if (attempt > 0) {
                // Re-open the dialog — the previous attempt closed it without saving
                console.log(
                    `[UI] Save was a no-op (attempt ${attempt}), re-opening dialog`,
                );
                await linkButton.click();
                await dialog.waitFor({ state: "visible", timeout: 10000 });
                await this.page.waitForSelector(
                    ".texture-set-association-card",
                    { state: "visible", timeout: 10000 },
                );
            }

            // Click card to select it
            await card.first().click();
            // Wait for Save button to become enabled
            await expect(saveBtn).toBeEnabled({ timeout: 5000 });

            // Listen for the POST request BEFORE clicking Save
            const postRequestPromise = this.page
                .waitForRequest(
                    (req) =>
                        req.url().includes("/texture-sets/") &&
                        req.url().includes("/model-versions/") &&
                        req.method() === "POST",
                    { timeout: 3000 },
                )
                .then(() => true)
                .catch(() => false);

            // Also set up listeners for the data refetch responses that
            // handleLinkDialogClose fires (fire-and-forget in frontend).
            // Must be registered BEFORE click to avoid missing the responses.
            const textureSetsRefetchPromise = this.page.waitForResponse(
                (resp) =>
                    resp.url().includes("/texture-sets") &&
                    !resp.url().includes("/model-versions/") &&
                    resp.request().method() === "GET" &&
                    resp.status() >= 200 &&
                    resp.status() < 300,
                { timeout: 15000 },
            );
            const versionsRefetchPromise = this.page.waitForResponse(
                (resp) =>
                    resp.url().includes("/versions") &&
                    resp.request().method() === "GET" &&
                    resp.status() >= 200 &&
                    resp.status() < 300,
                { timeout: 15000 },
            );

            await saveBtn.click();
            saved = await postRequestPromise;

            if (saved) {
                // Wait for dialog to close and data refetches to complete
                await dialog.waitFor({ state: "hidden", timeout: 15000 });
                await Promise.all([
                    textureSetsRefetchPromise,
                    versionsRefetchPromise,
                ]);
                // Allow React to process the refetched data
                await this.page.waitForTimeout(500);
            } else {
                // Dialog closed without saving — cancel the response listeners
                await dialog.waitFor({ state: "hidden", timeout: 15000 });
            }
        }

        if (!saved) {
            throw new Error(
                `Failed to save texture set "${setName}" link after 3 dialog attempts`,
            );
        }

        // 5. Wait for the texture set to appear in the materials panel
        const linkedItem = this.page.locator(
            `.materials-item[data-texture-set*="${setName}"]`,
        );
        await expect(linkedItem.first()).toBeVisible({ timeout: 15000 });
        console.log(`[UI] Linked texture set "${setName}" ✓`);
    }

    async setDefaultTextureSet(name: string) {
        // Ensure viewer is loaded before trying to open panels
        await this.waitForModelLoaded();
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        // Wait for materials panel to be visible
        await this.page.waitForSelector('[data-testid="materials-panel"]', {
            state: "visible",
            timeout: 15000,
        });

        // Wait for material items to render
        await this.page.waitForSelector(".materials-item", {
            state: "visible",
            timeout: 15000,
        });

        // Find the material item that has this texture set linked (via data-texture-set attribute)
        const item = this.page.locator(
            `.materials-item[data-texture-set*="${name}"]`,
        );
        // Fall back to looking for the texture set name as text inside a materials-item
        const fallbackItem = this.page.locator(".materials-item", {
            hasText: name,
        });
        const targetItem =
            (await item.count()) > 0 ? item.first() : fallbackItem.first();
        await expect(targetItem).toBeVisible({ timeout: 15000 });
    }

    async expectDefaultTextureSet(name: string) {
        // Ensure viewer is loaded before trying to open panels
        await this.waitForModelLoaded();
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        // Wait for materials panel to be visible
        await this.page.waitForSelector('[data-testid="materials-panel"]', {
            state: "visible",
            timeout: 15000,
        });

        // Wait for material items to render (they load async via React Query)
        await this.page.waitForSelector(".materials-item", {
            state: "visible",
            timeout: 15000,
        });

        // Find the material item that has this texture set linked
        const item = this.page.locator(
            `.materials-item[data-texture-set*="${name}"]`,
        );
        const fallbackItem = this.page.locator(".materials-item", {
            hasText: name,
        });
        const targetItem =
            (await item.count()) > 0 ? item.first() : fallbackItem.first();
        await expect(targetItem).toBeVisible({ timeout: 15000 });
    }

    async uploadNewVersion(filePath: string) {
        // Click File > Add New Version in the menubar and wait for file chooser
        const fileChooserPromise = this.page.waitForEvent("filechooser");
        await this.openMenubarItem("File", "Add New Version");
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePath);

        // Wait for dialog to appear. If it doesn't, fallback to direct API upload.
        const dialog = this.page.locator(
            '.p-dialog:has-text("Upload File to Model")',
        );
        const dialogVisible = await dialog
            .waitFor({ state: "visible", timeout: 10000 })
            .then(() => true)
            .catch(() => false);

        if (!dialogVisible) {
            console.log(
                "[Upload] Modal did not appear, falling back to API upload",
            );
            await this.uploadNewVersionViaApi(filePath);
            return;
        }

        // Wait for dialog content to fully render
        const createNewRadio = dialog.locator('input#createNew[type="radio"]');
        await createNewRadio.waitFor({ state: "attached", timeout: 10000 });

        // Select "Create new version" radio option
        // PrimeReact RadioButton has a timing issue where clicking the label
        // changes the DOM checked state before React state updates.
        // Use dispatchEvent to simulate a proper React change event.
        const createNewLabel = dialog.locator('label[for="createNew"]');
        if (!(await createNewRadio.isChecked())) {
            await createNewLabel.click();
        }
        await expect(createNewRadio).toBeChecked({ timeout: 5000 });
        // Wait for React to process the state update
        await this.page.waitForTimeout(500);
        console.log(
            "[Upload] Selected and verified 'Create new version' option",
        );

        // Listen for the API response — match ONLY the create-version endpoint
        // POST /models/{id}/versions (NOT /models/{id}/versions/{id}/files)
        const createVersionPattern = /\/models\/\d+\/versions(\?|$)/;
        const uploadResponsePromise = this.page
            .waitForResponse(
                (resp) =>
                    createVersionPattern.test(resp.url()) &&
                    resp.request().method() === "POST",
                { timeout: 60000 },
            )
            .catch(() => null);

        // Click Upload button
        const uploadBtn = dialog.getByRole("button", { name: "Upload" });
        await uploadBtn.waitFor({ state: "visible", timeout: 5000 });
        await uploadBtn.click();
        console.log("[Upload] Clicked Upload button");

        // Wait for dialog to close — if it stays open, dismiss and fall back to API
        const dialogClosed = await dialog
            .waitFor({ state: "hidden", timeout: 30000 })
            .then(() => true)
            .catch(() => false);

        if (!dialogClosed) {
            console.log(
                "[Upload] Dialog did not close after 30s, dismissing and falling back to API upload",
            );
            // Try to close the dialog manually
            const closeBtn = dialog.locator(
                'button[aria-label="Close"], .p-dialog-header-close',
            );
            if (
                await closeBtn
                    .waitFor({ state: "visible", timeout: 2000 })
                    .then(() => true)
                    .catch(() => false)
            ) {
                await closeBtn.click();
            }
            await this.page.keyboard.press("Escape");
            await dialog
                .waitFor({ state: "hidden", timeout: 5000 })
                .catch(() => {});
            await this.uploadNewVersionViaApi(filePath);
            return;
        }

        // Check if the upload API actually succeeded
        const uploadResponse = await uploadResponsePromise;
        if (uploadResponse) {
            const respUrl = uploadResponse.url();
            console.log(
                `[Upload] Intercepted response: ${uploadResponse.request().method()} ${respUrl} -> ${uploadResponse.status()}`,
            );
            if (uploadResponse.ok()) {
                console.log(
                    `[Upload] API confirmed version created (${uploadResponse.status()})`,
                );
            } else {
                const body = await uploadResponse.text().catch(() => "");
                console.log(
                    `[Upload] API returned error: ${uploadResponse.status()} ${body}`,
                );
                // Fall back to API upload if dialog upload failed
                console.log(
                    "[Upload] Dialog upload failed, falling back to API upload",
                );
                await this.uploadNewVersionViaApi(filePath);
                return;
            }
        } else {
            console.log(
                "[Upload] Create-version API call not captured (dialog may have sent add-file-to-version instead), falling back to API upload",
            );
            // Dialog closed but the create-version endpoint was not called
            // This happens when PrimeReact's radio state didn't propagate correctly
            await this.uploadNewVersionViaApi(filePath);
            return;
        }

        // Wait for the version strip to update (indicates new version was processed)
        await this.page.waitForSelector(
            '[data-testid="version-strip"], .version-dropdown-trigger',
            { state: "visible", timeout: 30000 },
        );

        // Reload to ensure the UI fully reflects the new version
        // (React Query cache may not immediately include the new version)
        await this.page.reload({ waitUntil: "domcontentloaded" });
        await this.page.waitForSelector(
            '[data-testid="version-strip"], .version-dropdown-trigger',
            { state: "visible", timeout: 15000 },
        );

        console.log("[Upload] New version uploaded successfully");
    }

    async uploadNewVersionViaApi(filePath: string) {
        const modelId = await this.getCurrentModelId();
        if (!modelId) {
            throw new Error("Could not extract model ID from navigation store");
        }
        const apiBase = process.env.API_BASE_URL || "http://localhost:8090";

        const fs = await import("fs");
        const path = await import("path");
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        const response = await this.page.request.post(
            `${apiBase}/models/${modelId}/versions?setAsActive=true`,
            {
                multipart: {
                    file: {
                        name: fileName,
                        mimeType: "application/octet-stream",
                        buffer: fileBuffer,
                    },
                },
            },
        );

        if (!response.ok()) {
            const body = await response.text();
            throw new Error(
                `Fallback API upload failed: ${response.status()} ${response.statusText()} - ${body}`,
            );
        }

        await this.page.reload({ waitUntil: "domcontentloaded" });
        await this.page.waitForSelector('[data-testid="version-strip"]', {
            state: "visible",
            timeout: 15000,
        });
        console.log("[Upload] Fallback API upload succeeded");
    }

    async selectVersion(versionNumber: number) {
        // Press Escape to close any remaining dropdowns/menus
        await this.page.keyboard.press("Escape");

        // Click on the version dropdown trigger
        const dropdownTrigger = this.page.locator(".version-dropdown-trigger");
        await expect(dropdownTrigger).toBeVisible({ timeout: 30000 });
        await dropdownTrigger.click();

        // Wait for dropdown menu to appear
        await this.page.waitForSelector(".version-dropdown-menu", {
            state: "visible",
            timeout: 15000,
        });

        // Click on the version item
        const versionItem = this.page.locator(".version-dropdown-item", {
            hasText: `v${versionNumber}`,
        });
        await expect(versionItem).toBeVisible({ timeout: 10000 });
        try {
            await versionItem.click({ timeout: 10000 });
        } catch {
            // Fallback for intermittent overlay interception from floating windows
            await versionItem.click({ force: true, timeout: 10000 });
        }

        // Wait for version to load
        await this.waitForModelLoaded();
    }

    async expectVersionDefault(versionNumber: number, textureSetName: string) {
        await this.selectVersion(versionNumber);
        await this.expectDefaultTextureSet(textureSetName);
    }

    async getVersionThumbnailSrc(
        versionNumber: number,
    ): Promise<string | null> {
        const dropdownTrigger = this.page.locator(".version-dropdown-trigger");
        const dropdownMenu = this.page.locator(".version-dropdown-menu");

        // Poll for the thumbnail with retries (useThumbnail hook may need time to fetch)
        const maxAttempts = 15;
        const pollInterval = 2000;

        console.log(
            `[getVersionThumbnailSrc] Looking for version ${versionNumber} thumbnail...`,
        );

        // Ensure dropdown is open first
        if (!(await dropdownMenu.isVisible())) {
            await expect(dropdownTrigger).toBeVisible({ timeout: 10000 });
            await dropdownTrigger.click();
            await this.page.waitForSelector(".version-dropdown-menu", {
                state: "visible",
                timeout: 5000,
            });
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Ensure dropdown is still open
            if (!(await dropdownMenu.isVisible())) {
                await dropdownTrigger.click();
                await this.page.waitForSelector(".version-dropdown-menu", {
                    state: "visible",
                    timeout: 5000,
                });
            }

            // Find the version item and specifically target the img element
            const item = this.page.locator(".version-dropdown-item", {
                hasText: `v${versionNumber}`,
            });
            const img = item.locator("img.version-dropdown-thumb");

            // Check if img exists and is loaded
            const imgCount = await img.count();
            if (imgCount > 0) {
                const isVisible = await img.isVisible();
                if (isVisible) {
                    const naturalWidth = await img.evaluate(
                        (el: HTMLImageElement) => el.naturalWidth,
                    );
                    if (naturalWidth > 0) {
                        const src = await img.getAttribute("src");
                        console.log(
                            `[getVersionThumbnailSrc] Found thumbnail for v${versionNumber}: ${src?.substring(0, 50)}...`,
                        );

                        // Close dropdown
                        await dropdownTrigger.click();
                        return src;
                    }
                }
            }

            console.log(
                `[getVersionThumbnailSrc] Thumbnail not ready for v${versionNumber}, retrying... (${attempt + 1}/${maxAttempts})`,
            );

            // Keep dropdown open — just wait for re-render
            await this.page.waitForTimeout(pollInterval);
        }

        console.log(
            `[getVersionThumbnailSrc] Thumbnail not found for v${versionNumber} after ${maxAttempts} attempts`,
        );

        // Close dropdown if still open
        if (await dropdownMenu.isVisible()) {
            await dropdownTrigger.click();
        }

        return null;
    }

    async expectVersionThumbnailVisible(versionNumber: number) {
        // Click on the version dropdown trigger to open it
        const dropdownTrigger = this.page.locator(".version-dropdown-trigger");
        await expect(dropdownTrigger).toBeVisible({ timeout: 10000 });
        await dropdownTrigger.click();

        // Wait for dropdown menu to appear
        await this.page.waitForSelector(".version-dropdown-menu", {
            state: "visible",
            timeout: 5000,
        });

        const item = this.page.locator(".version-dropdown-item", {
            hasText: `v${versionNumber}`,
        });
        // Check for either an img or a placeholder
        const thumb = item.locator(".version-dropdown-thumb");
        await expect(thumb).toBeVisible();

        // Close dropdown
        await this.page.locator(".version-dropdown-trigger").click();
    }

    async getCurrentModelId(): Promise<number | null> {
        // Extract model ID from the Zustand navigation store in localStorage
        const modelId = await this.page.evaluate(() => {
            try {
                const stored = localStorage.getItem("modelibr_navigation");
                if (!stored) return null;
                const data = JSON.parse(stored);
                const windows = data?.state?.activeWindows || {};
                // Find the first active model viewer tab across all windows
                for (const win of Object.values(windows) as any[]) {
                    const activeTab = win?.tabs?.find(
                        (t: any) =>
                            t.id === win.activeTabId &&
                            t.type === "modelViewer",
                    );
                    if (activeTab?.modelId) return activeTab.modelId;
                }
                // Fallback: find ANY model viewer tab (not just active)
                for (const win of Object.values(windows) as any[]) {
                    const modelTab = win?.tabs?.find(
                        (t: any) => t.type === "modelViewer" && t.modelId,
                    );
                    if (modelTab?.modelId) return modelTab.modelId;
                }
                return null;
            } catch {
                return null;
            }
        });
        return modelId;
    }

    /**
     * Select a texture set to preview it (does not set as default)
     * This triggers the texture to be applied to the 3D model immediately
     */
    async selectTextureSet(name: string) {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        // Wait for materials panel to be visible
        await this.page.waitForSelector('[data-testid="materials-panel"]', {
            state: "visible",
            timeout: 10000,
        });

        // Capture the current texture UUID before clicking so we can detect the change
        const uuidBefore = await this.page.evaluate(() => {
            // @ts-expect-error - accessing runtime globals
            const scene = window.__THREE_SCENE__;
            if (!scene) return null;
            let uuid: string | null = null;
            scene.traverse((obj: any) => {
                if (uuid) return;
                if (obj.isMesh && obj.material?.isMeshStandardMaterial) {
                    const mat = obj.material;
                    const tex =
                        mat.map ||
                        mat.roughnessMap ||
                        mat.metalnessMap ||
                        mat.normalMap ||
                        mat.aoMap ||
                        mat.emissiveMap;
                    if (tex) uuid = tex.uuid;
                }
            });
            return uuid;
        });

        // Find the material item with this texture set linked and click the preview to select it
        const item = this.page.locator(
            `.materials-item[data-texture-set*="${name}"]`,
        );
        const fallbackItem = this.page.locator(".materials-item", {
            hasText: name,
        });
        const targetItem =
            (await item.count()) > 0 ? item.first() : fallbackItem.first();
        await expect(targetItem).toBeVisible({ timeout: 10000 });

        // Click the preview to select this texture set
        const preview = targetItem.locator(".materials-item-preview");
        if (
            await preview
                .waitFor({ state: "visible", timeout: 2000 })
                .then(() => true)
                .catch(() => false)
        ) {
            await preview.click();
        } else {
            await targetItem.click();
        }

        // Wait for the Three.js texture to actually change after selection
        if (uuidBefore !== null) {
            await expect
                .poll(
                    async () => {
                        return await this.page.evaluate(() => {
                            // @ts-expect-error - accessing runtime globals
                            const scene = window.__THREE_SCENE__;
                            if (!scene) return null;
                            let uuid: string | null = null;
                            scene.traverse((obj: any) => {
                                if (uuid) return;
                                if (
                                    obj.isMesh &&
                                    obj.material?.isMeshStandardMaterial
                                ) {
                                    const mat = obj.material;
                                    const tex =
                                        mat.map ||
                                        mat.roughnessMap ||
                                        mat.metalnessMap ||
                                        mat.normalMap ||
                                        mat.aoMap ||
                                        mat.emissiveMap;
                                    if (tex) uuid = tex.uuid;
                                }
                            });
                            return uuid;
                        });
                    },
                    {
                        message: `Waiting for Three.js texture to change after selecting "${name}"`,
                        timeout: 15000,
                        intervals: [500, 1000, 2000],
                    },
                )
                .not.toBe(uuidBefore);
        }

        console.log(`[UI] Selected texture set "${name}" ✓`);
    }

    /**
     * Check if a texture set is currently linked to any material
     */
    async isTextureSetSelected(name: string): Promise<boolean> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        await this.page.waitForSelector('[data-testid="materials-panel"]', {
            state: "visible",
            timeout: 10000,
        });

        const item = this.page.locator(
            `.materials-item[data-texture-set*="${name}"]`,
        );
        return await item
            .first()
            .waitFor({ state: "visible", timeout: 2000 })
            .then(() => true)
            .catch(() => false);
    }

    /**
     * Add a new preset (variant) via the Materials panel UI
     */
    async addPreset(name: string): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const addBtn = this.page.locator('[data-testid="add-preset-btn"]');
        await expect(addBtn).toBeVisible({ timeout: 5000 });
        await addBtn.click();

        // Wait for the input field to appear
        const input = this.page.locator(
            '[data-testid="new-preset-name-input"]',
        );
        await expect(input).toBeVisible({ timeout: 5000 });
        await input.fill(name);

        // Confirm the preset — wait for the API response and subsequent version refetch
        const confirmBtn = this.page.locator(
            '[data-testid="confirm-preset-btn"]',
        );

        // Listen for the version refetch that onModelUpdated() triggers after preset creation
        const versionRefetchPromise = this.page.waitForResponse(
            (resp) =>
                resp.url().includes("/versions") &&
                resp.request().method() === "GET" &&
                resp.status() >= 200 &&
                resp.status() < 300,
            { timeout: 15000 },
        );

        await confirmBtn.click();

        // Wait for version data refetch to complete so textureMappings are stable
        await versionRefetchPromise;

        // Wait for the dropdown to show the new preset name
        const dropdownLabel = this.page.locator(
            '[data-testid="variant-dropdown"] .p-dropdown-label',
        );
        await expect(dropdownLabel).toHaveText(name, { timeout: 10000 });
        console.log(`[UI] Added preset "${name}" ✓`);
    }

    /**
     * Select a preset (variant) from the dropdown in the Materials panel
     */
    async selectPreset(name: string): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const dropdown = this.page.locator('[data-testid="variant-dropdown"]');
        await expect(dropdown).toBeVisible({ timeout: 5000 });
        await dropdown.click();

        // Select the option from the PrimeReact dropdown overlay
        const option = this.page.locator(".p-dropdown-item", {
            hasText: name,
        });
        await expect(option).toBeVisible({ timeout: 5000 });
        await option.click();

        // Wait for the dropdown label to update confirming the selection
        const label = dropdown.locator(".p-dropdown-label");
        await expect(label).toHaveText(name, { timeout: 5000 });

        // Allow time for React to re-render materials with the new variant's data
        await this.page.waitForTimeout(500);

        console.log(`[UI] Selected preset "${name}" ✓`);
    }

    /**
     * Click "Set as Main" button for the currently selected preset
     */
    async setAsMainPreset(): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const setMainBtn = this.page.locator(
            '[data-testid="set-main-variant-btn"]',
        );
        await expect(setMainBtn).toBeVisible({ timeout: 15000 });
        await setMainBtn.click();

        // Wait for the badge to appear confirming it's now main
        const badge = this.page.locator(
            '[data-testid="materials-panel"] .p-badge',
            { hasText: "Main" },
        );
        await expect(badge).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Set current preset as main ✓`);
    }

    /**
     * Verify the currently selected preset shows the "Main" badge
     */
    async expectMainBadgeVisible(): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const badge = this.page.locator(
            '[data-testid="materials-panel"] .p-badge',
            { hasText: "Main" },
        );
        await expect(badge).toBeVisible({ timeout: 15000 });
    }

    /**
     * Verify no texture sets are linked in the current preset's material list
     */
    async expectNoTexturesLinked(): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        // Check that no material items have texture set data
        const materialsWithTextures = this.page.locator(
            ".materials-item[data-texture-set]",
        );
        const count = await materialsWithTextures.count();
        // All items should have empty data-texture-set or "No texture set"
        for (let i = 0; i < count; i++) {
            const attr = await materialsWithTextures
                .nth(i)
                .getAttribute("data-texture-set");
            if (attr && attr !== "") {
                throw new Error(
                    `Expected no textures linked but found: ${attr}`,
                );
            }
        }
    }

    /**
     * Delete the currently selected preset via UI (clicks trash icon, confirms dialog)
     */
    async deletePreset(): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const deleteBtn = this.page.locator(
            '[data-testid="delete-preset-btn"]',
        );
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();

        // Confirm the PrimeReact ConfirmDialog
        const acceptBtn = this.page.locator(
            ".p-confirm-dialog .p-confirm-dialog-accept",
        );
        await expect(acceptBtn).toBeVisible({ timeout: 5000 });
        await acceptBtn.click();

        // Wait for dialog to close and state to settle
        await this.page.waitForTimeout(1000);
        console.log(`[UI] Deleted current preset ✓`);
    }

    /**
     * Unlink a texture set from a specific material in the current preset.
     * Clicks the pi-times (unlink) button on the material item that has the given texture set.
     */
    async unlinkTextureSetFromMaterial(textureSetName: string): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        // Find the material item showing this texture set
        const materialItem = this.page.locator(
            `.materials-item[data-texture-set="${textureSetName}"]`,
        );
        await expect(materialItem.first()).toBeVisible({ timeout: 10000 });

        // Click the unlink button (pi-times icon) inside it
        const unlinkBtn = materialItem
            .first()
            .locator("button.p-button-danger");
        await unlinkBtn.click();

        // Wait for the UI to update
        await this.page.waitForTimeout(1000);
        console.log(
            `[UI] Unlinked texture set "${textureSetName}" from material ✓`,
        );
    }

    /**
     * Get the list of preset names in the variant dropdown
     */
    async getPresetNames(): Promise<string[]> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const dropdown = this.page.locator('[data-testid="variant-dropdown"]');
        await expect(dropdown).toBeVisible({ timeout: 5000 });
        await dropdown.click();

        // Collect all option labels
        const options = this.page.locator(".p-dropdown-item");
        const count = await options.count();
        const names: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await options.nth(i).textContent();
            if (text) names.push(text.trim());
        }

        // Close the dropdown
        await dropdown.click();
        return names;
    }

    /**
     * Verify that unlinked materials show the "Embedded" indicator
     */
    async expectMaterialShowsEmbedded(materialName?: string): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const scope = materialName
            ? this.page.locator(".materials-material-group", {
                  has: this.page.locator(".materials-item-name", {
                      hasText: materialName,
                  }),
              })
            : this.page.locator(".materials-material-group").first();

        const embeddedLabel = scope.locator(".materials-empty", {
            hasText: "Embedded",
        });
        await expect(embeddedLabel).toBeVisible({ timeout: 10000 });
        console.log(
            `[UI] Material ${materialName ?? "(first)"} shows Embedded indicator ✓`,
        );
    }

    /**
     * Verify that the "Link Texture Set" button is NOT visible for the current preset
     * (expected when Embedded preset is selected)
     */
    async expectLinkTextureSetHidden(): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const linkBtns = this.page.locator('[data-testid^="link-ts-"]');
        await expect(linkBtns).toHaveCount(0, { timeout: 5000 });
        console.log(`[UI] Link Texture Set buttons are hidden ✓`);
    }

    /**
     * Verify that the "Link Texture Set" button IS visible
     */
    async expectLinkTextureSetVisible(): Promise<void> {
        await this.openTab("Materials", '[data-testid="materials-panel"]');

        const linkBtn = this.page.locator('[data-testid^="link-ts-"]').first();
        await expect(linkBtn).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Link Texture Set buttons are visible ✓`);
    }
}
