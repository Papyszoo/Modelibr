import { test, expect } from "@playwright/test";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    glideDrag,
    glideTo,
    holdOn,
    dwell,
    mediumPause,
    shortPause,
    viewerPause,
    navigateTo,
    openNewTabPage,
    pickNewTabTile,
    clearAllData,
    settleImportSuggestions,
    waitForModelCards,
    waitForThumbnails,
    waitForThumbnailsReady,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { demoArt, demoSound, renderSvg, uploadDemoModel } from "../helpers/demo-art";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("User Interface", () => {
    test("User Interface Video", async ({ page }, testInfo) => {
        // ── Setup: a small library across asset types ──
        await clearAllData(page);
        const modelIds = [];
        for (const file of ["test-cube.glb", "test-cone.fbx", "test-cylinder.fbx"]) {
            modelIds.push(await uploadDemoModel(page, file));
        }
        for (const [name, svg] of [
            ["coin-spin", demoArt.coin],
            ["heart-full", demoArt.heart],
            ["gem-green", demoArt.gem],
            ["play-button", demoArt.playButton],
        ] as const) {
            const response = await page.request.post(
                `${API_BASE_URL}/sprites/with-file?name=${name}`,
                {
                    multipart: {
                        file: { name: `${name}.png`, mimeType: "image/png", buffer: await renderSvg(page, svg) },
                    },
                },
            );
            expect(response.ok()).toBeTruthy();
        }
        const soundResponse = await page.request.post(
            `${API_BASE_URL}/sounds/with-file?name=${encodeURIComponent("Quest Complete")}`,
            {
                multipart: {
                    file: { name: "chime.wav", mimeType: "audio/wav", buffer: demoSound("chime") },
                },
            },
        );
        expect(soundResponse.ok()).toBeTruthy();
        await waitForThumbnailsReady(page, modelIds);
        await settleImportSuggestions(page);

        await navigateTo(page, "/?leftTabs=modelList&activeLeft=modelList");
        await waitForModelCards(page, 3);
        await waitForThumbnails(page, 3, 30000);
        const leftPanel = page.locator(".p-splitter-panel").nth(0);
        const leftDockBar = leftPanel.locator(".dock-bar");

        await startFeatureRecording(page, testInfo, {
            slug: "user-interface",
            caption: "Open any page from the New Tab page",
        });

        // ── Step 1: the New Tab page, then Sprites ──
        await openNewTabPage(page, leftPanel);
        // The New Tab page is the hub of the whole app: give it a moment.
        await dwell(page, 1800);
        await pickNewTabTile(page, leftPanel, /^Sprites$/, page.locator(".sprite-card img"));
        await expect(page.locator(".sprite-card img")).toHaveCount(4, { timeout: ciVideoTimeout });
        await mediumPause(page);

        // ── Step 2: drag the Sprites tab into a second panel ──
        caption(page, "Drag a tab aside to work side by side");
        const spritesTab = leftDockBar.locator('.draggable-tab[data-tab-type="sprites"]').first();
        await glideDrag(page, spritesTab, () => page.locator(".dock-bar-right"));
        await expect(page.locator(".p-splitter-panel")).toHaveCount(2, { timeout: ciVideoTimeout });
        await focusOn(page, "full");
        await dwell(page, 1600);

        // ── Step 3: close a tab and bring it back ──
        caption(page, "Closed tabs are one click away");
        await openNewTabPage(page, leftPanel);
        await pickNewTabTile(page, leftPanel, /^Sounds$/, page.locator(".sound-card"));
        const soundsTab = leftDockBar.locator('.draggable-tab[data-tab-type="sounds"]').first();
        await soundsTab.waitFor({ state: "visible", timeout: 5000 });
        await shortPause(page);
        await glideTo(page, soundsTab);
        await glideClick(page, soundsTab.locator(".tab-close-btn"));
        await expect(soundsTab).toBeHidden({ timeout: 5000 });
        await shortPause(page);

        const newtab = await openNewTabPage(page, leftPanel);
        const reopen = newtab.locator('.newtab-recent button[title="Reopen Sounds"]');
        await reopen.waitFor({ state: "visible", timeout: 3000 });
        await glideClick(page, reopen, {
            cutUntil: async () => {
                await newtab.waitFor({ state: "hidden", timeout: 5000 });
                await expect(page.locator(".sound-card")).toHaveCount(1, {
                    timeout: ciVideoTimeout,
                });
            },
        });
        await expect(soundsTab).toBeVisible({ timeout: 5000 });
        await expect(page.locator(".sound-card img.sound-waveform").first()).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await holdOn(page, "full");
        await stopFeatureRecording(page);
    });
});
