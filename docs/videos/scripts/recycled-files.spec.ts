import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
    ciVideoTimeout,
    mediumPause,
    viewerPause,
    smoothMoveTo,
    humanRightClick,
    navigateTo,
    waitForModelCards,
    waitForThumbnails,
    clearAllData,
    disableHighlights,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Recycled Files", () => {
    test("Recycled Files Video", async ({ page: setupPage }, testInfo) => {
        const page = setupPage;

        const waitForMenuStateToSettle = async () => {
            await page.evaluate(
                () =>
                    new Promise<void>((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(() => resolve()),
                        ),
                    ),
            );
        };

        const expectNoErrorToast = async () => {
            await expect(page.locator(".p-toast-message-error")).toHaveCount(0);
        };

        const recycleModelFromGrid = async (modelId: string) => {
            const modelSelector = `.model-card[data-model-id="${modelId}"]`;
            const modelCard = page.locator(modelSelector);

            await humanRightClick(page, modelSelector);
            const contextMenu = page.locator(".p-contextmenu");
            await contextMenu.waitFor({ state: "visible", timeout: 5000 });
            await waitForMenuStateToSettle();
            await viewerPause(page, 500);

            const recycleItem = contextMenu
                .locator(".p-menuitem")
                .filter({ hasText: /^Recycle$/ })
                .first();

            await smoothMoveTo(page, ".p-contextmenu .p-menuitem:has-text('Recycle')");
            await viewerPause(page, 300);
            await recycleItem.click();

            await expect(modelCard).toBeHidden({ timeout: ciVideoTimeout });
            await expect(
                page
                    .locator(".p-toast-message-success")
                    .filter({ hasText: /moved to recycled files/i }),
            ).toBeVisible({ timeout: 5000 });
            await expectNoErrorToast();
        };

        // ── Setup: clear all data so we start with a clean library ──
        await clearAllData(setupPage);

        // ── Upload 3 models via API (fast, not shown in video) ──
        const modelFiles = [
            path.join(assetsDir, "test-cube.glb"),
            path.join(assetsDir, "test-cone.fbx"),
            path.join(assetsDir, "test-cylinder.fbx"),
        ];

        for (const file of modelFiles) {
            const buffer = fs.readFileSync(file);
            await setupPage.request.post(`${API_BASE_URL}/models`, {
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
        await waitForModelCards(page, 3);
        await waitForThumbnails(page, 3, 90000);
        await mediumPause(page);
        await startFeatureRecording(page, testInfo, { slug: "recycled-files" });

        const secondModelId = await page
            .locator(".model-card[data-model-id]")
            .nth(1)
            .getAttribute("data-model-id");
        const thirdModelId = await page
            .locator(".model-card[data-model-id]")
            .nth(2)
            .getAttribute("data-model-id");
        if (!secondModelId || !thirdModelId) {
            throw new Error("Could not determine recycled-files target model ids");
        }

        // ────────────────────────────────────────────────────────────
        // Step 1: Recycle one model from the library
        // ────────────────────────────────────────────────────────────

        await recycleModelFromGrid(thirdModelId);
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 2: Restore it from Recycled Files
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
            .waitFor({ state: "visible", timeout: ciVideoTimeout });
        await viewerPause(page, 600);

        // Verify we see 1 recycled item
        const recycledCards = page.locator(".recycled-card");
        await expect(recycledCards).toHaveCount(1, { timeout: ciVideoTimeout });
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 3: Restore the recycled model
        // ────────────────────────────────────────────────────────────

        const firstRecycled = page.locator(".recycled-card").nth(0);
        await smoothMoveTo(page, ".recycled-card >> nth=0");
        await viewerPause(page, 600);

        const restoreBtn = firstRecycled.locator(
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
            await viewerPause(page, 300);
        }
        await restoreBtn.click();
        await mediumPause(page);

        // Wait for the restored card to disappear from recycled view
        await page.waitForFunction(
            () => document.querySelectorAll(".recycled-card").length === 0,
            { timeout: ciVideoTimeout },
        );
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 4: Recycle a different model, then delete it forever
        // ────────────────────────────────────────────────────────────

        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await disableHighlights(page);
        await waitForModelCards(page, 3);
        await waitForThumbnails(page, 3, 60000);
        await mediumPause(page);

        await recycleModelFromGrid(secondModelId);
        await mediumPause(page);

        await navigateTo(
            page,
            "/?leftTabs=recycledFiles&activeLeft=recycledFiles",
        );
        await disableHighlights(page);
        await expect(recycledCards).toHaveCount(1, { timeout: ciVideoTimeout });
        await mediumPause(page);

        const recycledToDelete = page.locator(".recycled-card").first();
        await smoothMoveTo(page, ".recycled-card >> nth=0");
        await viewerPause(page, 600);

        const deleteBtn = recycledToDelete.locator(
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
            await viewerPause(page, 300);
        }
        await deleteBtn.click();
        await mediumPause(page);

        const confirmDialog = page.locator(".p-dialog");
        await confirmDialog.waitFor({ state: "visible", timeout: 5000 });
        await viewerPause(page, 700);

        const confirmButton = confirmDialog
            .locator("button")
            .filter({ hasText: /Delete Forever/i })
            .first();
        await confirmButton.click();
        await mediumPause(page);
        await confirmDialog.waitFor({ state: "hidden", timeout: ciVideoTimeout });
        await expect(recycledCards).toHaveCount(0, { timeout: ciVideoTimeout });

        // ────────────────────────────────────────────────────────────
        // Step 5: Go back to Models and verify
        // ────────────────────────────────────────────────────────────

        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await disableHighlights(page);

        // Wait for model cards — should now be 2 (one kept + one restored)
        await waitForModelCards(page, 2);
        await waitForThumbnails(page, 2, 60000);
        await mediumPause(page);

        // Move mouse to center of viewport for a clean final frame
        const viewport = page.viewportSize();
        if (viewport) {
            await page.mouse.move(viewport.width / 2, viewport.height / 2, {
                steps: 20,
            });
        }

        // Final viewer pause to show the restored model is back
        await viewerPause(page, 1200);
        await stopFeatureRecording(page);
    });
});
