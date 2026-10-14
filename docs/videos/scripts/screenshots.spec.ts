import { test, expect, type Page } from "@playwright/test";
import path from "path";
import {
    ciVideoTimeout,
    clearAllData,
    navigateTo,
    settleImportSuggestions,
    waitForModelCards,
    waitForThumbnails,
    waitForThumbnailsReady,
} from "../helpers/video-helpers";
import { createDemoTextureSet, uploadDemoModel, uploadDemoVersion } from "../helpers/demo-art";
import { screenshotsDir } from "../video-paths.js";

/**
 * The four docs screenshots (docs/static/img/screenshots), captured from the
 * current UI with the same provisioning helpers as the clips. Excluded from
 * every other run (see playwright.config.ts), because the PNGs are committed:
 * `npm run screenshots` re-captures them when the UI they show changes.
 *
 * 1600x803 CSS px - the size the landing page declares for model-list.png -
 * saved at device scale 2 so they stay sharp on high-density screens.
 */
test.use({ viewport: { width: 1600, height: 803 } });

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

async function capture(page: Page, name: string) {
    // The recording cursor is for clips only.
    await page.addStyleTag({ content: "#__docsVideoCursor { display: none !important; }" });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, `${name}.png`), scale: "device" });
}

test.describe("Docs Screenshots", () => {
    test("Docs Screenshots", async ({ page }) => {
        test.setTimeout(300000);
        // Larger cards than the default so the grids fill the frame (the same
        // per-page preference the toolbar's Card Width slider stores).
        await page.addInitScript(() => {
            localStorage.setItem(
                "cardWidthSettings",
                JSON.stringify({ models: 300, recycledFiles: 260 }),
            );
        });
        await clearAllData(page);

        const files = [
            "test-cube.glb",
            "test-cone.fbx",
            "test-cylinder.fbx",
            "test-icosphere.fbx",
            "textured-cube.fbx",
        ];
        const modelIds: number[] = [];
        for (const file of files) {
            modelIds.push(await uploadDemoModel(page, file));
        }
        // A model with two versions for the viewer shot: a block-out wheel
        // whose second version is the finished tire.
        // (Model files are deduplicated by content, so the block-out has to be
        // a mesh no other model uses.)
        const wheelId = await uploadDemoModel(page, "test-cube.stl", "wheel");
        await uploadDemoVersion(page, wheelId, "test-torus.fbx", "wheel");
        modelIds.push(wheelId);
        await waitForThumbnailsReady(page, modelIds);
        await settleImportSuggestions(page);

        // ── model-list.png: the library grid ──
        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await waitForModelCards(page, modelIds.length);
        await waitForThumbnails(page, modelIds.length, 60000);
        await capture(page, "model-list");

        // ── model-viewer.png: the wheel in the viewer, its versions above it ──
        await navigateTo(page, `/?leftTabs=model-${wheelId}&activeLeft=model-${wheelId}`);
        const canvas = page.locator(".p-splitter-panel").first().locator("canvas").first();
        await expect(canvas).toBeVisible({ timeout: ciVideoTimeout });
        await expect(page.getByTestId("version-dropdown-trigger")).toContainText("v2", {
            timeout: ciVideoTimeout,
        });
        await page.waitForTimeout(2000);
        // Bring the tire closer and turn it to a three-quarter view.
        const canvasBox = await canvas.boundingBox();
        if (canvasBox) {
            const cx = canvasBox.x + canvasBox.width / 2;
            const cy = canvasBox.y + canvasBox.height / 2;
            await page.mouse.move(cx, cy);
            for (let i = 0; i < 6; i++) {
                await page.mouse.wheel(0, -160);
                await page.waitForTimeout(100);
            }
            await page.mouse.down();
            await page.mouse.move(cx + 40, cy + 70, { steps: 8 });
            await page.mouse.up();
        }
        await page.waitForTimeout(1500);
        await capture(page, "model-viewer");

        // ── texture-sets.png: a PBR set previewed on a sphere ──
        await createDemoTextureSet(page, "Terracotta Tiles", {
            tile: [196, 104, 66],
            grout: [214, 206, 192],
        });
        await navigateTo(page, "/?leftTabs=globalMaterials&activeLeft=globalMaterials");
        await page.locator(".texture-set-card").first().click();
        const viewer = page.locator(".texture-set-viewer");
        await expect(viewer).toBeVisible({ timeout: ciVideoTimeout });
        await page.getByRole("tab", { name: "Preview" }).click();
        await expect(viewer.locator(".texture-preview-canvas")).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await expect(viewer.locator(".texture-loading-overlay")).toBeHidden({
            timeout: ciVideoTimeout,
        });
        await page.locator('[aria-label="Open preview settings"]').click();
        await page.locator("#preview-settings .p-dropdown").click();
        await page.locator('.p-dropdown-panel .p-dropdown-item:has-text("Sphere")').click();
        await page.locator('#preview-settings [title="Close"]').click();
        await page.waitForTimeout(1500);
        await capture(page, "texture-sets");

        // ── recycled-files.png: a few recycled assets ──
        const recycledIds = modelIds.slice(0, 5);
        for (const id of recycledIds) {
            expect((await page.request.delete(`${API_BASE_URL}/models/${id}`)).ok()).toBeTruthy();
        }
        await navigateTo(page, "/?leftTabs=recycledFiles&activeLeft=recycledFiles");
        await expect(page.locator(".recycled-card")).toHaveCount(recycledIds.length, {
            timeout: ciVideoTimeout,
        });
        await expect(page.locator(".recycled-card img")).toHaveCount(recycledIds.length, {
            timeout: ciVideoTimeout,
        });
        await capture(page, "recycled-files");
    });
});
