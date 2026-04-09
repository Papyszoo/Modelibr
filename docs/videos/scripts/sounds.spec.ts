import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
    ciVideoTimeout,
    shortPause,
    mediumPause,
    viewerPause,
    navigateTo,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Sounds", () => {
    test("Sounds Video", async ({ page }) => {
        const soundFile = path.join(assetsDir, "test-tone.wav");
        const soundBuffer = fs.readFileSync(soundFile);
        const uploadedSoundNames = [
            "Forest Ambience",
            "Menu Click",
            "Quest Complete",
        ];
        const renamedSound = "Interface Click";
        const categoryName = "UI SFX";

        const typeNaturally = async (text: string, delay = 65) => {
            for (const char of text) {
                await page.keyboard.type(char, { delay });
            }
        };

        const soundCard = (name: string) =>
            page.locator(".sound-card").filter({ hasText: name }).first();

        const playButtonInCard = (name: string) =>
            soundCard(name).locator(".sound-control-btn").first();

        // ── Setup off-camera: start from a clean library with curated sounds ──
        await clearAllData(page);

        for (let i = 0; i < uploadedSoundNames.length; i++) {
            const buf = Buffer.from(soundBuffer);
            buf[buf.length - 1] = (buf[buf.length - 1] + i + 1) & 0xff;
            const uploadResponse = await page.request.post(
                `${API_BASE_URL}/sounds/with-file?name=${encodeURIComponent(uploadedSoundNames[i])}`,
                {
                    multipart: {
                        file: {
                            name: `test-tone-${i + 1}.wav`,
                            mimeType: "audio/wav",
                            buffer: buf,
                        },
                    },
                },
            );
            expect(uploadResponse.ok()).toBeTruthy();
        }

        // ── Visible story: quick preview, edit, then organize ──
        await navigateTo(page, "/?leftTabs=sounds&activeLeft=sounds");
        await disableHighlights(page);
        await soundCard(uploadedSoundNames[0]).waitFor({
            state: "visible",
            timeout: ciVideoTimeout,
        });
        await viewerPause(page, 450);

        // Step 1: Show instant sound previews from the grid.
        const ambientPreview = playButtonInCard(uploadedSoundNames[0]);
        await expect(ambientPreview).toBeEnabled({ timeout: ciVideoTimeout });
        await ambientPreview.hover();
        await viewerPause(page, 250);
        await ambientPreview.click();
        await viewerPause(page, 850);
        await ambientPreview.click();
        await mediumPause(page);

        const clickPreview = playButtonInCard(uploadedSoundNames[1]);
        await expect(clickPreview).toBeEnabled({ timeout: ciVideoTimeout });
        await clickPreview.hover();
        await viewerPause(page, 250);
        await clickPreview.click();
        await viewerPause(page, 650);
        await soundCard(uploadedSoundNames[1])
            .locator(".sound-control-btn.ghost")
            .click();
        await shortPause(page);

        // Step 2: Open the editor, play the waveform, and rename a sound.
        const menuCard = soundCard(uploadedSoundNames[1]);
        const menuCardBox = await menuCard.boundingBox();
        if (menuCardBox) {
            await page.mouse.move(
                menuCardBox.x + menuCardBox.width * 0.45,
                menuCardBox.y + menuCardBox.height * 0.35,
                { steps: 20 },
            );
            await viewerPause(page, 250);
            await page.mouse.click(
                menuCardBox.x + menuCardBox.width * 0.45,
                menuCardBox.y + menuCardBox.height * 0.35,
            );
        }
        const soundEditor = page.locator(".sound-editor");
        await soundEditor.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await expect(page.getByTestId("sound-play-pause")).toBeEnabled({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        await page.getByTestId("sound-play-pause").click();
        await viewerPause(page, 1000);
        await page.getByTestId("sound-play-pause").click();
        await shortPause(page);

        await page.getByTestId("sound-name-edit").click();
        await shortPause(page);
        await page.getByTestId("sound-name-input").click();
        await page.getByTestId("sound-name-input").fill("");
        await typeNaturally(renamedSound);
        await viewerPause(page, 250);
        await page.getByTestId("sound-name-save").click();
        await expect(page.getByTestId("sound-name-display")).toHaveText(
            renamedSound,
        );
        await mediumPause(page);

        await soundEditor.locator(".sound-editor-header button").last().click();
        await soundEditor.waitFor({ state: "hidden", timeout: ciVideoTimeout });
        await expect(soundCard(renamedSound)).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await shortPause(page);

        // Step 3: Create a category and organize the sound library.
        const addCategoryBtn = page.getByRole("button", { name: "Add Category" });
        await addCategoryBtn.hover();
        await viewerPause(page, 250);
        await addCategoryBtn.click();

        const categoryDialog = page.getByTestId("sound-category-dialog");
        await categoryDialog.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await page.getByTestId("sound-category-name-input").click();
        await typeNaturally(categoryName);
        await viewerPause(page, 250);
        await page.getByTestId("sound-category-dialog-save").click();
        await mediumPause(page);

        const categoryTab = page
            .locator(".category-tab")
            .filter({ hasText: categoryName })
            .first();
        await categoryTab.waitFor({ state: "visible", timeout: ciVideoTimeout });

        const unassignedTab = page
            .locator(".category-tab")
            .filter({ hasText: "Unassigned" })
            .first();
        await unassignedTab.click();
        await expect(soundCard(renamedSound)).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await shortPause(page);

        const renamedCard = soundCard(renamedSound);
        await renamedCard.dragTo(categoryTab);
        await expect(renamedCard).toBeHidden({ timeout: ciVideoTimeout });
        await shortPause(page);

        await categoryTab.click();
        await expect(soundCard(renamedSound)).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        const finalPreview = playButtonInCard(renamedSound);
        await expect(finalPreview).toBeEnabled({ timeout: ciVideoTimeout });
        await finalPreview.hover();
        await viewerPause(page, 250);
        await finalPreview.click();
        await viewerPause(page, 900);
        await soundCard(renamedSound).locator(".sound-control-btn.ghost").click();
        await viewerPause(page, 700);
    });
});
