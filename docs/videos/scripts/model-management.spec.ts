import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import {
    shortPause,
    mediumPause,
    longPause,
    viewerPause,
    smoothMoveTo,
    humanClick,
    smoothDrag,
    navigateTo,
    waitForModelCards,
    waitForThumbnails,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Model Management", () => {
    test("Model Management Video", async ({ page }) => {
        // ── Setup: clear all data so we start with a clean library ──
        await clearAllData(page);

        // ── Navigate to the app ──
        await navigateTo(page, "/");
        await disableHighlights(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Upload 4 models via the UI file chooser
        // ────────────────────────────────────────────────────────────
        const modelFiles = [
            path.join(assetsDir, "test-cube.glb"),
            path.join(assetsDir, "test-cone.fbx"),
            path.join(assetsDir, "test-cylinder.fbx"),
            path.join(assetsDir, "test-icosphere.fbx"),
        ];

        // Move mouse to the upload button so the viewer sees cursor intent
        await smoothMoveTo(page, 'button[aria-label="Upload models"]');
        await page.waitForTimeout(400);

        // Trigger file chooser and upload 4 models
        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByLabel("Upload models").click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(modelFiles);

        // Wait for the upload progress window to appear
        await page
            .locator("#upload-progress-window")
            .waitFor({ state: "visible", timeout: 15000 });
        await mediumPause(page);

        // Wait for upload completion (all 4 completed)
        await page
            .locator(".upload-summary-text")
            .filter({ hasText: /4 completed/i })
            .waitFor({ state: "visible", timeout: 60000 });
        await longPause(page);

        // Close the upload progress window
        const closeButton = page
            .locator('#upload-progress-window button[title="Close"]')
            .first();
        if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await humanClick(
                page,
                '#upload-progress-window button[title="Close"]',
            );
        } else {
            // Try clicking outside to dismiss
            await page.mouse.click(10, 10);
        }
        await mediumPause(page);

        // Wait for model cards to appear
        await waitForModelCards(page, 4);

        // Wait for thumbnails to be generated (worker service renders them)
        await waitForThumbnails(page, 4, 90000);
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 2: Select first model, then open it on the right panel
        // ────────────────────────────────────────────────────────────

        // Click the first model card to open it
        await humanClick(page, ".model-card >> nth=0");
        await mediumPause(page);

        // Get the model ID from the currently active tab or URL
        // We need the model ID to construct the URL for side-by-side view
        const firstModelId = await page.evaluate(() => {
            const activeTab = document.querySelector(".draggable-tab.active");
            if (activeTab) {
                const tabId =
                    activeTab.getAttribute("data-tab-id") || activeTab.id || "";
                const match = tabId.match(/model-(\d+)/);
                if (match) return match[1];
            }
            // Fallback: parse from URL
            const url = new URL(window.location.href);
            const params = url.searchParams;
            const rightTabs =
                params.get("rightTabs") || params.get("leftTabs") || "";
            const match = rightTabs.match(/model-(\d+)/);
            return match ? match[1] : null;
        });

        // If we found the model ID, navigate to show it on the right panel
        // with the model list on the left
        if (firstModelId) {
            await navigateTo(
                page,
                `/?leftTabs=modelList&rightTabs=model-${firstModelId}&activeRight=model-${firstModelId}`,
            );
        } else {
            // Fallback: get model IDs from API
            const modelsRes = await page.request.get(`${API_BASE_URL}/models`);
            const models = await modelsRes.json();
            if (models.length > 0) {
                const id = models[0].id;
                await navigateTo(
                    page,
                    `/?leftTabs=modelList&rightTabs=model-${id}&activeRight=model-${id}`,
                );
            }
        }
        await disableHighlights(page);
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 3: Open the second model on the left panel
        // ────────────────────────────────────────────────────────────

        // Click the second model card in the left panel to open it there
        const leftPanel = page.locator(".p-splitter-panel >> nth=0");
        await leftPanel
            .locator(".model-card >> nth=1")
            .waitFor({ state: "visible", timeout: 10000 });
        await shortPause(page);

        // Smoothly move to the second model card and click it
        const secondCard = leftPanel.locator(".model-card >> nth=1");
        const secondCardBox = await secondCard.boundingBox();
        if (secondCardBox) {
            await page.mouse.move(
                secondCardBox.x + secondCardBox.width / 2,
                secondCardBox.y + secondCardBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
            await page.mouse.click(
                secondCardBox.x + secondCardBox.width / 2,
                secondCardBox.y + secondCardBox.height / 2,
            );
        }
        await mediumPause(page);

        // Wait for the model to load — a canvas should appear in the left panel
        await leftPanel
            .locator("canvas")
            .waitFor({ state: "visible", timeout: 15000 });
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 4: Rotate camera on the left viewer (left-click drag)
        // ────────────────────────────────────────────────────────────

        // Find the canvas in the left panel
        const leftCanvas = leftPanel.locator("canvas").first();
        const canvasBox = await leftCanvas.boundingBox();

        if (canvasBox) {
            const centerX = canvasBox.x + canvasBox.width / 2;
            const centerY = canvasBox.y + canvasBox.height / 2;

            // Smooth drag: from center, upward and slightly right to rotate the view
            await smoothDrag(
                page,
                centerX,
                centerY,
                centerX + 80,
                centerY - 100,
                40, // more steps for smoother camera rotation
                "left",
            );
            await mediumPause(page);

            // Do a second smaller rotation for a nice viewing angle
            await smoothDrag(
                page,
                centerX + 40,
                centerY - 40,
                centerX + 120,
                centerY - 60,
                30,
                "left",
            );
        }
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 5: Upload test-torus.fbx as a new version of the
        //         model currently shown on the right panel
        // ────────────────────────────────────────────────────────────

        // Click the right panel to make it active
        const rightPanel = page.locator(".p-splitter-panel >> nth=1");
        const rightCanvas = rightPanel.locator("canvas").first();
        const rightCanvasBox = await rightCanvas.boundingBox();
        if (rightCanvasBox) {
            await page.mouse.click(
                rightCanvasBox.x + rightCanvasBox.width / 2,
                rightCanvasBox.y + rightCanvasBox.height / 2,
            );
        }
        await mediumPause(page);

        // Click the "Add Version" button (plus icon in viewer controls)
        const addVersionButton = rightPanel
            .locator(".viewer-controls button:has(.pi-plus)")
            .first();
        await addVersionButton.waitFor({ state: "visible", timeout: 10000 });

        const addVersionBox = await addVersionButton.boundingBox();
        if (addVersionBox) {
            await page.mouse.move(
                addVersionBox.x + addVersionBox.width / 2,
                addVersionBox.y + addVersionBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
        }

        // Trigger file chooser for version upload
        const versionFileChooserPromise = page.waitForEvent("filechooser");
        await addVersionButton.click();
        const versionFileChooser = await versionFileChooserPromise;
        await versionFileChooser.setFiles([
            path.join(assetsDir, "test-torus.fbx"),
        ]);

        // Handle the "Upload File to Model" dialog
        // Wait for the dialog to appear
        const uploadDialog = page.locator(
            '.p-dialog:has-text("Upload File to Model")',
        );
        await uploadDialog.waitFor({ state: "visible", timeout: 15000 });
        await mediumPause(page);

        // Select "Create new version" radio button
        await page.getByLabel("Create new version").click();
        await shortPause(page);

        // Click the "Upload" button in the dialog footer
        // The footer is a child of the dialog with class p-dialog-footer
        const dialogUploadBtn = uploadDialog
            .locator(".p-dialog-footer button", { hasText: "Upload" })
            .first();
        await dialogUploadBtn.waitFor({ state: "visible", timeout: 5000 });
        await dialogUploadBtn.click();

        // Wait for the upload progress — the version upload uses the same upload window
        // Give it time to complete the upload
        await page.waitForTimeout(5000);

        // Close any upload progress window if visible
        const uploadCloseBtn2 = page
            .locator('#upload-progress-window button[title="Close"]')
            .first();
        if (
            await uploadCloseBtn2
                .isVisible({ timeout: 2000 })
                .catch(() => false)
        ) {
            await uploadCloseBtn2.click();
            await shortPause(page);
        }

        // Dismiss any dialogs that may still be open (e.g., the upload dialog re-appearing)
        const openDialog = page.locator(".p-dialog:visible");
        const dialogCloseBtn = openDialog
            .locator(
                'button:has(.pi-times), button[aria-label="Close"], button:has-text("Close"), button:has-text("Cancel")',
            )
            .first();
        if (
            await dialogCloseBtn.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
            await dialogCloseBtn.click();
            await shortPause(page);
        }
        // Also dismiss any remaining dialog masks
        const dialogMask = page.locator(".p-dialog-mask");
        if (await dialogMask.isVisible({ timeout: 1000 }).catch(() => false)) {
            await page.keyboard.press("Escape");
            await shortPause(page);
        }

        // Wait for the viewer to reload with the new version
        await rightPanel
            .locator("canvas")
            .waitFor({ state: "visible", timeout: 15000 });
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 6: Open the version dropdown to see the new version
        // ────────────────────────────────────────────────────────────

        // Click the version dropdown trigger
        const versionDropdown = rightPanel
            .locator(".version-dropdown-trigger")
            .first();
        await versionDropdown.waitFor({ state: "visible", timeout: 10000 });

        const dropdownBox = await versionDropdown.boundingBox();
        if (dropdownBox) {
            await page.mouse.move(
                dropdownBox.x + dropdownBox.width / 2,
                dropdownBox.y + dropdownBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
        }
        await versionDropdown.click();

        // Wait for dropdown items to appear
        await page
            .locator(".version-dropdown-item")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 7: Final pause — let the viewer see the final state
        // ────────────────────────────────────────────────────────────

        // Move mouse away from the dropdown so the final frame is clean
        await page.mouse.move(640, 360, { steps: 15 });
        await longPause(page);

        // Extra pause for the viewer to absorb the final screen
        await viewerPause(page, 3000);
    });
});
