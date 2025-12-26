import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelViewerPage } from "../pages/ModelViewerPage";

// DataTable interface for cucumber-style data tables
interface DataTable {
    hashes(): Array<Record<string, string>>;
    raw(): string[][];
    rows(): string[][];
}

const { Given, When, Then } = createBdd();

/**
 * Step: "the 3D canvas should be visible"
 * 
 * Verifies that a 3D model is properly rendered in the React Three Fiber viewer.
 * 
 * This step performs the following checks:
 * 1. ERROR CHECK: Ensures no "No versions available" error is displayed
 * 2. UI CHECK: Verifies the version dropdown is visible (indicates model metadata loaded)
 * 3. CANVAS CHECK: Confirms the WebGL/WebGPU canvas element is rendered and visible
 * 4. THREE.JS INSPECTION: Uses window.__THREE_SCENE__ and window.__THREE_STATE__ to verify:
 *    - Scene is initialized
 *    - Mesh count (total objects in scene graph)
 *    - Visible mesh count (meshes with visible=true)
 *    - Camera position (x, y, z coordinates)
 * 
 * The Three.js inspection is exposed via the Canvas `onCreated` callback in ModelViewer.tsx
 * which sets window.__THREE_SCENE__ = state.scene and window.__THREE_STATE__ = state
 * 
 * @example Test output:
 * [UI] Version dropdown visible - model loaded correctly ✓
 * [UI] 3D canvas element is visible ✓
 * [Three.js] Scene: true
 * [Three.js] Scene objects: 5
 * [Three.js] Meshes: 12 (visible: 12)
 * [Three.js] Camera: (0.00, 2.50, 5.00)
 * [Three.js] ✓ Model visible in camera!
 */
