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
    navigateTo,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Sprites", () => {
    test("Sprites Video", async ({ page }) => {
        // ── Setup: clear all data so we start with a clean library ──
        await clearAllData(page);

        // ── Navigate to the sprites page ──
        await navigateTo(page, "/?leftTabs=sprites&activeLeft=sprites");
        await disableHighlights(page);
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Upload 4 sprite images via the UI file chooser
        // ────────────────────────────────────────────────────────────
        const spriteFiles = [
            path.join(assetsDir, "texture.png"),
            path.join(assetsDir, "texture_blue.png"),
            path.join(assetsDir, "red_color.png"),
            path.join(assetsDir, "green_color.png"),
        ];

        // Sprites use drag-and-drop upload, so we upload via API and show the result
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

        // Reload to show the uploaded sprites
        await navigateTo(page, "/?leftTabs=sprites&activeLeft=sprites");
        await disableHighlights(page);
        await mediumPause(page);

        // Wait for sprite cards to appear in the grid
        await page
            .locator(".sprite-card")
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
        // Get actual count of sprite cards (clearAllData ensures only our 4 exist)
        const spriteCount = await page.locator(".sprite-card").count();
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 2: Hover over each sprite card to showcase the grid
        // ────────────────────────────────────────────────────────────
        for (let i = 0; i < Math.min(spriteCount, 6); i++) {
            const card = page.locator(".sprite-card").nth(i);
            const box = await card.boundingBox();
            if (box) {
                await page.mouse.move(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                    { steps: 20 },
                );
                await shortPause(page);
            }
        }
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 3: Right-click a sprite to show context menu
        // ────────────────────────────────────────────────────────────
        const secondCard = page.locator(".sprite-card").nth(1);
        const secondBox = await secondCard.boundingBox();
        if (secondBox) {
            await page.mouse.move(
                secondBox.x + secondBox.width / 2,
                secondBox.y + secondBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
            await page.mouse.click(
                secondBox.x + secondBox.width / 2,
                secondBox.y + secondBox.height / 2,
                { button: "right" },
            );
        }
        await shortPause(page);

        // Wait for context menu to appear
        await page
            .locator(".p-contextmenu")
            .waitFor({ state: "visible", timeout: 5000 });
        await mediumPause(page);

        // Close context menu by pressing Escape
        await page.keyboard.press("Escape");
        await shortPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 4: Create a new category — click "Add Category" button
        // ────────────────────────────────────────────────────────────

        // Move to the "Add Category" button and click it
        const addCategoryBtn = page
            .locator("button")
            .filter({ hasText: /Add Category/i })
            .first();
        await addCategoryBtn.waitFor({ state: "visible", timeout: 5000 });
        const addCategoryBox = await addCategoryBtn.boundingBox();
        if (addCategoryBox) {
            await page.mouse.move(
                addCategoryBox.x + addCategoryBox.width / 2,
                addCategoryBox.y + addCategoryBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
        }
        await addCategoryBtn.click();
        await shortPause(page);

        // Wait for the category dialog to appear
        const categoryDialog = page
            .locator("[data-testid='category-dialog'], .p-dialog")
            .first();
        await categoryDialog.waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);

        // Type the category name "UI Elements"
        const nameInput = categoryDialog.locator("input").first();
        await nameInput.click();
        await page.waitForTimeout(200);

        // Type with human-like timing
        const categoryName = "UI Elements";
        for (const char of categoryName) {
            await page.keyboard.type(char, { delay: 80 });
        }
        await mediumPause(page);

        // Click Save button
        const saveBtn = categoryDialog
            .locator("button")
            .filter({ hasText: /Save/i })
            .first();
        await saveBtn.click();
        await mediumPause(page);

        // Wait for the new category tab to appear
        await page
            .locator(".category-tab")
            .filter({ hasText: /UI Elements/i })
            .waitFor({
                state: "visible",
                timeout: 5000,
            });
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 5: Move mouse around to show the final layout
        // ────────────────────────────────────────────────────────────

        // Hover over the new category tab
        const newCategoryTab = page
            .locator(".category-tab")
            .filter({ hasText: /UI Elements/i });
        const tabBox = await newCategoryTab.boundingBox();
        if (tabBox) {
            await page.mouse.move(
                tabBox.x + tabBox.width / 2,
                tabBox.y + tabBox.height / 2,
                { steps: 20 },
            );
        }
        await shortPause(page);

        // Click "All" tab to go back and show all sprites
        const allTab = page
            .locator(".category-tab")
            .filter({ hasText: /All/i })
            .first();
        if (await allTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await allTab.click();
            await mediumPause(page);
        }

        // Move back across the sprite grid
        const firstCard = page.locator(".sprite-card").first();
        await firstCard
            .waitFor({ state: "visible", timeout: 10000 })
            .catch(() => {});
        const firstBox = await firstCard.boundingBox().catch(() => null);
        if (firstBox) {
            await page.mouse.move(
                firstBox.x + firstBox.width / 2,
                firstBox.y + firstBox.height / 2,
                { steps: 20 },
            );
        }
        await shortPause(page);

        // Move mouse to center of the page for a clean final frame
        await page.mouse.move(640, 360, { steps: 15 });
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 6: Final pause
        // ────────────────────────────────────────────────────────────
        await viewerPause(page, 3000);
    });
});
