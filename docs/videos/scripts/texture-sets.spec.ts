import { test, expect, type APIRequestContext } from "@playwright/test";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    glideTo,
    holdOn,
    dwell,
    regionAround,
    mediumPause,
    shortPause,
    viewerPause,
    navigateTo,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { createDemoTextureSet } from "../helpers/demo-art";

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
        const entityTypes: [string, Array<{ id: number }>][] = [
            ["textureSet", recycled.textureSets || []],
            ["texture", recycled.textures || []],
        ];
        for (const [type, items] of entityTypes) {
            for (const item of items) {
                await request.delete(`${API_BASE_URL}/recycled/${type}/${item.id}/permanent`);
            }
        }
    }
}

test.describe("Texture Sets", () => {
    test("Texture Sets Video", async ({ page, request }, testInfo) => {
        test.setTimeout(420000);
        await clearTextureVideoData(request);

        await createDemoTextureSet(page, "Slate Floor", {
            tile: [92, 108, 128],
            grout: [48, 52, 58],
            tiles: 3,
        });
        await createDemoTextureSet(page, "Terracotta Tiles", {
            tile: [196, 104, 66],
            grout: [214, 206, 192],
        });
        const heroName = "Terracotta Tiles";

        // A GLOBAL texture set lives on the Global Materials page.
        await navigateTo(page, "/?leftTabs=globalMaterials&activeLeft=globalMaterials");
        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        await expect(leftPanel.locator(".list-toolbar")).toBeVisible({ timeout: ciVideoTimeout });
        const heroCard = leftPanel
            .locator(".texture-set-card")
            .filter({ hasText: new RegExp(heroName, "i") })
            .first();
        await expect(heroCard.getByText(/3 textures?/i)).toBeVisible({ timeout: ciVideoTimeout });

        // ── Off-camera prewarm ────────────────────────────────────────────
        // Open the viewer and the Preview tab once BEFORE recording so the
        // texture decode and GPU upload are paid off camera, then restore the
        // library grid.
        await heroCard.click();
        const viewer = page.locator(".texture-set-viewer");
        await expect(viewer).toBeVisible({ timeout: ciVideoTimeout });
        await page.getByRole("tab", { name: "Preview" }).click();
        await expect(viewer.locator(".texture-preview-canvas")).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await expect(viewer.locator(".texture-loading-overlay")).toBeHidden({
            timeout: ciVideoTimeout,
        });
        await page.getByRole("tab", { name: "Texture Types" }).click();
        await leftPanel.locator(".dock-bar .draggable-tab").first().click();
        await expect(heroCard).toBeVisible({ timeout: ciVideoTimeout });
        await expect(leftPanel.locator(".texture-set-card img").first()).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        await startFeatureRecording(page, testInfo, {
            slug: "texture-sets",
            caption: "Build reusable materials from texture maps",
        });

        await glideClick(page, heroCard, {
            cutUntil: () =>
                expect(viewer.getByRole("heading", { name: heroName })).toBeVisible({
                    timeout: ciVideoTimeout,
                }),
        });
        caption(page, "Each map sits in its own channel");
        await dwell(page, 1600);

        const previewTab = page.getByRole("tab", { name: "Preview" });
        await glideClick(page, previewTab, {
            cutUntil: async () => {
                // The loader mounts a beat after the tab switch.
                await viewer
                    .locator(".texture-loading-overlay")
                    .waitFor({ state: "visible", timeout: 1500 })
                    .catch(() => {});
                await expect(viewer.locator(".texture-preview-canvas")).toBeVisible({
                    timeout: ciVideoTimeout,
                });
                await expect(viewer.locator(".texture-loading-overlay")).toBeHidden({
                    timeout: ciVideoTimeout,
                });
            },
        });
        // Pinned to the top: the preview's subject sits low in the canvas.
        caption(page, "Preview the material on any shape", { position: "top" });
        await focusOn(page, "full");
        await viewerPause(page, 900);

        await glideClick(page, page.locator('[aria-label="Open preview settings"]'));
        await expect(page.locator("#preview-settings")).toBeVisible({ timeout: ciVideoTimeout });
        await shortPause(page);
        const sphereOption = page.locator('.p-dropdown-panel .p-dropdown-item:has-text("Sphere")');
        // Cut the dropdown's open fade, where old and new text overlap.
        await glideClick(page, page.locator("#preview-settings .p-dropdown"), {
            cutUntil: async () => {
                await sphereOption.waitFor({ state: "visible", timeout: ciVideoTimeout });
                await page.waitForTimeout(200);
            },
        });
        await glideClick(page, sphereOption);
        await viewerPause(page, 500);
        await glideClick(page, page.locator('#preview-settings [title="Close"]'));
        await glideTo(page, { x: 1180, y: 640 }, { follow: false });

        await holdOn(page, await regionAround(viewer.locator(".texture-preview-canvas"), 520, 360));
        await stopFeatureRecording(page);
    });
});
