import { test, expect, type Locator, type Page } from "@playwright/test";
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

async function getLocatorCenter(locator: Locator) {
    await locator.waitFor({ state: "visible", timeout: ciVideoTimeout });
    const box = await locator.boundingBox();
    if (!box) {
        throw new Error("Could not resolve visible bounding box for locator");
    }

    return {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
    };
}

async function moveToLocator(page: Page, locator: Locator, steps = 18) {
    const { x, y } = await getLocatorCenter(locator);
    await page.mouse.move(x, y, { steps });
}

async function clickLocator(
    page: Page,
    locator: Locator,
    options?: { button?: "left" | "right"; pauseMs?: number },
) {
    await moveToLocator(page, locator);
    await viewerPause(page, options?.pauseMs ?? 180);

    const { x, y } = await getLocatorCenter(locator);
    await page.mouse.click(x, y, { button: options?.button ?? "left" });
    await shortPause(page);
}

test.describe("Sprites", () => {
    test("Sprites Video", async ({ page }) => {
        let heroSpriteId: number | null = null;
        await clearAllData(page);

        const sprites = [
            { file: "texture.png", name: "button-base" },
            { file: "red_color.png", name: "damage-hit" },
            { file: "green_color.png", name: "health-pickup" },
        ];

        for (const sprite of sprites) {
            const filePath = path.join(assetsDir, sprite.file);
            const buffer = fs.readFileSync(filePath);
            const response = await page.request.post(
                `${API_BASE_URL}/sprites/with-file?name=${encodeURIComponent(sprite.name)}`,
                {
                    multipart: {
                        file: {
                            name: path.basename(filePath),
                            mimeType: "image/png",
                            buffer,
                        },
                    },
                },
            );

            expect(response.ok()).toBeTruthy();
            const createdSprite = await response.json();
            if (sprite.name === "button-base") {
                heroSpriteId = Number(createdSprite.spriteId ?? createdSprite.id);
            }
        }

        if (!heroSpriteId) {
            throw new Error("Could not determine hero sprite id");
        }

        const createCategoryResponse = await page.request.post(
            `${API_BASE_URL}/sprite-categories`,
            {
                data: { name: "UI Kit" },
            },
        );
        expect(createCategoryResponse.ok()).toBeTruthy();
        const createdCategory = await createCategoryResponse.json();
        const uiKitCategoryId = Number(createdCategory.id);

        const moveHeroResponse = await page.request.put(
            `${API_BASE_URL}/sprites/${heroSpriteId}`,
            {
                data: {
                    name: "button-base",
                    spriteType: 1,
                    categoryId: uiKitCategoryId,
                },
            },
        );
        expect(moveHeroResponse.ok()).toBeTruthy();

        await navigateTo(page, "/?leftTabs=sprites&activeLeft=sprites");
        await disableHighlights(page);

        const spriteCards = page.locator(".sprite-card");
        await expect(spriteCards).toHaveCount(2, { timeout: ciVideoTimeout });
        await mediumPause(page);

        for (let i = 0; i < 2; i++) {
            await moveToLocator(page, spriteCards.nth(i));
            await viewerPause(page, 220);
        }

        const uiKitTab = page
            .locator(".category-tab")
            .filter({ hasText: /UI Kit/i })
            .first();
        await expect(uiKitTab).toBeVisible({ timeout: ciVideoTimeout });
        await expect(uiKitTab).toContainText("(1)");
        await mediumPause(page);

        await clickLocator(page, uiKitTab);
        await expect(spriteCards).toHaveCount(1, { timeout: ciVideoTimeout });
        await mediumPause(page);

        const renamedCard = spriteCards
            .filter({ hasText: /button-base/i })
            .first();
        await clickLocator(page, renamedCard);

        const spriteModal = page.getByTestId("sprite-detail-modal");
        await expect(spriteModal).toBeVisible({ timeout: ciVideoTimeout });

        await clickLocator(page, page.getByTestId("sprite-name-edit"));
        const spriteNameInput = page.getByTestId("sprite-name-input");
        await expect(spriteNameInput).toBeVisible();
        await spriteNameInput.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A",
        );
        await page.keyboard.press("Backspace");
        await page.keyboard.type("Primary Button", { delay: 55 });
        await viewerPause(page, 220);
        await clickLocator(page, page.getByTestId("sprite-name-save"));
        await expect(page.getByTestId("sprite-name-display")).toContainText(
            "Primary Button",
            { timeout: ciVideoTimeout },
        );
        await viewerPause(page, 1200);
    });
});
