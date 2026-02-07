import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
    shortPause,
    mediumPause,
    longPause,
    viewerPause,
    smoothMoveTo,
    humanClick,
    humanRightClick,
    smoothDrag,
    dragElementTo,
    navigateTo,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("User Interface", () => {
    test("User Interface Video", async ({ page }) => {
        // ── Setup: clear all data so we start with a clean library ──
        await clearAllData(page);

        // ── Upload test data via API (fast, not shown in video) ──

        // Upload 2 models
        const modelFiles = [
            path.join(assetsDir, "test-cube.glb"),
            path.join(assetsDir, "test-cone.fbx"),
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

        // Upload 2 sprites
        const spriteFiles = [
            path.join(assetsDir, "texture.png"),
            path.join(assetsDir, "texture_blue.png"),
        ];
        for (const file of spriteFiles) {
            const buffer = fs.readFileSync(file);
            await page.request.post(`${API_BASE_URL}/sprites/with-file`, {
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
        await page.request.post(`${API_BASE_URL}/sounds/with-file`, {
            multipart: {
                file: {
                    name: path.basename(soundFile),
                    mimeType: "audio/wav",
                    buffer: soundBuffer,
                },
            },
        });

        // ── Navigate to the app with model list on the left ──
        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await disableHighlights(page);
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Click the "+" add tab button on the left dock bar
        //         and select "Sprites" from the menu
        // ────────────────────────────────────────────────────────────

        // Move to and click the add button on the left dock bar
        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        const leftAddButton = leftPanel.locator(".dock-add-button").first();
        await leftAddButton.waitFor({ state: "visible", timeout: 10000 });
        const addBtnBox = await leftAddButton.boundingBox();
        if (addBtnBox) {
            await page.mouse.move(
                addBtnBox.x + addBtnBox.width / 2,
                addBtnBox.y + addBtnBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
        }
        await leftAddButton.click();
        await shortPause(page);

        // Wait for the popup menu to appear (ContextMenu with class dock-add-menu)
        await page
            .locator(".dock-add-menu")
            .waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);

        // Click "Sprites" in the menu
        const spritesMenuItem = page
            .locator(".dock-add-menu .p-menuitem")
            .filter({ hasText: /Sprites/i });
        const spritesItemBox = await spritesMenuItem.boundingBox();
        if (spritesItemBox) {
            await page.mouse.move(
                spritesItemBox.x + spritesItemBox.width / 2,
                spritesItemBox.y + spritesItemBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(300);
        }
        await spritesMenuItem.click();
        await mediumPause(page);

        // Verify sprites tab is now visible on the left
        await page.waitForTimeout(500);
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

        // Click the add button on the left dock bar again
        const leftAddButton2 = leftPanel.locator(".dock-add-button").first();
        await leftAddButton2.waitFor({ state: "visible", timeout: 10000 });
        const addBtn2Box = await leftAddButton2.boundingBox();
        if (addBtn2Box) {
            await page.mouse.move(
                addBtn2Box.x + addBtn2Box.width / 2,
                addBtn2Box.y + addBtn2Box.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
        }
        await leftAddButton2.click();
        await shortPause(page);

        // Wait for the popup menu
        await page
            .locator(".dock-add-menu")
            .waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);

        // Click "Sounds" in the menu
        const soundsMenuItem = page
            .locator(".dock-add-menu .p-menuitem")
            .filter({ hasText: /Sounds/i });
        const soundsItemBox = await soundsMenuItem.boundingBox();
        if (soundsItemBox) {
            await page.mouse.move(
                soundsItemBox.x + soundsItemBox.width / 2,
                soundsItemBox.y + soundsItemBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(300);
        }
        await soundsMenuItem.click();
        await mediumPause(page);

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
        await page.waitForTimeout(400);

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
            await page.waitForTimeout(300);
            await page.mouse.click(
                closeBtnBox.x + closeBtnBox.width / 2,
                closeBtnBox.y + closeBtnBox.height / 2,
            );
        }
        await mediumPause(page);

        // Pause to show the tab has been closed
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 5: Right-click on the left dock bar to restore
        //         the recently closed tab
        // ────────────────────────────────────────────────────────────

        // Right-click on the left dock bar to open the context menu
        const dockBarBox = await leftDockBar.boundingBox();
        if (dockBarBox) {
            await page.mouse.click(
                dockBarBox.x + dockBarBox.width / 2,
                dockBarBox.y + dockBarBox.height / 2,
                { button: "right" },
            );
        }
        await shortPause(page);

        // Wait for the context menu to appear
        await page
            .locator(".p-contextmenu")
            .waitFor({ state: "visible", timeout: 5000 });
        await mediumPause(page);

        // Look for "Reopen: Models List" option and click it
        const reopenItem = page.locator(".p-contextmenu .p-menuitem").filter({
            hasText: /Reopen/i,
        });
        const reopenVisible = await reopenItem
            .first()
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);
        if (reopenVisible) {
            const reopenBox = await reopenItem.first().boundingBox();
            if (reopenBox) {
                await page.mouse.move(
                    reopenBox.x + reopenBox.width / 2,
                    reopenBox.y + reopenBox.height / 2,
                    { steps: 20 },
                );
                await page.waitForTimeout(400);
                await page.mouse.click(
                    reopenBox.x + reopenBox.width / 2,
                    reopenBox.y + reopenBox.height / 2,
                );
            }
        } else {
            // If no "Reopen" option exists, dismiss the menu and re-add
            // the Models tab via the + button as a fallback
            await page.keyboard.press("Escape");
            await shortPause(page);
            const fallbackAddBtn = leftPanel
                .locator(".dock-add-button")
                .first();
            await fallbackAddBtn.click();
            await shortPause(page);
            await page
                .locator(".dock-add-menu")
                .waitFor({ state: "visible", timeout: 5000 });
            const modelsMenuItem = page
                .locator(".dock-add-menu .p-menuitem")
                .filter({ hasText: /Models/i });
            if (
                await modelsMenuItem
                    .first()
                    .isVisible({ timeout: 2000 })
                    .catch(() => false)
            ) {
                await modelsMenuItem.first().click();
            }
        }
        await mediumPause(page);

        // Pause to show the restored tab
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Final pause — let the viewer absorb the final state
        // ────────────────────────────────────────────────────────────

        // Move mouse to center so the final frame is clean
        await page.mouse.move(640, 360, { steps: 15 });
        await longPause(page);
        await viewerPause(page, 3000);
    });
});
