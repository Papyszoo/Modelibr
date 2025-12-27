import { Page, expect } from "@playwright/test";

export class ModelViewerPage {
    constructor(private page: Page) {}

    async waitForModelLoaded() {
        await expect(
            this.page.locator(".model-viewer-loading")
        ).not.toBeVisible({ timeout: 30000 });
        // Also wait for the canvas to be present
        await expect(this.page.locator("canvas")).toBeVisible({ timeout: 30000 });
    }

    async openTextureSetSelector() {
        await this.waitForModelLoaded();
        // Click the Texture Sets button with pi-palette icon
        await this.page
            .locator('.viewer-controls button:has(.pi-palette)')
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
            const isVisible = await this.page.locator(expectedSelector).isVisible();
            if (isVisible) {
                console.log(`[UI] Tab "${tabName}" content (${expectedSelector}) is already visible.`);
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
            `.viewer-controls button:has(.${iconClass})`
        );
        await expect(button).toBeVisible({ timeout: 10000 });
        
        // Fallback: Check button class if no selector provided
        // This helps if we don't know the window selector but know the button behavior
        const classAttribute = await button.getAttribute("class");
        if (!expectedSelector && classAttribute && (classAttribute.includes("active") || classAttribute.includes("p-highlight"))) {
            console.log(`[UI] Tab "${tabName}" appears active (button class). Skipping click.`);
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
            const isVisible = await this.page.locator(expectedSelector).isVisible();
            if (!isVisible) {
                console.log(`[UI] Tab "${tabName}" content is already hidden.`);
                return;
            }
        }

        const button = this.page.locator(
            `.viewer-controls button:has(.${iconClass})`
        );
        
        // If selector NOT provided, check button class.
        // If button is NOT active, assume closed.
        if (!expectedSelector) {
             const classAttribute = await button.getAttribute("class");
             const isActive = classAttribute && (classAttribute.includes("active") || classAttribute.includes("p-highlight"));
             if (!isActive) {
                 console.log(`[UI] Tab "${tabName}" button is not active. Assuming closed.`);
                 return;
             }
        }
        
        // Click to close
        await button.click();
        
        // Wait for it to disappear if selector known
        if (expectedSelector) {
            await expect(this.page.locator(expectedSelector)).toBeHidden({ timeout: 5000 });
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
        await this.page.waitForSelector('.floating-window:has-text("Model Information")', {
            state: "visible",
            timeout: 10000,
        });

        // 2. Click Link Texture Sets button
        await this.page
            .getByRole("button", { name: /link texture sets/i })
            .click();

        // 3. Wait for dialog and select the set
        await this.page.waitForSelector('.texture-set-association-card', {
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
        await this.page.waitForTimeout(1000);
    }

    async setDefaultTextureSet(name: string) {
        await this.openTab("Texture Sets", ".tswindow-content");
        
        // Wait for texture set window to be visible
        await this.page.waitForSelector('.tswindow-content', {
            state: "visible",
            timeout: 10000,
        });
        
        // Find the texture set item and click the "Set as default" button
        const item = this.page.locator(".tswindow-item", { hasText: name });
        await expect(item).toBeVisible({ timeout: 10000 });
        
        // Click the star button to set as default
        await item.locator(".tswindow-btn-default").click();
        
        // Wait for the update to complete
        await this.page.waitForTimeout(1000);
    }

    async expectDefaultTextureSet(name: string) {
        await this.openTab("Texture Sets");
        
        // Wait for texture set window to be visible
        await this.page.waitForSelector('.tswindow-content', {
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
        await this.page.getByRole('button', { name: 'Add Version' }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePath);

        // Wait for dialog to appear
        const dialog = this.page.locator('.p-dialog');
        await dialog.waitFor({ state: "visible", timeout: 10000 });
        
        // Wait for dialog content to fully render
        await this.page.waitForTimeout(1500);
        
        // Select "Create new version" radio option
        const createNewLabel = this.page.getByText('Create new version');
        await createNewLabel.waitFor({ state: "visible", timeout: 5000 });
        await createNewLabel.click();
        console.log("[Upload] Selected 'Create new version' option");
        await this.page.waitForTimeout(500);
        
        // Click Upload button
        const uploadBtn = dialog.getByRole('button', { name: 'Upload' });
        await uploadBtn.waitFor({ state: "visible", timeout: 5000 });
        await uploadBtn.click();
        console.log("[Upload] Clicked Upload button");

        // Wait for dialog to close
        await dialog.waitFor({ state: "hidden", timeout: 60000 });
        
        // Wait for page to stabilize
        await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await this.page.waitForTimeout(1000);
        
        console.log("[Upload] New version uploaded successfully");
    }

    async selectVersion(versionNumber: number) {
        // Close any open floating windows that might block clicks
        const closeButtons = this.page.locator('.floating-window .pi-times, .floating-window button[aria-label="Close"]');
        const closeButtonCount = await closeButtons.count();
        for (let i = 0; i < closeButtonCount; i++) {
            try {
                await closeButtons.nth(i).click({ timeout: 1000 });
            } catch {
                // Ignore if already closed
            }
        }
        
        // Also press Escape to close any remaining modals/dropdowns
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);

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
        await versionItem.click();

        // Wait for version to load
        await this.page.waitForTimeout(1000);
    }

    async expectVersionDefault(versionNumber: number, textureSetName: string) {
        await this.selectVersion(versionNumber);
        await this.expectDefaultTextureSet(textureSetName);
    }

    async getVersionThumbnailSrc(versionNumber: number): Promise<string | null> {
        const dropdownTrigger = this.page.locator(".version-dropdown-trigger");
        const dropdownMenu = this.page.locator(".version-dropdown-menu");
        
        // Poll for the thumbnail with retries (useThumbnail hook may need time to fetch)
        const maxAttempts = 15;
        const pollInterval = 2000;
        
        console.log(`[getVersionThumbnailSrc] Looking for version ${versionNumber} thumbnail...`);
        
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
                    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
                    if (naturalWidth > 0) {
                        const src = await img.getAttribute("src");
                        console.log(`[getVersionThumbnailSrc] Found thumbnail for v${versionNumber}: ${src?.substring(0, 50)}...`);
                        
                        // Close dropdown
                        await dropdownTrigger.click();
                        return src;
                    }
                }
            }
            
            console.log(`[getVersionThumbnailSrc] Thumbnail not ready for v${versionNumber}, retrying... (${attempt + 1}/${maxAttempts})`);
            
            // Close dropdown for retry
            if (await dropdownMenu.isVisible()) {
                await dropdownTrigger.click();
            }
            await this.page.waitForTimeout(pollInterval);
        }
        
        console.log(`[getVersionThumbnailSrc] Thumbnail not found for v${versionNumber} after ${maxAttempts} attempts`);
        
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
        // Extract model ID from URL query parameters
        // URL format: /?leftTabs=modelList,model-{id}&activeLeft=model-{id}
        const url = this.page.url();
        const match = url.match(/model-(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    /**
     * Select a texture set to preview it (does not set as default)
     * This triggers the texture to be applied to the 3D model immediately
     */
    async selectTextureSet(name: string) {
        await this.openTab("Texture Sets", ".tswindow-content");
        
        // Wait for texture set window to be visible
        await this.page.waitForSelector('.tswindow-content', {
            state: "visible",
            timeout: 10000,
        });
        
        // Find and click the texture set item to select it
        const item = this.page.locator(".tswindow-item", { hasText: name });
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();
        
        // Wait for texture to be applied
        await this.page.waitForTimeout(2000);
        
        console.log(`[UI] Selected texture set "${name}" ✓`);
    }

    /**
     * Check if a texture set is currently selected (highlighted in the selector)
     */
    async isTextureSetSelected(name: string): Promise<boolean> {
        await this.openTab("Texture Sets");
        
        await this.page.waitForSelector('.tswindow-content', {
            state: "visible",
            timeout: 10000,
        });
        
        const item = this.page.locator(".tswindow-item.tswindow-selected", { hasText: name });
        return await item.isVisible({ timeout: 2000 }).catch(() => false);
    }
}
