import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
    shortPause,
    mediumPause,
    longPause,
    viewerPause,
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
 * video - mirroring the human-like timing used elsewhere in this script.
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

        // The window starts as ONE panel: the right panel appears as a drop
        // target only once a drag is in flight, so the source is grabbed
        // first and the destination measured mid-drag.
        const spritesTab = leftDockBar
            .locator('.draggable-tab[data-tab-type="sprites"]')
            .first();
        await spritesTab.waitFor({ state: "visible", timeout: 5000 });
        const spritesTabBox = await spritesTab.boundingBox();

        if (spritesTabBox) {
            const startX = spritesTabBox.x + spritesTabBox.width / 2;
            const startY = spritesTabBox.y + spritesTabBox.height / 2;
            await page.mouse.move(startX, startY, { steps: 15 });
            await viewerPause(page, 300);
            await page.mouse.down();
            await page.mouse.move(startX + 24, startY, { steps: 6 });

            const rightDockBar = page.locator(".dock-bar-right");
            await rightDockBar.waitFor({ state: "visible", timeout: 5000 });
            const rightDockBarBox = await rightDockBar.boundingBox();
            if (rightDockBarBox) {
                await page.mouse.move(
                    rightDockBarBox.x + rightDockBarBox.width / 2,
                    rightDockBarBox.y + rightDockBarBox.height / 2,
                    { steps: 40 },
                );
                await viewerPause(page, 250);
                await page.mouse.up();
            }
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
        // Step 4: Close a tab on the left (close the Sounds tab)
        // ────────────────────────────────────────────────────────────

        // The Models and Projects entries are pinned in the main dock, so a
        // pinned page keeps its slot and has no close button; Sounds is an
        // ordinary closable tab.
        const soundsTab = leftDockBar
            .locator('.draggable-tab[data-tab-type="sounds"]')
            .first();
        await soundsTab.waitFor({ state: "visible", timeout: 5000 });

        // Hover over it to reveal the close button
        const soundsTabBox = await soundsTab.boundingBox();
        if (soundsTabBox) {
            await page.mouse.move(
                soundsTabBox.x + soundsTabBox.width / 2,
                soundsTabBox.y + soundsTabBox.height / 2,
                { steps: 20 },
            );
        }
        await viewerPause(page, 400);

        // Click the close button on the sounds tab
        const closeBtn = soundsTab.locator(".tab-close-btn");
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
        // Step 5: Restore the recently closed Sounds tab via the
        //         "Recently Closed" section in the New Tab page
        // ────────────────────────────────────────────────────────────

        await openNewTabPageInPanel(page, leftPanel);

        // The most-recently-closed entry is the Sounds tab; the section is
        // scoped to the New Tab page that just opened in the left panel.
        const newtabInLeft = leftPanel.locator(".newtab-page").last();
        const recentsHeader = newtabInLeft.locator(".newtab-section-tag", {
            hasText: /^Recently Closed$/i,
        });
        await recentsHeader.waitFor({ state: "visible", timeout: 5000 });
        await mediumPause(page);

        const reopenSounds = newtabInLeft.locator(
            '.newtab-recent button[title="Reopen Sounds"]',
        );
        await reopenSounds.waitFor({ state: "visible", timeout: 3000 });
        const reopenBox = await reopenSounds.boundingBox();
        if (reopenBox) {
            await page.mouse.move(
                reopenBox.x + reopenBox.width / 2,
                reopenBox.y + reopenBox.height / 2,
                { steps: 20 },
            );
            await viewerPause(page, 300);
        }
        await reopenSounds.click();
        await mediumPause(page);

        // Confirm the placeholder converted in place and the Sounds tab is back.
        await expect(newtabInLeft).toBeHidden({ timeout: 5000 });
        await leftDockBar
            .locator('.draggable-tab[data-tab-type="sounds"]')
            .first()
            .waitFor({ state: "visible", timeout: 5000 });

        // Pause to show the restored tab
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Final pause - let the viewer absorb the final state
        // ────────────────────────────────────────────────────────────

        // Move mouse to center so the final frame is clean
        await page.mouse.move(640, 360, { steps: 15 });
        await viewerPause(page, 1200);
        await stopFeatureRecording(page);
    });
});
