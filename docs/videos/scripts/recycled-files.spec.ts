import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
    shortPause,
    mediumPause,
    longPause,
    viewerPause,
    smoothMoveTo,
    humanClick,
    humanRightClick,
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

test.describe("Recycled Files", () => {
    test("Recycled Files Video", async ({ page }) => {
        // ── Setup: clear all data so we start with a clean library ──
        await clearAllData(page);

        // ── Upload 4 models via API (fast, not shown in video) ──
        const modelFiles = [
            path.join(assetsDir, "test-cube.glb"),
            path.join(assetsDir, "test-cone.fbx"),
            path.join(assetsDir, "test-cylinder.fbx"),
            path.join(assetsDir, "test-icosphere.fbx"),
        ];

        for (const file of modelFiles) {
            const buffer = fs.readFileSync(file);
            await page.request.post(`${API_BASE_URL}/models`, {
                multipart: {
                    file: {
                        name: path.basename(file),
                        mimeType: "application/octet-stream",
                        buffer,
                    },
                },
            });
        }

        // ── Navigate to model list and wait for cards + thumbnails ──
        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await disableHighlights(page);
        await waitForModelCards(page, 4);
        await waitForThumbnails(page, 4, 90000);
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Recycle the 3rd model via right-click context menu
        // ────────────────────────────────────────────────────────────

        // Move to the 3rd model card and right-click
        await smoothMoveTo(page, ".model-card >> nth=2");
        await page.waitForTimeout(400);
        const thirdCard = page.locator(".model-card >> nth=2");
        const thirdBox = await thirdCard.boundingBox();
        if (thirdBox) {
            await page.mouse.click(
                thirdBox.x + thirdBox.width / 2,
                thirdBox.y + thirdBox.height / 2,
                { button: "right" },
            );
        }
        await shortPause(page);

        // Wait for context menu and click "Recycle"
        await page
            .locator(".p-contextmenu")
            .waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);
        const recycleItem = page
            .locator(".p-contextmenu .p-menuitem")
            .filter({ hasText: /Recycle/i })
            .first();
        await smoothMoveTo(
            page,
            ".p-contextmenu .p-menuitem:has-text('Recycle')",
        );
        await page.waitForTimeout(300);
        await recycleItem.click();
        await mediumPause(page);

        // Wait for the card to disappear (now 3 cards)
        await page.waitForFunction(
            () => document.querySelectorAll(".model-card").length <= 3,
            { timeout: 10000 },
        );
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 2: Recycle the 4th model (now at index 2 after removal)
        // ────────────────────────────────────────────────────────────

        await smoothMoveTo(page, ".model-card >> nth=2");
        await page.waitForTimeout(400);
        const fourthCard = page.locator(".model-card >> nth=2");
        const fourthBox = await fourthCard.boundingBox();
        if (fourthBox) {
            await page.mouse.click(
                fourthBox.x + fourthBox.width / 2,
                fourthBox.y + fourthBox.height / 2,
                { button: "right" },
            );
        }
        await shortPause(page);

        // Wait for context menu and click "Recycle"
        await page
            .locator(".p-contextmenu")
            .waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);
        const recycleItem2 = page
            .locator(".p-contextmenu .p-menuitem")
            .filter({ hasText: /Recycle/i })
            .first();
        await smoothMoveTo(
            page,
            ".p-contextmenu .p-menuitem:has-text('Recycle')",
        );
        await page.waitForTimeout(300);
        await recycleItem2.click();
        await mediumPause(page);

        // Wait for the card to disappear (now 2 cards)
        await page.waitForFunction(
            () => document.querySelectorAll(".model-card").length <= 2,
            { timeout: 10000 },
        );
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 3: Navigate to Recycled Files tab
        // ────────────────────────────────────────────────────────────

        await navigateTo(
            page,
            "/?leftTabs=recycledFiles&activeLeft=recycledFiles",
        );
        await disableHighlights(page);

        // Wait for recycled cards to appear
        await page
            .locator(".recycled-card")
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
        await mediumPause(page);

        // Verify we see 2 recycled items
        const recycledCards = page.locator(".recycled-card");
        await expect(recycledCards).toHaveCount(2, { timeout: 10000 });
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 4: Permanently delete the first recycled model
        // ────────────────────────────────────────────────────────────

        // Hover over the first recycled card to reveal action buttons
        const firstRecycled = page.locator(".recycled-card").nth(0);
        await smoothMoveTo(page, ".recycled-card >> nth=0");
        await page.waitForTimeout(600);

        // Click the "Delete Forever" button (trash icon in overlay)
        const deleteBtn = firstRecycled.locator(
            ".recycled-card-actions button:has(.pi-trash)",
        );
        await deleteBtn.waitFor({ state: "visible", timeout: 5000 });
        const deleteBtnBox = await deleteBtn.boundingBox();
        if (deleteBtnBox) {
            await page.mouse.move(
                deleteBtnBox.x + deleteBtnBox.width / 2,
                deleteBtnBox.y + deleteBtnBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(300);
        }
        await deleteBtn.click();
        await mediumPause(page);

        // Confirm in the delete confirmation dialog
        const confirmDialog = page.locator(".p-dialog");
        await confirmDialog.waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);

        // Click the "Delete Forever" confirm button
        const confirmButton = confirmDialog
            .locator("button")
            .filter({ hasText: /Delete Forever/i })
            .first();
        const confirmBtnBox = await confirmButton.boundingBox();
        if (confirmBtnBox) {
            await page.mouse.move(
                confirmBtnBox.x + confirmBtnBox.width / 2,
                confirmBtnBox.y + confirmBtnBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(300);
        }
        await confirmButton.click();
        await mediumPause(page);

        // Wait for the dialog to close and the card to disappear
        await confirmDialog.waitFor({ state: "hidden", timeout: 10000 });
        await page.waitForFunction(
            () => document.querySelectorAll(".recycled-card").length <= 1,
            { timeout: 10000 },
        );
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 5: Restore the remaining recycled model
        // ────────────────────────────────────────────────────────────

        // Hover over the remaining recycled card to reveal action buttons
        const remainingRecycled = page.locator(".recycled-card").nth(0);
        await smoothMoveTo(page, ".recycled-card >> nth=0");
        await page.waitForTimeout(600);

        // Click the "Restore" button (replay icon in overlay)
        const restoreBtn = remainingRecycled.locator(
            ".recycled-card-actions button:has(.pi-replay)",
        );
        await restoreBtn.waitFor({ state: "visible", timeout: 5000 });
        const restoreBtnBox = await restoreBtn.boundingBox();
        if (restoreBtnBox) {
            await page.mouse.move(
                restoreBtnBox.x + restoreBtnBox.width / 2,
                restoreBtnBox.y + restoreBtnBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(300);
        }
        await restoreBtn.click();
        await mediumPause(page);

        // Wait for the restored card to disappear from recycled view
        await page.waitForFunction(
            () => document.querySelectorAll(".recycled-card").length === 0,
            { timeout: 10000 },
        );
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 6: Go back to Models and verify
        // ────────────────────────────────────────────────────────────

        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await disableHighlights(page);

        // Wait for model cards — should now be 3 (2 original + 1 restored)
        await waitForModelCards(page, 3);
        await waitForThumbnails(page, 3, 60000);
        await longPause(page);

        // Move mouse to center of viewport for a clean final frame
        const viewport = page.viewportSize();
        if (viewport) {
            await page.mouse.move(viewport.width / 2, viewport.height / 2, {
                steps: 20,
            });
        }

        // Final viewer pause to show the restored model is back
        await viewerPause(page, 3000);
    });
});
