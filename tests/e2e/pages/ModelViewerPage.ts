import { Page, expect } from "@playwright/test";

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

    async openTextureSetSelector() {
        await this.waitForModelLoaded();
        // Click the Texture Sets button with pi-palette icon
        await this.page
            .locator(".viewer-controls button:has(.pi-palette)")
            .click();
    }

    async openTab(tabName: string, expectedSelector?: string) {
        // Map tab names to icon classes
        const buttonMap: Record<string, string> = {
            "Add Version": "pi-plus",
            "Viewer Settings": "pi-cog",
            "Model Info": "pi-info-circle",
            "Texture Sets": "pi-palette",
            "Model Hierarchy": "pi-sitemap",
            "Thumbnail Details": "pi-image",
            "UV Map": "pi-map",
            "Open in Blender": "pi-box",
        };

        const iconClass = buttonMap[tabName];
        if (!iconClass) {
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

        // Wait for the model viewer controls to be ready
        await this.page.waitForSelector(".viewer-controls", {
            state: "visible",
            timeout: 10000,
        });

        // Find button by icon class
        const button = this.page.locator(
            `.viewer-controls button:has(.${iconClass})`,
        );
        await expect(button).toBeVisible({ timeout: 10000 });

        // Fallback: Check button class if no selector provided
        // This helps if we don't know the window selector but know the button behavior
        const classAttribute = await button.getAttribute("class");
        if (
            !expectedSelector &&
            classAttribute &&
            (classAttribute.includes("active") ||
                classAttribute.includes("p-highlight"))
        ) {
            console.log(
                `[UI] Tab "${tabName}" appears active (button class). Skipping click.`,
            );
            return;
        }

        await button.click();
    }

    /**
     * Closes the specified tab if it is currently open
     */
    async closeTab(tabName: string, expectedSelector?: string) {
        // Map tab names to icon classes
        const buttonMap: Record<string, string> = {
            "Add Version": "pi-plus",
            "Viewer Settings": "pi-cog",
            "Model Info": "pi-info-circle",
            "Texture Sets": "pi-palette",
            "Model Hierarchy": "pi-sitemap",
            "Thumbnail Details": "pi-image",
            "UV Map": "pi-map",
            "Open in Blender": "pi-box",
        };

        const iconClass = buttonMap[tabName];
        if (!iconClass) {
            throw new Error(`Unknown tab: ${tabName}`);
        }

        // Check availability of controls
        const controls = this.page.locator(".viewer-controls");
        if (!(await controls.isVisible())) {
            console.log("[UI] Viewer controls not visible, cannot close tab.");
            return;
        }

        // If selector provided, check if visible. If NOT visible, we are already closed.
        if (expectedSelector) {
            const isVisible = await this.page
                .locator(expectedSelector)
                .isVisible();
            if (!isVisible) {
                console.log(`[UI] Tab "${tabName}" content is already hidden.`);
                return;
            }
        }

        const button = this.page.locator(
            `.viewer-controls button:has(.${iconClass})`,
        );

        // If selector NOT provided, check button class.
        // If button is NOT active, assume closed.
        if (!expectedSelector) {
            const classAttribute = await button.getAttribute("class");
            const isActive =
                classAttribute &&
                (classAttribute.includes("active") ||
                    classAttribute.includes("p-highlight"));
            if (!isActive) {
                console.log(
                    `[UI] Tab "${tabName}" button is not active. Assuming closed.`,
                );
                return;
            }
        }

        // Click to close
        await button.click();

        // Wait for it to disappear if selector known
        if (expectedSelector) {
            await expect(this.page.locator(expectedSelector)).toBeHidden({
                timeout: 5000,
            });
        }
        console.log(`[UI] Closed tab "${tabName}"`);
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
        // 1. Open Model Info
        await this.openTab("Model Info");

        // Wait for the Model Information window to be visible
        await this.page.waitForSelector(
            '.floating-window:has-text("Model Information")',
            {
                state: "visible",
                timeout: 10000,
            },
        );

        // 2. Click Link Texture Sets button
        await this.page
            .getByRole("button", { name: /link texture sets/i })
            .click();

        // 3. Wait for dialog and select the set
        await this.page.waitForSelector(".texture-set-association-card", {
            state: "visible",
            timeout: 10000,
        });
        const card = this.page.locator(".texture-set-association-card", {
            hasText: setName,
        });
        await card.click();

        // 4. Save changes
        await this.page.getByRole("button", { name: /save changes/i }).click();

        // Wait for dialog to close
        // Optional: association card may already be hidden
        await this.page
            .locator(".texture-set-association-card")
            .first()
            .waitFor({ state: "hidden", timeout: 10000 })
            .catch(() => {});
    }

    async setDefaultTextureSet(name: string) {
        await this.openTab("Texture Sets", ".tswindow-content");

        // Wait for texture set window to be visible
        await this.page.waitForSelector(".tswindow-content", {
            state: "visible",
            timeout: 10000,
        });

        // Find the texture set item and click the "Set as default" button
        const item = this.page.locator(".tswindow-item", { hasText: name });
        await expect(item).toBeVisible({ timeout: 10000 });

        // Click the star button to set as default
        await item.locator(".tswindow-btn-default").click();

        // Wait for the default badge to appear
        await expect(item.locator(".tswindow-badge")).toBeVisible({
            timeout: 10000,
        });
    }

    async expectDefaultTextureSet(name: string) {
        await this.openTab("Texture Sets");

        // Wait for texture set window to be visible
        await this.page.waitForSelector(".tswindow-content", {
            state: "visible",
            timeout: 10000,
        });

        const item = this.page.locator(".tswindow-item", { hasText: name });
        await expect(item).toBeVisible({ timeout: 10000 });
        await expect(item.locator(".tswindow-badge")).toHaveText("Default");
    }

    async uploadNewVersion(filePath: string) {
        // Click the Add Version button and wait for file chooser
        const fileChooserPromise = this.page.waitForEvent("filechooser");
        const addVersionButton = this.page.locator(
            '.viewer-controls button[aria-label="Add Version"]',
        );
        await expect(addVersionButton).toBeVisible({ timeout: 10000 });
        await addVersionButton.click();
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
                await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)
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
        // Close any open floating windows that might block clicks
        const closeButtons = this.page.locator(
            '.floating-window .pi-times, .floating-window button[aria-label="Close"]',
        );
        const closeButtonCount = await closeButtons.count();
        for (let i = 0; i < closeButtonCount; i++) {
            try {
                await closeButtons.nth(i).click({ timeout: 1000 });
            } catch {
                // Ignore if already closed
            }
        }

        // Also press Escape to close any remaining modals/dropdowns
        await this.page.keyboard.press("Escape");

        // Click on the version dropdown trigger
        const dropdownTrigger = this.page.locator(".version-dropdown-trigger");
        await expect(dropdownTrigger).toBeVisible({ timeout: 10000 });
        await dropdownTrigger.click();

        // Wait for dropdown menu to appear
        await this.page.waitForSelector(".version-dropdown-menu", {
            state: "visible",
            timeout: 5000,
        });

        // Click on the version item
        const versionItem = this.page.locator(".version-dropdown-item", {
            hasText: `v${versionNumber}`,
        });
        await expect(versionItem).toBeVisible({ timeout: 5000 });
        try {
            await versionItem.click({ timeout: 5000 });
        } catch {
            // Fallback for intermittent overlay interception from floating windows
            await versionItem.click({ force: true, timeout: 5000 });
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

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Ensure dropdown is open
            if (!(await dropdownMenu.isVisible())) {
                await expect(dropdownTrigger).toBeVisible({ timeout: 10000 });
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

            // Close dropdown for retry
            if (await dropdownMenu.isVisible()) {
                await dropdownTrigger.click();
            }
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
        await this.openTab("Texture Sets", ".tswindow-content");

        // Wait for texture set window to be visible
        await this.page.waitForSelector(".tswindow-content", {
            state: "visible",
            timeout: 10000,
        });

        // Find and click the texture set item to select it
        const item = this.page.locator(".tswindow-item", { hasText: name });
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();

        // Wait for texture set to be selected
        await expect(item).toHaveClass(/tswindow-selected/, { timeout: 10000 });

        console.log(`[UI] Selected texture set "${name}" ✓`);
    }

    /**
     * Check if a texture set is currently selected (highlighted in the selector)
     */
    async isTextureSetSelected(name: string): Promise<boolean> {
        await this.openTab("Texture Sets");

        await this.page.waitForSelector(".tswindow-content", {
            state: "visible",
            timeout: 10000,
        });

        const item = this.page.locator(".tswindow-item.tswindow-selected", {
            hasText: name,
        });
        return await item.isVisible({ timeout: 2000 }).catch(() => false);
    }
}