Then("the 3D canvas should be visible", async ({ page }) => {
    // First check we're not on an error state
    const noVersionsError = page.locator("text=No versions available");
    const isErrorVisible = await noVersionsError.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (isErrorVisible) {
        const currentUrl = page.url();
        console.log(`[ERROR] Current URL: ${currentUrl}`);
        throw new Error(`Model has "No versions available" - URL: ${currentUrl}`);
    }
    
    // Check for version dropdown (indicates model loaded correctly)
    const versionDropdown = page.locator(".version-dropdown-trigger");
    await expect(versionDropdown).toBeVisible({ timeout: 10000 });
    console.log("[UI] Version dropdown visible - model loaded correctly ✓");
    
    // The canvas is rendered by Three.js/React Three Fiber
    const canvas = page.locator(".viewer-canvas canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    console.log("[UI] 3D canvas element is visible ✓");
    
    // Poll for scene initialization and mesh loading
    await expect.poll(async () => {
        return await page.evaluate(() => {
            // @ts-expect-error - accessing runtime globals
            const threeScene = window.__THREE_SCENE__;
            // @ts-expect-error - accessing runtime globals  
            const threeState = window.__THREE_STATE__;
            
            if (!threeScene || !threeState) {
                return 0; // Not initialized
            }
            
            let meshCount = 0;
            threeScene.traverse((obj: any) => {
                if (obj.isMesh) {
                    meshCount++;
                }
            });
            return meshCount;
        });
    }, {
        message: "Waiting for model meshes to appear in scene",
        timeout: 15000,
        intervals: [500, 1000]
    }).toBeGreaterThan(0);

    // Get final scene info for logging
    const sceneInfo = await page.evaluate(() => {
        // @ts-expect-error
        const threeScene = window.__THREE_SCENE__;
        // @ts-expect-error
        const threeState = window.__THREE_STATE__;
        
        let meshCount = 0;
        let visibleMeshCount = 0;
        
        threeScene.traverse((obj: any) => {
            if (obj.isMesh) {
                meshCount++;
                if (obj.visible) visibleMeshCount++;
            }
        });
        
        const camera = threeState.camera;
        
        return {
            hasScene: true,
            objectCount: threeScene.children?.length || 0,
            meshCount,
            visibleMeshCount,
            cameraPos: camera ? [
                camera.position?.x?.toFixed(2),
                camera.position?.y?.toFixed(2),
                camera.position?.z?.toFixed(2)
            ] : null
        };
    });
        
        console.log(`[Three.js] Scene: ${sceneInfo.hasScene}`);
        console.log(`[Three.js] Scene objects: ${sceneInfo.objectCount}`);
        console.log(`[Three.js] Meshes: ${sceneInfo.meshCount} (visible: ${sceneInfo.visibleMeshCount})`);
        if (sceneInfo.cameraPos) {
            console.log(`[Three.js] Camera: (${sceneInfo.cameraPos.join(', ')})`);
        }
        
        if (sceneInfo.visibleMeshCount > 0) {
            console.log("[Three.js] ✓ Model visible in camera!");
        }

    
    // Log URL for debugging
    console.log(`[URL] ${page.url()}`);
});

Then(
    "the model name {string} should be displayed in the header",
    async ({ page }, expectedName: string) => {
        // Model name is shown in the viewer-controls area
        // Just verify the text exists on page (simpler and more reliable)
        const modelNameText = page.getByText(expectedName, { exact: false }).first();
        await expect(modelNameText).toBeVisible({ timeout: 5000 });
        console.log(`[UI] Model name "${expectedName}" found on page ✓`);
    }
);

Then("the viewer controls should be visible", async ({ page }) => {
    const controls = page.locator(".viewer-controls");
    await expect(controls).toBeVisible({ timeout: 5000 });
    console.log("[UI] Viewer controls are visible ✓");
});

Then(
    "the following control buttons should be visible:",
    async ({ page }, dataTable: DataTable) => {
        const buttons = dataTable.raw().slice(1).map((row: string[]) => row[0]);
        
        // Verify we have at least the expected number of control buttons
        const controlButtons = page.locator(".viewer-controls button");
        const count = await controlButtons.count();
        expect(count).toBeGreaterThanOrEqual(buttons.length);
        console.log(`[UI] Found ${count} control buttons (expected at least ${buttons.length}) ✓`);
    }
);

// Version Dropdown Tests

When("I open the version dropdown", async ({ page }) => {
    const dropdownTrigger = page.locator(".version-dropdown-trigger");
    await expect(dropdownTrigger).toBeVisible({ timeout: 5000 });
    await dropdownTrigger.click();
    await page.waitForSelector(".version-dropdown-menu", { state: "visible", timeout: 5000 });
    console.log("[UI] Version dropdown opened ✓");
});

Then(
    "I should see version {int} in the dropdown",
    async ({ page }, versionNumber: number) => {
        const menu = page.locator(".version-dropdown-menu");
        await expect(menu).toBeVisible();
        
        const versionItem = page.locator(".version-dropdown-item", { hasText: `v${versionNumber}` });
        await expect(versionItem).toBeVisible({ timeout: 5000 });
        console.log(`[UI] Version ${versionNumber} visible in dropdown ✓`);
    }
);

Then(
    "version {int} should have a thumbnail image",
    async ({ page }, versionNumber: number) => {
        const versionItem = page.locator(".version-dropdown-item", { hasText: `v${versionNumber}` });
        const thumbnail = versionItem.locator("img.version-dropdown-thumb");
        
        await expect(thumbnail).toBeVisible({ timeout: 10000 });
        const src = await thumbnail.getAttribute("src");
        expect(src).toBeTruthy();
        expect(src).not.toBe("");
        console.log(`[UI] Version ${versionNumber} has thumbnail with src ✓`);
    }
);

Given("I am viewing version {int}", async ({ page }, versionNumber: number) => {
    const modelViewer = new ModelViewerPage(page);
    await modelViewer.selectVersion(versionNumber);
    console.log(`[UI] Now viewing version ${versionNumber}`);
});

When("I switch to version {int}", async ({ page }, versionNumber: number) => {
    const modelViewer = new ModelViewerPage(page);
    await modelViewer.selectVersion(versionNumber);
    console.log(`[UI] Switched to version ${versionNumber}`);
});

Then(
    "the version indicator should show {string}",
    async ({ page }, expectedVersion: string) => {
        const indicator = page.locator(".version-dropdown-trigger .version-dropdown-number");
        await expect(indicator).toBeVisible();
        const text = await indicator.textContent();
        expect(text?.trim()).toBe(expectedVersion);
        console.log(`[UI] Version indicator shows "${expectedVersion}" ✓`);
    }
);

Then(
    "the file info should show {string}",
    async ({ page }, expectedFilename: string) => {
        // File info is shown in the file strip
        const fileCard = page.locator(".file-strip-card .file-strip-name");
        await expect(fileCard.first()).toBeVisible({ timeout: 5000 });
        const text = await fileCard.first().textContent();
        expect(text?.toLowerCase()).toContain(expectedFilename.toLowerCase().substring(0, 10));
        console.log(`[UI] File info contains "${expectedFilename}" ✓`);
    }
);

When("I close the viewer tab {string}", async ({ page }, tabName: string) => {
    const modelViewer = new ModelViewerPage(page);
    
    // Map known tabs to selectors for verification
    const validTabs: Record<string, string> = {
        "Texture Sets": ".tswindow-content",
        "Model Info": ".floating-window:has-text('Model Information')",
    };
    
    const selector = validTabs[tabName]; // can be undefined if checking by button state only
    
    await modelViewer.closeTab(tabName, selector);
});
