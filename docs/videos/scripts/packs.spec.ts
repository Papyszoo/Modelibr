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
    navigateTo,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");
const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Packs", () => {
    test("Packs Video", async ({ page }) => {
        // ── Setup: clear data and upload models via API ──
        await clearAllData(page);

        const modelFiles = ["test-cube.glb", "test-cone.fbx"];
        for (const file of modelFiles) {
            const buffer = fs.readFileSync(path.join(assetsDir, file));
            await page.request.post(`${API_BASE}/models`, {
                multipart: {
                    file: {
                        name: file,
                        mimeType: "application/octet-stream",
                        buffer,
                    },
                },
            });
        }

        // Wait for worker to process models
        await page.waitForTimeout(3000);

        // ── Navigate to Packs page ──
        await navigateTo(page, "/?leftTabs=packs&activeLeft=packs");
        await disableHighlights(page);
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Create first pack "Environment Props"
        // ────────────────────────────────────────────────────────────

        // Click "Create New Pack" button
        const createBtn = page
            .locator("button")
            .filter({ hasText: /create.*pack/i })
            .first();
        await createBtn.waitFor({ state: "visible", timeout: 10000 });

        const createBtnBox = await createBtn.boundingBox();
        if (createBtnBox) {
            await page.mouse.move(
                createBtnBox.x + createBtnBox.width / 2,
                createBtnBox.y + createBtnBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
        }
        await createBtn.click();
        await mediumPause(page);

        // Wait for dialog
        const dialog = page.locator(".p-dialog").first();
        await dialog.waitFor({ state: "visible", timeout: 10000 });
        await shortPause(page);

        // Type pack name with human-like delay
        const nameInput = dialog.locator("input").first();
        await nameInput.click();
        await nameInput.pressSequentially("Environment Props", { delay: 70 });
        await shortPause(page);

        // Type description if there's a textarea
        const descInput = dialog.locator("textarea, input").nth(1);
        if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await descInput.click();
            await descInput.pressSequentially("Trees, rocks, and foliage", {
                delay: 70,
            });
            await shortPause(page);
        }

        // Click Create/Save button
        const saveBtn = dialog
            .locator("button")
            .filter({ hasText: /create|save/i })
            .first();
        await saveBtn.click();
        await mediumPause(page);

        // Wait for dialog to close
        await dialog
            .waitFor({ state: "hidden", timeout: 10000 })
            .catch(() => {});
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 2: Show the pack card that appeared
        // ────────────────────────────────────────────────────────────

        const packCard = page.locator(".pack-grid-card").first();
        await packCard.waitFor({ state: "visible", timeout: 10000 });
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 3: Open the pack viewer
        // ────────────────────────────────────────────────────────────

        const cardBox = await packCard.boundingBox();
        if (cardBox) {
            await page.mouse.move(
                cardBox.x + cardBox.width / 2,
                cardBox.y + cardBox.height / 2,
                { steps: 20 },
            );
            await page.waitForTimeout(400);
        }
        await packCard.click();
        await mediumPause(page);

        // Wait for pack viewer to load
        await page.waitForTimeout(2000);
        await disableHighlights(page);
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 4: Add models to the pack
        // ────────────────────────────────────────────────────────────

        // Look for an "Add" button in the models section
        const addModelBtn = page
            .locator("button")
            .filter({ hasText: /add/i })
            .first();
        if (await addModelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            const addBox = await addModelBtn.boundingBox();
            if (addBox) {
                await page.mouse.move(
                    addBox.x + addBox.width / 2,
                    addBox.y + addBox.height / 2,
                    { steps: 20 },
                );
                await page.waitForTimeout(400);
            }
            await addModelBtn.click();
            await mediumPause(page);

            // Wait for selection dialog
            const selectionDialog = page.locator(".p-dialog").first();
            if (
                await selectionDialog
                    .isVisible({ timeout: 5000 })
                    .catch(() => false)
            ) {
                // Select models by clicking checkboxes or cards
                const selectableItems = selectionDialog.locator(
                    ".model-card, .selectable-card, .p-checkbox, [role='checkbox']",
                );
                const itemCount = await selectableItems.count();
                for (let i = 0; i < Math.min(itemCount, 2); i++) {
                    const item = selectableItems.nth(i);
                    const itemBox = await item.boundingBox();
                    if (itemBox) {
                        await page.mouse.move(
                            itemBox.x + itemBox.width / 2,
                            itemBox.y + itemBox.height / 2,
                            { steps: 15 },
                        );
                        await page.waitForTimeout(300);
                    }
                    await item.click();
                    await shortPause(page);
                }

                // Confirm selection
                const confirmBtn = selectionDialog
                    .locator("button")
                    .filter({ hasText: /confirm|add|save/i })
                    .first();
                if (
                    await confirmBtn
                        .isVisible({ timeout: 2000 })
                        .catch(() => false)
                ) {
                    await confirmBtn.click();
                    await mediumPause(page);
                }
            }
        }

        // Show the pack with added models
        await longPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 5: Go back to packs list
        // ────────────────────────────────────────────────────────────

        // Click on the Packs tab in the dock bar
        const packsTab = page
            .locator(".draggable-tab")
            .filter({ hasText: /packs/i })
            .first();
        if (await packsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await packsTab.click();
        } else {
            // Navigate via URL
            await navigateTo(page, "/?leftTabs=packs&activeLeft=packs");
            await disableHighlights(page);
        }
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 6: Create second pack "Character Assets"
        // ────────────────────────────────────────────────────────────

        const createBtn2 = page
            .locator("button")
            .filter({ hasText: /create.*pack/i })
            .first();
        if (await createBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
            await createBtn2.click();
            await mediumPause(page);

            const dialog2 = page.locator(".p-dialog").first();
            await dialog2.waitFor({ state: "visible", timeout: 10000 });

            const nameInput2 = dialog2.locator("input").first();
            await nameInput2.click();
            await nameInput2.pressSequentially("Character Assets", {
                delay: 70,
            });
            await shortPause(page);

            const descInput2 = dialog2.locator("textarea, input").nth(1);
            if (
                await descInput2.isVisible({ timeout: 1000 }).catch(() => false)
            ) {
                await descInput2.click();
                await descInput2.pressSequentially("Player and NPC models", {
                    delay: 70,
                });
                await shortPause(page);
            }

            const saveBtn2 = dialog2
                .locator("button")
                .filter({ hasText: /create|save/i })
                .first();
            await saveBtn2.click();
            await mediumPause(page);

            await dialog2
                .waitFor({ state: "hidden", timeout: 10000 })
                .catch(() => {});
        }

        // ────────────────────────────────────────────────────────────
        // Step 7: Show both pack cards with hover
        // ────────────────────────────────────────────────────────────

        await page.waitForTimeout(1500);

        // Hover over pack cards
        const allCards = page.locator(".pack-grid-card");
        const cardCount = await allCards.count();
        for (let i = 0; i < cardCount; i++) {
            const card = allCards.nth(i);
            const box = await card.boundingBox();
            if (box) {
                await page.mouse.move(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                    { steps: 20 },
                );
                await mediumPause(page);
            }
        }

        // ── Final pause ──
        await page.mouse.move(640, 360, { steps: 15 });
        await longPause(page);
        await viewerPause(page, 2000);
    });
});
