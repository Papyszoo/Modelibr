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
    navigateTo,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Sounds", () => {
    test("Sounds Video", async ({ page }) => {
        // ── Setup: clear all data so we start with a clean library ──
        await clearAllData(page);

        // ── Navigate to the sounds page ──
        await navigateTo(page, "/?leftTabs=sounds&activeLeft=sounds");
        await disableHighlights(page);
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Upload 3 sounds via API using test-tone.wav
        //         (modify buffer slightly for each to avoid hash dedup)
        // ────────────────────────────────────────────────────────────
        const soundFile = path.join(assetsDir, "test-tone.wav");
        const soundBuffer = fs.readFileSync(soundFile);

        // Upload 3 sounds via API — tweak the last data byte so each
        // has a unique hash and the server creates separate entities
        for (let i = 0; i < 3; i++) {
            const buf = Buffer.from(soundBuffer);
            buf[buf.length - 1] = (buf[buf.length - 1] + i + 1) & 0xff;
            await page.request.post(`${API_BASE_URL}/sounds/with-file`, {
                multipart: {
                    file: {
                        name: `test-tone-${i + 1}.wav`,
                        mimeType: "audio/wav",
                        buffer: buf,
                    },
                },
            });
        }

        // Get uploaded sound IDs from the API
        const soundsListRes = await page.request.get(`${API_BASE_URL}/sounds`);
        const allSoundsData = await soundsListRes.json();
        const soundIds: number[] = (allSoundsData.sounds || []).map(
            (s: any) => s.id,
        );

        // ────────────────────────────────────────────────────────────
        // Step 2: Rename sounds via API to descriptive names
        // ────────────────────────────────────────────────────────────
        const soundNames = ["Ambient Forest", "UI Click", "Notification"];

        for (let i = 0; i < Math.min(soundIds.length, soundNames.length); i++) {
            await page.request.put(`${API_BASE_URL}/sounds/${soundIds[i]}`, {
                data: { name: soundNames[i] },
                headers: { "Content-Type": "application/json" },
            });
        }

        // ────────────────────────────────────────────────────────────
        // Step 3: Navigate to sounds page and show the cards
        // ────────────────────────────────────────────────────────────
        await navigateTo(page, "/?leftTabs=sounds&activeLeft=sounds");
        await disableHighlights(page);
        await mediumPause(page);

        // Wait for sound cards to appear in the grid
        await page
            .locator(".sound-card")
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
        const soundCardCount = await page.locator(".sound-card").count();
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 4: Click on a sound card play button to preview it
        // ────────────────────────────────────────────────────────────
        const firstPlayBtn = page
            .locator(".sound-card")
            .first()
            .locator(".sound-control-btn")
            .first();
        const playBtnBox = await firstPlayBtn.boundingBox();
        if (playBtnBox) {
            await page.mouse.move(
                playBtnBox.x + playBtnBox.width / 2,
                playBtnBox.y + playBtnBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
            await firstPlayBtn.click();
        }
        await mediumPause(page);

        // Let it play briefly, then pause
        await page.waitForTimeout(1500);
        if (playBtnBox) {
            await firstPlayBtn.click();
        }
        await shortPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 5: Hover over each sound card slowly to showcase grid
        // ────────────────────────────────────────────────────────────
        for (let i = 0; i < Math.min(soundCardCount, 4); i++) {
            const card = page.locator(".sound-card").nth(i);
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
        // Step 6: Right-click a sound to show context menu, then dismiss
        // ────────────────────────────────────────────────────────────
        const secondCard = page.locator(".sound-card").nth(1);
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
        // Step 7: Create a "SFX" category via the Add Category button
        // ────────────────────────────────────────────────────────────
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
            .locator("[data-testid='sound-category-dialog'], .p-dialog")
            .first();
        await categoryDialog.waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);

        // Type the category name "SFX"
        const nameInput = categoryDialog.locator("input").first();
        await nameInput.click();
        await page.waitForTimeout(200);

        const categoryName = "SFX";
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
            .filter({ hasText: /SFX/i })
            .waitFor({
                state: "visible",
                timeout: 5000,
            });
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 8: Hover the new category tab then move across the grid
        // ────────────────────────────────────────────────────────────
        const newCategoryTab = page
            .locator(".category-tab")
            .filter({ hasText: /SFX/i });
        const tabBox = await newCategoryTab.boundingBox();
        if (tabBox) {
            await page.mouse.move(
                tabBox.x + tabBox.width / 2,
                tabBox.y + tabBox.height / 2,
                { steps: 20 },
            );
        }
        await shortPause(page);

        // Click "All" tab to go back and show all sounds
        const allTab = page
            .locator(".category-tab")
            .filter({ hasText: /All/i })
            .first();
        if (await allTab.isVisible().catch(() => false)) {
            await allTab.click();
            await mediumPause(page);
        }

        // Move back across the sound grid
        const firstCard = page.locator(".sound-card").first();
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

        // Move mouse to center for a clean final frame
        await page.mouse.move(640, 360, { steps: 15 });
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 9: Final pause showing the sounds grid
        // ────────────────────────────────────────────────────────────
        await viewerPause(page, 3000);
    });
});
