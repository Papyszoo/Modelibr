import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
    shortPause,
    mediumPause,
    longPause,
    viewerPause,
    smoothDrag,
    navigateTo,
    clearAllData,
    disableHighlights,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";

import type { Locator, Page } from "@playwright/test";

/**
 * Open the New Tab page in the given panel by clicking its "+" button.
 *
 * Pauses are sized so the click lands cleanly on screen in the recorded
 * video — mirroring the human-like timing used elsewhere in this script.
 */
async function openNewTabPageInPanel(
    page: Page,
    panel: Locator,
): Promise<void> {
    const addButton = panel.locator(".dock-add-button").first();
    await addButton.waitFor({ state: "visible", timeout: 10000 });
    const box = await addButton.boundingBox();
    if (box) {
        await page.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2,
            { steps: 20 },
        );
        await viewerPause(page, 400);
    }
    await addButton.click();
    await panel
        .locator(".newtab-page")
        .last()
        .waitFor({ state: "visible", timeout: 5000 });
    await shortPause(page);
}

/**
 * Pick a tile in the New Tab page hosted by the given panel. Waits for the
 * placeholder to collapse so the next step is interacting with the target
 * tab's content, not the (now stale) New Tab page DOM.
 */
async function pickNewTabTile(
    page: Page,
    panel: Locator,
    tileTitle: RegExp,
): Promise<void> {
    const newtab = panel.locator(".newtab-page").last();
    const tile = newtab
        .locator(".newtab-tile")
        .filter({
            has: page.locator(".newtab-tile-title", { hasText: tileTitle }),
        })
        .first();
    await tile.waitFor({ state: "visible", timeout: 5000 });
    const box = await tile.boundingBox();
    if (box) {
        await page.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2,
            { steps: 20 },
        );
        await viewerPause(page, 300);
    }
    await tile.click();
    await newtab.waitFor({ state: "hidden", timeout: 5000 });
    await mediumPause(page);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("User Interface", () => {
    test("User Interface Video", async ({ page: setupPage }, testInfo) => {
        // ── Setup: clear all data so we start with a clean library ──
        await clearAllData(setupPage);

        // ── Upload test data via API (fast, not shown in video) ──

        // Upload 2 models
        const modelFiles = [
            path.join(assetsDir, "test-cube.glb"),
            path.join(assetsDir, "test-cone.fbx"),
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

        // Upload 2 sprites
        const spriteFiles = [
            path.join(assetsDir, "texture.png"),
            path.join(assetsDir, "texture_blue.png"),
        ];
        for (const file of spriteFiles) {
            const buffer = fs.readFileSync(file);
            await setupPage.request.post(`${API_BASE_URL}/sprites/with-file`, {
                multipart: {
                    file: {
                        name: path.basename(file),
                        mimeType: "image/png",
                        buffer,
                    },
                },
            });
        }

        // Upload 1 sound
        const soundFile = path.join(assetsDir, "test-tone.wav");
        const soundBuffer = fs.readFileSync(soundFile);
        await setupPage.request.post(`${API_BASE_URL}/sounds/with-file`, {
            multipart: {
                file: {
                    name: path.basename(soundFile),
                    mimeType: "audio/wav",
                    buffer: soundBuffer,
                },
            },
        });

        const page = setupPage;

        // ── Navigate to the app with model list on the left ──
        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await disableHighlights(page);
        await startFeatureRecording(page, testInfo, { slug: "user-interface" });

        // ────────────────────────────────────────────────────────────
        // Step 1: Click the "+" add tab button on the left dock bar
        //         to open the New Tab page, then pick "Sprites"
        // ────────────────────────────────────────────────────────────

        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        await openNewTabPageInPanel(page, leftPanel);
        await pickNewTabTile(page, leftPanel, /^Sprites$/);

        // Verify sprites tab is now visible on the left
        await viewerPause(page, 500);
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 2: Drag the sprites tab from the left dock bar
        //         to the right dock bar
        // ────────────────────────────────────────────────────────────

        // Find the sprites tab in the left dock bar
        const leftDockBar = leftPanel.locator(".dock-bar");
        const rightPanel = page.locator(".p-splitter-panel").nth(1);
        const rightDockBar = rightPanel.locator(".dock-bar");

        // Find the sprites tab — look for the tab that corresponds to sprites
        // Try to find it by matching tab content/tooltip
        const spritesTab = leftDockBar.locator(".draggable-tab").last();
        const spritesTabBox = await spritesTab.boundingBox();
        const rightDockBarBox = await rightDockBar.boundingBox();

        if (spritesTabBox && rightDockBarBox) {
            // Perform a smooth drag from the sprites tab to the right dock bar
            await smoothDrag(
                page,
                spritesTabBox.x + spritesTabBox.width / 2,
                spritesTabBox.y + spritesTabBox.height / 2,
                rightDockBarBox.x + rightDockBarBox.width / 2,
                rightDockBarBox.y + rightDockBarBox.height / 2,
                40, // more steps for a visible, smooth drag
            );
        }
        await mediumPause(page);

        // Pause to show the result: sprites tab is now on the right side
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 3: Open "Sounds" tab on the left side
        // ────────────────────────────────────────────────────────────

        await openNewTabPageInPanel(page, leftPanel);
        await pickNewTabTile(page, leftPanel, /^Sounds$/);

        // Pause to show: sounds on left, sprites on right
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 4: Close a tab on the left (close the Models tab)
        // ────────────────────────────────────────────────────────────

        // Find the Models tab on the left dock bar (should be the first tab)
        const modelsTab = leftDockBar.locator(".draggable-tab").first();
        await modelsTab.waitFor({ state: "visible", timeout: 5000 });

        // Hover over it to reveal the close button
        const modelsTabBox = await modelsTab.boundingBox();
        if (modelsTabBox) {
            await page.mouse.move(
                modelsTabBox.x + modelsTabBox.width / 2,
                modelsTabBox.y + modelsTabBox.height / 2,
                { steps: 20 },
            );
        }
        await viewerPause(page, 400);

        // Click the close button on the models tab
        const closeBtn = modelsTab.locator(".tab-close-btn");
        await closeBtn.waitFor({ state: "visible", timeout: 5000 });

        const closeBtnBox = await closeBtn.boundingBox();
        if (closeBtnBox) {
            await page.mouse.move(
                closeBtnBox.x + closeBtnBox.width / 2,
                closeBtnBox.y + closeBtnBox.height / 2,
                { steps: 20 },
            );
            await viewerPause(page, 300);
            await page.mouse.click(
                closeBtnBox.x + closeBtnBox.width / 2,
                closeBtnBox.y + closeBtnBox.height / 2,
            );
        }
        await mediumPause(page);

        // Pause to show the tab has been closed
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 5: Restore the recently closed Models tab via the
        //         "Recently Closed" section in the New Tab page
        // ────────────────────────────────────────────────────────────

        await openNewTabPageInPanel(page, leftPanel);

        // The most-recently-closed entry is the Models tab; the section is
        // scoped to the New Tab page that just opened in the left panel.
        const newtabInLeft = leftPanel.locator(".newtab-page").last();
        const recentsHeader = newtabInLeft.locator(".newtab-section-tag", {
            hasText: /^Recently Closed$/i,
        });
        await recentsHeader.waitFor({ state: "visible", timeout: 5000 });
        await mediumPause(page);

        const reopenModels = newtabInLeft.locator(
            '.newtab-recent button[title="Reopen Models"]',
        );
        await reopenModels.waitFor({ state: "visible", timeout: 3000 });
        const reopenBox = await reopenModels.boundingBox();
        if (reopenBox) {
            await page.mouse.move(
                reopenBox.x + reopenBox.width / 2,
                reopenBox.y + reopenBox.height / 2,
                { steps: 20 },
            );
            await viewerPause(page, 300);
        }
        await reopenModels.click();
        await mediumPause(page);

        // Confirm the placeholder converted in place and the Models tab is back.
        await expect(newtabInLeft).toBeHidden({ timeout: 5000 });
        await leftDockBar
            .locator('.draggable-tab[data-pr-tooltip="Models List"]')
            .first()
            .waitFor({ state: "visible", timeout: 5000 });

        // Pause to show the restored tab
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Final pause — let the viewer absorb the final state
        // ────────────────────────────────────────────────────────────

        // Move mouse to center so the final frame is clean
        await page.mouse.move(640, 360, { steps: 15 });
        await viewerPause(page, 1200);
        await stopFeatureRecording(page);
    });
});
