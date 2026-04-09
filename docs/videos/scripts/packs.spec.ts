import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
    ciVideoTimeout,
    createRecordedPage,
    shortPause,
    mediumPause,
    longPause,
    viewerPause,
    navigateTo,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");
const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Packs", () => {
    test("Packs Video", async ({ browser, page: setupPage }, testInfo) => {
        // ── Setup: clear data and upload models via API ──
        await clearAllData(setupPage);

        const modelFiles = ["test-cube.glb", "test-cone.fbx"];
        for (const file of modelFiles) {
            const buffer = fs.readFileSync(path.join(assetsDir, file));
            await setupPage.request.post(`${API_BASE}/models`, {
                multipart: {
                    file: {
                        name: file,
                        mimeType: "application/octet-stream",
                        buffer,
                    },
                },
            });
        }

        await mediumPause(setupPage);

        const { context, page } = await createRecordedPage(browser, testInfo);

        // ── Navigate to Packs page ──
        await navigateTo(page, "/?leftTabs=packs&activeLeft=packs");
        await disableHighlights(page);
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Create one meaningful pack
        // ────────────────────────────────────────────────────────────

        const createBtn = page
            .locator("button")
            .filter({ hasText: /create.*pack/i })
            .first();
        await createBtn.waitFor({ state: "visible", timeout: ciVideoTimeout });

        const createBtnBox = await createBtn.boundingBox();
        if (createBtnBox) {
            await page.mouse.move(
                createBtnBox.x + createBtnBox.width / 2,
                createBtnBox.y + createBtnBox.height / 2,
                { steps: 20 },
            );
            await viewerPause(page, 400);
        }
        await createBtn.click();
        await mediumPause(page);

        // Wait for dialog
        const dialog = page.locator(".p-dialog").first();
        await dialog.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await shortPause(page);

        const nameInput = dialog.locator("input").first();
        await nameInput.click();
        await nameInput.pressSequentially("Sci-Fi Essentials", { delay: 65 });
        await shortPause(page);

        const descInput = dialog.locator("textarea, input").nth(1);
        if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await descInput.click();
            await descInput.pressSequentially(
                "Hero props, modular hull pieces, and dockside set dressing.",
                { delay: 60 },
            );
            await shortPause(page);
        }

        const saveBtn = dialog
            .locator("button")
            .filter({ hasText: /create|save/i })
            .first();
        await saveBtn.click();
        await mediumPause(page);

        // Wait for dialog to close
        await dialog
            .waitFor({ state: "hidden", timeout: ciVideoTimeout })
            .catch(() => {});
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 2: Spotlight the pack card, then open it
        // ────────────────────────────────────────────────────────────

        const packCard = page.locator(".pack-grid-card").first();
        await packCard.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await longPause(page);

        const cardBox = await packCard.boundingBox();
        if (cardBox) {
            await page.mouse.move(
                cardBox.x + cardBox.width / 2,
                cardBox.y + cardBox.height / 2,
                { steps: 20 },
            );
            await viewerPause(page, 400);
        }
        await packCard.click();
        await mediumPause(page);

        await disableHighlights(page);
        await longPause(page);

        const modelsTab = page.getByRole("tab", { name: /Models:\s*0/i });
        await modelsTab.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await modelsTab.click();
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 3: Add both models to the pack
        // ────────────────────────────────────────────────────────────

        const addModelCard = page.locator(".model-card.model-card-add");
        if (await addModelCard.isVisible({ timeout: 3000 }).catch(() => false)) {
            const addBox = await addModelCard.boundingBox();
            if (addBox) {
                await page.mouse.move(
                    addBox.x + addBox.width / 2,
                    addBox.y + addBox.height / 2,
                    { steps: 20 },
                );
                await viewerPause(page, 400);
            }
            await addModelCard.click();
            await mediumPause(page);

            const selectionDialog = page.locator(".p-dialog").filter({
                has: page.getByText("Add Models to Pack"),
            });
            if (
                await selectionDialog
                    .isVisible({ timeout: 5000 })
                    .catch(() => false)
            ) {
                const selectableItems = selectionDialog.locator(
                    ".container-card[data-model-id]",
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
                        await viewerPause(page, 300);
                    }
                    await item.click();
                    await shortPause(page);
                }

                const confirmBtn = selectionDialog
                    .getByRole("button", { name: /Add Selected \([12]\)/ })
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

        await expect(page.getByRole("tab", { name: /Models:\s*2/i })).toBeVisible({
            timeout: ciVideoTimeout,
        });
        const assignedModelCards = page.locator(".model-card:not(.model-card-add)");
        await expect(assignedModelCards.first()).toBeVisible({ timeout: ciVideoTimeout });
        const assignedCount = await assignedModelCards.count();
        for (let i = 0; i < Math.min(assignedCount, 2); i++) {
            const modelCard = assignedModelCards.nth(i);
            const box = await modelCard.boundingBox();
            if (box) {
                await page.mouse.move(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                    { steps: 20 },
                );
                await mediumPause(page);
            }
        }

        await page.mouse.move(640, 360, { steps: 15 });
        await viewerPause(page, 1200);
        await context.close();
    });
});
