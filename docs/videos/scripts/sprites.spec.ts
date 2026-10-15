import { test, expect } from "@playwright/test";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    holdOn,
    mediumPause,
    shortPause,
    navigateTo,
    clearAllData,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { demoArt, renderSvg } from "../helpers/demo-art";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Sprites", () => {
    test("Sprites Video", async ({ page }, testInfo) => {
        await clearAllData(page);

        const createCategoryResponse = await page.request.post(
            `${API_BASE_URL}/sprite-categories`,
            { data: { name: "UI Kit" } },
        );
        expect(createCategoryResponse.ok()).toBeTruthy();
        const uiKitCategoryId = Number((await createCategoryResponse.json()).id);

        const sprites = [
            { name: "button-base", svg: demoArt.playButton, category: uiKitCategoryId },
            { name: "coin-spin", svg: demoArt.coin },
            { name: "heart-full", svg: demoArt.heart },
            { name: "gem-green", svg: demoArt.gem },
        ];
        for (const sprite of sprites) {
            const response = await page.request.post(
                `${API_BASE_URL}/sprites/with-file?name=${encodeURIComponent(sprite.name)}`,
                {
                    multipart: {
                        file: {
                            name: `${sprite.name}.png`,
                            mimeType: "image/png",
                            buffer: await renderSvg(page, sprite.svg),
                        },
                    },
                },
            );
            expect(response.ok()).toBeTruthy();
            if (sprite.category) {
                const created = await response.json();
                const moved = await page.request.put(
                    `${API_BASE_URL}/sprites/${Number(created.spriteId ?? created.id)}`,
                    { data: { name: sprite.name, spriteType: 1, categoryId: sprite.category } },
                );
                expect(moved.ok()).toBeTruthy();
            }
        }

        await navigateTo(page, "/?leftTabs=sprites&activeLeft=sprites");
        const spriteCards = page.locator(".sprite-card");
        await expect(spriteCards).toHaveCount(4, { timeout: ciVideoTimeout });
        await expect(spriteCards.locator("img").first()).toBeVisible({ timeout: ciVideoTimeout });

        await startFeatureRecording(page, testInfo, {
            slug: "sprites",
            caption: "Keep 2D sprites in categories you define",
        });

        const uiKit = page
            .locator(".sprite-category-sidebar .p-treenode-content")
            .filter({ hasText: /UI Kit/i })
            .first();
        await expect(uiKit).toContainText("(1)");
        await glideClick(page, uiKit);
        await expect(spriteCards).toHaveCount(1, { timeout: ciVideoTimeout });
        await mediumPause(page);

        const heroCard = spriteCards.filter({ hasText: /button-base/i }).first();
        const spriteModal = page.getByTestId("sprite-detail-modal");
        await glideClick(page, heroCard, {
            cutUntil: () => expect(spriteModal).toBeVisible({ timeout: ciVideoTimeout }),
        });
        // Frame the modal from its title down to the info rows, so the rename
        // row has headroom and the caption sits below the details.
        await page.waitForTimeout(300);
        const modalBox = await spriteModal.boundingBox();
        const infoBox = await spriteModal.getByText(/^Category:?/).first().boundingBox();
        if (modalBox && infoBox) {
            await focusOn(page, {
                x: modalBox.x,
                y: modalBox.y,
                width: modalBox.width,
                height: infoBox.y + infoBox.height - modalBox.y,
            });
        }
        caption(page, "Rename it right in the preview");
        await shortPause(page);

        await glideClick(page, page.getByTestId("sprite-name-edit"));
        const nameInput = page.getByTestId("sprite-name-input");
        await expect(nameInput).toBeVisible();
        await nameInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("Play Button", { delay: 45 });
        await shortPause(page);
        await glideClick(page, page.getByTestId("sprite-name-save"));
        await expect(page.getByTestId("sprite-name-display")).toContainText("Play Button", {
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        await page.keyboard.press("Escape");
        await expect(spriteModal).toBeHidden({ timeout: ciVideoTimeout });
        const renamedCard = spriteCards.filter({ hasText: /Play Button/i }).first();
        await expect(renamedCard).toBeVisible({ timeout: ciVideoTimeout });
        caption(page, "Filed under UI Kit with its new name");
        await holdOn(page, renamedCard, { zoom: 1.8 });
        await stopFeatureRecording(page);
    });
});
