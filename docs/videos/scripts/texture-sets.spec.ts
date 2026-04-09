import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    ciVideoTimeout,
    shortPause,
    mediumPause,
    viewerPause,
    navigateTo,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";
const UNIVERSAL_TEXTURE_SET_KIND = 1;

type CreatedTextureSet = {
    textureSetId?: number;
    id?: number;
    fileId?: number;
};

type UploadedFile = {
    fileId?: number;
    id?: number;
};

function getMimeType(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".png":
            return "image/png";
        case ".exr":
            return "image/x-exr";
        default:
            return "application/octet-stream";
    }
}

async function createTextureSetWithFile(
    request: APIRequestContext,
    options: {
        name: string;
        assetPath: string;
        textureType: number;
        kind?: number;
    },
) {
    const buffer = fs.readFileSync(options.assetPath);
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await request.post(
        `${API_BASE_URL}/texture-sets/with-file?name=${encodeURIComponent(options.name)}&textureType=${options.textureType}&kind=${options.kind ?? UNIVERSAL_TEXTURE_SET_KIND}`,
        {
            multipart: {
                file: {
                    name: `${path.basename(options.assetPath, path.extname(options.assetPath))}-${uniqueSuffix}${path.extname(options.assetPath)}`,
                    mimeType: getMimeType(options.assetPath),
                    buffer,
                },
            },
        },
    );

    expect(response.ok()).toBeTruthy();
    return (await response.json()) as CreatedTextureSet;
}

async function uploadFile(
    request: APIRequestContext,
    assetPath: string,
) {
    const buffer = fs.readFileSync(assetPath);
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await request.post(
        `${API_BASE_URL}/files?uploadType=texture`,
        {
            multipart: {
                file: {
                    name: `${path.basename(assetPath, path.extname(assetPath))}-${uniqueSuffix}${path.extname(assetPath)}`,
                    mimeType: getMimeType(assetPath),
                    buffer,
                },
            },
        },
    );

    expect(response.ok()).toBeTruthy();
    return (await response.json()) as UploadedFile;
}

async function addTextureToSet(
    request: APIRequestContext,
    setId: number,
    assetPath: string,
    textureType: number,
) {
    const upload = await uploadFile(request, assetPath);
    const fileId = upload.fileId ?? upload.id;
    expect(fileId).toBeTruthy();

    const response = await request.post(
        `${API_BASE_URL}/texture-sets/${setId}/textures`,
        {
            data: {
                fileId,
                textureType,
            },
        },
    );

    expect(response.ok()).toBeTruthy();
}

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
        const entityTypes: [string, Array<{ id: number }>][] = [
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

test.describe("Texture Sets", () => {
    test("Texture Sets Video", async ({ browser, request }, testInfo) => {
        test.setTimeout(180000);

        // ── Setup off-camera: start from a clean library and seed rich materials ──
        await clearTextureVideoData(request);

        const heroSet = await createTextureSetWithFile(request, {
            name: "Castle Stone",
            assetPath: path.join(assetsDir, "global texture", "diffuse.jpg"),
            textureType: 1,
        });

        const heroSetId = heroSet.textureSetId ?? heroSet.id;
        expect(heroSetId).toBeTruthy();

        await addTextureToSet(
            request,
            heroSetId,
            path.join(assetsDir, "global texture", "displacement.png"),
            3,
        );

        await Promise.all([
            createTextureSetWithFile(request, {
                name: "Ocean Panels",
                assetPath: path.join(assetsDir, "texture_blue.png"),
                textureType: 1,
            }),
            createTextureSetWithFile(request, {
                name: "Garden Accent",
                assetPath: path.join(assetsDir, "green_color.png"),
                textureType: 1,
            }),
        ]);

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            colorScheme: "dark",
            recordVideo: {
                dir: testInfo.outputDir,
                size: { width: 1280, height: 720 },
            },
        });
        const page = await context.newPage();

        // ── Open the library with live preview ready ──
        await navigateTo(
            page,
            `/?leftTabs=textureSets&rightTabs=set-${heroSetId}&activeLeft=textureSets&activeRight=set-${heroSetId}`,
        );
        await disableHighlights(page);

        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        const rightPanel = page.locator(".p-splitter-panel").nth(1);

        await expect(
            leftPanel.locator(".texture-set-card").first(),
        ).toBeVisible({ timeout: ciVideoTimeout });
        await expect(
            rightPanel.locator(".texture-set-viewer"),
        ).toBeVisible({ timeout: ciVideoTimeout });
        await mediumPause(page);

        // ────────────────────────────────────────────────────────────
        // Step 1: Showcase the material library on the left
        // ────────────────────────────────────────────────────────────
        const cards = leftPanel.locator(".texture-set-card");
        const cardCount = await cards.count();
        for (let i = 0; i < Math.min(cardCount, 3); i++) {
            const card = cards.nth(i);
            const box = await card.boundingBox();
            if (box) {
                await page.mouse.move(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                    { steps: 18 },
                );
                await viewerPause(page, 260);
            }
        }
        await shortPause(page);

        // Spotlight the featured material with search
        const searchInput = leftPanel.getByPlaceholder("Search texture sets...");
        await searchInput.click();
        await searchInput.pressSequentially("stone", { delay: 70 });
        await mediumPause(page);

        await expect(
            leftPanel.locator(
                `.texture-set-card[data-texture-set-id="${heroSetId}"]`,
            ),
        ).toBeVisible({ timeout: ciVideoTimeout });
        await mediumPause(page);

        // Step 2: Rename the featured set in the viewer header.
        await rightPanel
            .getByRole("button", { name: "Edit texture set name" })
            .click();
        const nameInput = rightPanel.getByPlaceholder("Texture set name");
        await expect(nameInput).toBeVisible({ timeout: ciVideoTimeout });
        await nameInput.click();
        await nameInput.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A",
        );
        await page.keyboard.press("Backspace");
        await page.keyboard.type("Castle Stone Master", { delay: 60 });
        await viewerPause(page, 220);
        await rightPanel
            .getByRole("button", { name: "Save texture set name" })
            .click();
        await expect(rightPanel.getByText("Castle Stone Master")).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        // Step 3: Show the source files and then the texture type layout.
        await rightPanel.getByRole("tab", { name: "Files" }).click();
        const firstFileCard = rightPanel.locator(".file-mapping-card").first();
        await expect(firstFileCard).toBeVisible({ timeout: ciVideoTimeout });
        const firstFileBox = await firstFileCard.boundingBox();
        if (firstFileBox) {
            await page.mouse.move(
                firstFileBox.x + firstFileBox.width / 2,
                firstFileBox.y + firstFileBox.height / 2,
                { steps: 18 },
            );
            await viewerPause(page, 500);
        }

        await rightPanel.getByRole("tab", { name: "Texture Types" }).click();
        const textureCards = rightPanel.locator(".texture-card.has-texture");
        await expect(textureCards.first()).toBeVisible({ timeout: ciVideoTimeout });
        const visibleTextureCards = await textureCards.count();
        for (let i = 0; i < Math.min(visibleTextureCards, 2); i++) {
            const textureCard = textureCards.nth(i);
            const box = await textureCard.boundingBox();
            if (box) {
                await page.mouse.move(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                    { steps: 16 },
                );
                await viewerPause(page, 400);
            }
        }

        // ── Clean final frame ──
        await page.mouse.move(1160, 90, { steps: 18 });
        await viewerPause(page, 1200);
        await context.close();
    });
});
