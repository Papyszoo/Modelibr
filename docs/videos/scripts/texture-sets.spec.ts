import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    ciVideoTimeout,
    mediumPause,
    viewerPause,
    navigateTo,
    disableHighlights,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const globalTextureDir = path.resolve(
    __dirname,
    "../../../tests/e2e/assets/global texture",
);
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

const globalTextureFiles = [
    { file: "diffuse.jpg", textureType: 1 },
    { file: "normal.exr", textureType: 2 },
    { file: "roughness.exr", textureType: 5 },
];

function getMimeType(fileName: string) {
    if (fileName.endsWith(".jpg")) {
        return "image/jpeg";
    }
    if (fileName.endsWith(".png")) {
        return "image/png";
    }
    if (fileName.endsWith(".exr")) {
        return "image/x-exr";
    }

    return "application/octet-stream";
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

async function uploadFileToTextureSet(
    request: APIRequestContext,
    textureSetId: number,
    fileName: string,
    textureType: number,
) {
    const filePath = path.join(globalTextureDir, fileName);
    const uploadResponse = await request.post(
        `${API_BASE_URL}/files?textureSetId=${textureSetId}`,
        {
            multipart: {
                file: {
                    name: fileName,
                    mimeType: getMimeType(fileName),
                    buffer: fs.readFileSync(filePath),
                },
            },
        },
    );

    expect(uploadResponse.ok()).toBeTruthy();
    const uploadBody = await uploadResponse.json();
    const fileId = Number(uploadBody.id ?? uploadBody.fileId);
    expect(fileId).toBeTruthy();

    const attachResponse = await request.post(
        `${API_BASE_URL}/texture-sets/${textureSetId}/textures`,
        {
            data: {
                FileId: fileId,
                TextureType: textureType,
            },
        },
    );

    expect(attachResponse.ok()).toBeTruthy();
}

async function createGlobalTextureSet(request: APIRequestContext) {
    const textureSetName = "Global Texture Material";
    const [firstFile, ...remainingFiles] = globalTextureFiles;
    const createResponse = await request.post(
        `${API_BASE_URL}/texture-sets/with-file?name=${encodeURIComponent(textureSetName)}&textureType=${firstFile.textureType}&kind=1`,
        {
            multipart: {
                file: {
                    name: firstFile.file,
                    mimeType: getMimeType(firstFile.file),
                    buffer: fs.readFileSync(path.join(globalTextureDir, firstFile.file)),
                },
            },
        },
    );

    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    const textureSetId = Number(createBody.textureSetId ?? createBody.id);
    expect(textureSetId).toBeTruthy();

    for (const file of remainingFiles) {
        await uploadFileToTextureSet(
            request,
            textureSetId,
            file.file,
            file.textureType,
        );
    }

    await expect
        .poll(
            async () => {
                const response = await request.get(
                    `${API_BASE_URL}/texture-sets/${textureSetId}`,
                );
                if (!response.ok()) {
                    return -1;
                }

                const textureSet = await response.json();
                return textureSet.textures?.length ?? 0;
            },
            {
                timeout: 15000,
                intervals: [500, 1000, 1500],
            },
        )
        .toBe(3);

    return { textureSetId, textureSetName };
}

test.describe("Texture Sets", () => {
    test("Texture Sets Video", async ({ page, request }, testInfo) => {
        test.setTimeout(420000);
        await clearTextureVideoData(request);
        const { textureSetName } = await createGlobalTextureSet(request);

        // The combined Texture Sets tab was split; this video demos a GLOBAL
        // texture set, which lives on the Global Materials page.
        await navigateTo(page, "/?leftTabs=globalMaterials&activeLeft=globalMaterials");
        await disableHighlights(page);

        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        // The dedicated `<h1>Texture Sets</h1>` header band was removed
        // when the page adopted the shared list-toolbar — page identity
        // is now carried by the toolbar's count chip + the "Create Set"
        // button. Confirm we're on the right page by waiting on those.
        await expect(leftPanel.locator(".list-toolbar")).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await expect(
            leftPanel.getByRole("button", { name: /create set/i }),
        ).toBeVisible({
            timeout: ciVideoTimeout,
        });

        const textureSetCard = leftPanel
            .locator(".texture-set-card")
            .filter({ hasText: new RegExp(textureSetName, "i") })
            .first();
        await expect(textureSetCard).toBeVisible({ timeout: ciVideoTimeout });
        await expect(textureSetCard.getByText(/3 textures?/i)).toBeVisible({
            timeout: ciVideoTimeout,
        });

        // ── Off-camera prewarm ────────────────────────────────────────────
        // Open the viewer and the Preview tab once BEFORE recording so the
        // EXR decode + GPU texture upload cost is paid off-camera. Without
        // this, the recorded Preview beat spends many seconds on a barely
        // moving canvas (and synthetic drag steps crawl while the render
        // loop is saturated). Then restore the pre-recording UI state.
        await textureSetCard.click();
        const prewarmViewer = page.locator(".texture-set-viewer");
        await expect(prewarmViewer).toBeVisible({ timeout: ciVideoTimeout });
        await page.getByRole("tab", { name: "Preview" }).click();
        await expect(
            prewarmViewer.locator(".texture-preview-canvas"),
        ).toBeVisible({ timeout: ciVideoTimeout });
        await expect(
            prewarmViewer.locator(".texture-loading-overlay"),
        ).toBeHidden({ timeout: ciVideoTimeout });
        // Restore: back to the default tab, then back to the list tab (the
        // first dock tab) so the recording starts from the library grid.
        await page.getByRole("tab", { name: "Texture Types" }).click();
        await leftPanel.locator(".dock-bar .draggable-tab").first().click();
        await expect(textureSetCard).toBeVisible({ timeout: ciVideoTimeout });
        await mediumPause(page);

        await startFeatureRecording(page, testInfo, { slug: "texture-sets" });

        const cardBox = await textureSetCard.boundingBox();
        if (cardBox) {
            await page.mouse.move(
                cardBox.x + cardBox.width / 2,
                cardBox.y + cardBox.height / 2,
                { steps: 18 },
            );
            await viewerPause(page, 220);
        }
        await textureSetCard.click();

        const viewer = page.locator(".texture-set-viewer");
        await expect(viewer).toBeVisible({ timeout: ciVideoTimeout });
        await expect(
            viewer.getByRole("heading", { name: textureSetName }),
        ).toBeVisible({
            timeout: ciVideoTimeout,
        });

        await page.getByRole("tab", { name: "Files" }).click();
        const filesTab = viewer.locator(".files-tab");
        await expect(filesTab).toBeVisible({ timeout: ciVideoTimeout });
        for (const fileName of globalTextureFiles.map(file => file.file)) {
            await expect(filesTab.getByText(fileName, { exact: true })).toBeVisible({
                timeout: ciVideoTimeout,
            });
        }
        await mediumPause(page);

        const firstFileCard = filesTab.locator(".file-mapping-card").first();
        const firstFileCardBox = await firstFileCard.boundingBox();
        if (firstFileCardBox) {
            await page.mouse.move(
                firstFileCardBox.x + firstFileCardBox.width * 0.72,
                firstFileCardBox.y + firstFileCardBox.height * 0.42,
                { steps: 12 },
            );
            await viewerPause(page, 180);
        }

        await page.getByRole("tab", { name: "Preview" }).click();
        const previewCanvas = viewer.locator(".texture-preview-canvas");
        await expect(previewCanvas).toBeVisible({ timeout: ciVideoTimeout });
        await expect(viewer.locator(".preview-control-btn").first()).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await expect(viewer.locator(".texture-loading-overlay")).toBeHidden({
            timeout: ciVideoTimeout,
        });
        await viewerPause(page, 900);

        // Final beat: switch the preview geometry via Preview Settings — a
        // visible 3D payoff. Deliberately NOT an orbit drag, and deliberately
        // plain clicks instead of humanClick: this canvas renders with
        // frameloop="always", and under software WebGL (headless recording,
        // CI) every synthetic pointer step over it waits ~2s for the render
        // loop, so glide paths crossing the canvas turn into slow motion.
        await page.locator('[aria-label="Open preview settings"]').click();
        await expect(page.locator("#preview-settings")).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);
        await page.locator("#preview-settings .p-dropdown").click();
        await page
            .locator('.p-dropdown-panel .p-dropdown-item:has-text("Sphere")')
            .click();
        await viewerPause(page, 700);
        await page.locator('#preview-settings [title="Close"]').click();

        await viewerPause(page, 1200);
        await stopFeatureRecording(page);
    });
});
