import { test, expect } from "@playwright/test";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    glideTo,
    holdOn,
    mediumPause,
    shortPause,
    viewerPause,
    navigateTo,
    openNewTabPage,
    pickNewTabTile,
    waitForModelCards,
    waitForThumbnails,
    waitForThumbnailsReady,
    settleImportSuggestions,
    clearAllData,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { uploadDemoModel } from "../helpers/demo-art";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Recycled Files", () => {
    test("Recycled Files Video", async ({ page }, testInfo) => {
        // ── Setup: four models, one of them already in the recycle bin ──
        await clearAllData(page);
        const modelIds = [];
        for (const file of ["test-cube.glb", "test-cone.fbx", "test-cylinder.fbx", "test-torus.fbx"]) {
            modelIds.push(await uploadDemoModel(page, file));
        }
        await waitForThumbnailsReady(page, modelIds);
        await settleImportSuggestions(page);
        const [, , cylinderId, torusId] = modelIds;
        expect((await page.request.delete(`${API_BASE_URL}/models/${torusId}`)).ok()).toBeTruthy();

        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await waitForModelCards(page, 3);
        await waitForThumbnails(page, 3, 60000);
        const leftPanel = page.locator(".p-splitter-panel").first();

        await startFeatureRecording(page, testInfo, {
            slug: "recycled-files",
            caption: "Deleting an asset moves it to Recycled Files",
        });

        // ── Step 1: recycle a model from the grid ──
        const cylinderCard = page.locator(`.model-card[data-model-id="${cylinderId}"]`);
        await focusOn(page, page.locator(".model-card"));
        await glideClick(page, cylinderCard, { button: "right" });
        const contextMenu = page.locator(".p-contextmenu");
        await contextMenu.waitFor({ state: "visible", timeout: 5000 });
        await focusOn(page, cylinderCard.or(contextMenu));
        await viewerPause(page, 500);
        await glideClick(
            page,
            contextMenu.locator(".p-menuitem").filter({ hasText: /^Recycle$/ }).first(),
        );
        await focusOn(page, "full");
        await expect(cylinderCard).toBeHidden({ timeout: ciVideoTimeout });
        await mediumPause(page);

        // ── Step 2: open Recycled Files from the New Tab page ──
        await openNewTabPage(page, leftPanel);
        await pickNewTabTile(page, leftPanel, /^Recycled Files$/, page.locator(".recycled-card img"));
        const recycledCards = page.locator(".recycled-card");
        await expect(recycledCards).toHaveCount(2, { timeout: ciVideoTimeout });
        await expect(recycledCards.locator("img")).toHaveCount(2, { timeout: ciVideoTimeout });
        caption(page, "Restore it, or delete it for good");
        await focusOn(page, recycledCards);

        const cylinderRecycled = recycledCards.filter({ hasText: /fuel-barrel/i }).first();
        await glideTo(page, cylinderRecycled);
        await shortPause(page);
        await glideClick(
            page,
            cylinderRecycled.locator(".recycled-card-actions button:has(.pi-replay)"),
        );
        await expect(recycledCards).toHaveCount(1, { timeout: ciVideoTimeout });
        await mediumPause(page);

        const torusRecycled = recycledCards.first();
        await glideTo(page, torusRecycled);
        await shortPause(page);
        // The confirmation opens mid-screen; pull back so it lands in frame.
        await focusOn(page, "full");
        await glideClick(page, torusRecycled.locator(".recycled-card-actions button:has(.pi-trash)"));
        const confirmDialog = page.locator(".p-dialog");
        await confirmDialog.waitFor({ state: "visible", timeout: 5000 });
        await focusOn(page, confirmDialog);
        await viewerPause(page, 900);
        await glideClick(
            page,
            confirmDialog.locator("button").filter({ hasText: /Delete Forever/i }).first(),
            {
                cutUntil: () =>
                    confirmDialog.waitFor({ state: "hidden", timeout: ciVideoTimeout }),
            },
        );
        await expect(recycledCards).toHaveCount(0, { timeout: ciVideoTimeout });
        await focusOn(page, "full");
        await mediumPause(page);

        // ── Step 3: back in the library, the restored model is home ──
        caption(page, null);
        await glideClick(
            page,
            leftPanel.locator('.dock-bar .draggable-tab[data-tab-type="modelList"]').first(),
            { cutUntil: () => waitForModelCards(page, 3) },
        );
        await expect(page.locator(`.model-card[data-model-id="${cylinderId}"]`)).toBeVisible({
            timeout: ciVideoTimeout,
        });
        caption(page, "Restored models return to the library");
        await holdOn(page, page.locator(".model-card"));
        await stopFeatureRecording(page);
    });
});
