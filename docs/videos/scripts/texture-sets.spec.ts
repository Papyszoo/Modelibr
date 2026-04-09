import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import {
    ciVideoTimeout,
    createRecordedPage,
    shortPause,
    mediumPause,
    viewerPause,
    navigateTo,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

async function clearTextureVideoData(request: APIRequestContext) {
    const textureSetsResponse = await request.get(`${API_BASE_URL}/texture-sets`);
    if (textureSetsResponse.ok()) {
        const data = await textureSetsResponse.json();
        for (const textureSet of data.textureSets || []) {
            await request.delete(`${API_BASE_URL}/texture-sets/${textureSet.id}`);
        }
    }

    const recycledResponse = await request.get(`${API_BASE_URL}/recycled`);
    if (recycledResponse.ok()) {
        const recycled = await recycledResponse.json();
        const entityTypes: [string, Array<{ id: number }>][]= [
            ["textureSet", recycled.textureSets || []],
            ["texture", recycled.textures || []],
        ];
        for (const [type, items] of entityTypes) {
            for (const item of items) {
                await request.delete(
                    `${API_BASE_URL}/recycled/${type}/${item.id}/permanent`,
                );
            }
        }
    }
}

async function selectDropdownOption(
    page: Page,
    dropdown: Locator,
    optionName: string,
) {
    await dropdown.click();
    const option = page.getByRole("option", { name: optionName }).last();
    await expect(option).toBeVisible({ timeout: ciVideoTimeout });
    await option.click();
    await shortPause(page);
}

test.describe("Texture Sets", () => {
    test("Texture Sets Video", async ({ browser, request }, testInfo) => {
        test.setTimeout(180000);

        await clearTextureVideoData(request);

        const { context, page } = await createRecordedPage(browser, testInfo);

        await navigateTo(page, "/?leftTabs=textureSets&activeLeft=textureSets");
        await disableHighlights(page);

        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        await expect(leftPanel.locator(".texture-set-list-header h1")).toHaveText("Texture Sets", {
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        const packedTexturePath = path.join(assetsDir, "orm_test_channels.png");
        await leftPanel
            .getByTestId("texture-upload-input")
            .setInputFiles(packedTexturePath);

        const textureSetCard = leftPanel
            .locator(".texture-set-card")
            .filter({ hasText: /orm_test_channels/i })
            .first();
        await expect(textureSetCard).toBeVisible({ timeout: ciVideoTimeout });
        await expect(textureSetCard.getByText(/1 texture/i)).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        const cardBox = await textureSetCard.boundingBox();
        if (cardBox) {
            await page.mouse.move(
                cardBox.x + cardBox.width / 2,
                cardBox.y + cardBox.height / 2,
                { steps: 18 },
            );
            await viewerPause(page, 260);
        }
        await textureSetCard.click();

        const viewer = page.locator(".texture-set-viewer");
        await expect(viewer).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await expect(
            viewer.getByRole("heading", { name: "orm_test_channels" }),
        ).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        await page.getByRole("tab", { name: "Files" }).click();
        const fileCard = viewer.locator(".file-mapping-card").first();
        await expect(fileCard).toBeVisible({ timeout: ciVideoTimeout });

        const fileTestId = await fileCard.getAttribute("data-testid");
        const fileId = fileTestId?.replace("file-mapping-card-", "");
        expect(fileId).toBeTruthy();

        await selectDropdownOption(
            page,
            viewer.getByTestId(`channel-mapping-rgb-${fileId}`),
            "Split Channels",
        );
        await expect(
            viewer.getByTestId(`split-channels-${fileId}`),
        ).toBeVisible({ timeout: ciVideoTimeout });

        await selectDropdownOption(
            page,
            viewer.getByTestId(`channel-mapping-R-${fileId}`),
            "AO",
        );
        await selectDropdownOption(
            page,
            viewer.getByTestId(`channel-mapping-G-${fileId}`),
            "Roughness",
        );
        await selectDropdownOption(
            page,
            viewer.getByTestId(`channel-mapping-B-${fileId}`),
            "Metallic",
        );
        await mediumPause(page);

        await page.getByRole("tab", { name: "Preview" }).click();
        const previewCanvas = viewer.locator(".texture-preview-canvas");
        await expect(previewCanvas).toBeVisible({ timeout: ciVideoTimeout });
        await expect(viewer.locator(".texture-loading-overlay")).toBeHidden({
            timeout: ciVideoTimeout,
        });

        const previewBox = await previewCanvas.boundingBox();
        if (previewBox) {
            await page.mouse.move(
                previewBox.x + previewBox.width * 0.55,
                previewBox.y + previewBox.height * 0.55,
                { steps: 18 },
            );
            await page.mouse.down();
            await page.mouse.move(
                previewBox.x + previewBox.width * 0.72,
                previewBox.y + previewBox.height * 0.45,
                { steps: 24 },
            );
            await page.mouse.up();
        }

        await viewerPause(page, 1400);
        await context.close();
    });
});
