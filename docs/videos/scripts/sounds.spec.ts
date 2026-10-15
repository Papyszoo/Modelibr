import { test, expect } from "@playwright/test";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    glideDrag,
    holdOn,
    mediumPause,
    shortPause,
    viewerPause,
    navigateTo,
    clearAllData,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { demoSound } from "../helpers/demo-art";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Sounds", () => {
    test("Sounds Video", async ({ page }, testInfo) => {
        const sounds = [
            { name: "Forest Ambience", kind: "ambience" as const },
            { name: "Menu Click", kind: "click" as const },
            { name: "Quest Complete", kind: "chime" as const },
        ];
        const renamedSound = "Interface Click";
        const categoryName = "UI SFX";
        const soundCard = (name: string) =>
            page.locator(".sound-card").filter({ hasText: name }).first();

        // ── Setup off-camera: a clean library with three distinct sounds ──
        await clearAllData(page);
        for (const sound of sounds) {
            const response = await page.request.post(
                `${API_BASE_URL}/sounds/with-file?name=${encodeURIComponent(sound.name)}`,
                {
                    multipart: {
                        file: {
                            name: `${sound.kind}.wav`,
                            mimeType: "audio/wav",
                            buffer: demoSound(sound.kind),
                        },
                    },
                },
            );
            expect(response.ok()).toBeTruthy();
        }

        // The worker renders each waveform thumbnail asynchronously.
        await expect
            .poll(
                async () => {
                    const response = await page.request.get(`${API_BASE_URL}/sounds`);
                    const body = response.ok() ? await response.json() : { sounds: [] };
                    return (body.sounds || []).filter(
                        (sound: { waveformUrl?: string }) => sound.waveformUrl,
                    ).length;
                },
                { timeout: 60000, intervals: [500, 1000] },
            )
            .toBe(sounds.length);

        await navigateTo(page, "/?leftTabs=sounds&activeLeft=sounds");
        await expect(page.locator(".sound-card img.sound-waveform")).toHaveCount(sounds.length, {
            timeout: ciVideoTimeout,
        });
        for (const sound of sounds) {
            await expect(soundCard(sound.name).locator(".sound-control-btn").first()).toBeEnabled({
                timeout: ciVideoTimeout,
            });
        }

        await startFeatureRecording(page, testInfo, {
            slug: "sounds",
            caption: "Preview any sound straight from the grid",
        });

        // ── Step 1: instant preview from the grid ──
        const chimePreview = soundCard("Quest Complete").locator(".sound-control-btn").first();
        await focusOn(page, page.locator(".sound-card"));
        await glideClick(page, chimePreview);
        await viewerPause(page, 1500);

        // ── Step 2: open the editor, play the waveform, rename ──
        const menuCard = soundCard("Menu Click");
        const soundEditor = page.locator(".sound-editor");
        await glideClick(page, menuCard, {
            anchor: { x: 0.45, y: 0.3 },
            cutUntil: async () => {
                await soundEditor.waitFor({ state: "visible", timeout: ciVideoTimeout });
                await expect(page.getByTestId("sound-play-pause")).toBeEnabled({
                    timeout: ciVideoTimeout,
                });
            },
        });
        await focusOn(page, soundEditor);
        caption(page, "Open one to see its waveform and rename it");
        await glideClick(page, page.getByTestId("sound-play-pause"));
        await viewerPause(page, 900);

        await glideClick(page, page.getByTestId("sound-name-edit"));
        const nameInput = page.getByTestId("sound-name-input");
        await nameInput.fill("");
        await page.keyboard.type(renamedSound, { delay: 45 });
        await shortPause(page);
        await glideClick(page, page.getByTestId("sound-name-save"));
        await expect(page.getByTestId("sound-name-display")).toHaveText(renamedSound);
        await mediumPause(page);

        await glideClick(page, soundEditor.locator(".sound-editor-header button").last(), {
            cutUntil: () => soundEditor.waitFor({ state: "hidden", timeout: ciVideoTimeout }),
        });
        await expect(soundCard(renamedSound)).toBeVisible({ timeout: ciVideoTimeout });

        // ── Step 3: file it under a new category ──
        await focusOn(page, page.getByTestId("category-tree-all").or(page.locator(".sound-card")));
        caption(page, "Sort sounds into categories by dragging");
        await glideClick(page, page.getByTestId("category-tree-all"), { button: "right" });
        const addCategoryItem = page
            .locator(".p-contextmenu .p-menuitem-text")
            .filter({ hasText: "Add category" })
            .first();
        await glideClick(page, addCategoryItem);
        const inlineInput = page.getByTestId("category-tree-inline-input");
        await inlineInput.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await page.keyboard.type(categoryName, { delay: 45 });
        await inlineInput.press("Enter");
        // Pull back so the confirmation toast is in frame.
        await focusOn(page, "full");

        const categoryNode = page
            .locator(".sound-category-sidebar .p-treenode-content")
            .filter({ hasText: categoryName })
            .first();
        await categoryNode.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await shortPause(page);
        await glideClick(
            page,
            page.locator(".sound-category-sidebar .category-tree-unassigned").first(),
        );
        await expect(soundCard(renamedSound)).toBeVisible({ timeout: ciVideoTimeout });

        await glideDrag(page, soundCard(renamedSound), () => categoryNode);
        await expect(categoryNode).toContainText("(1)", { timeout: ciVideoTimeout });
        await mediumPause(page);

        await glideClick(page, categoryNode);
        await expect(page.locator(".sound-card")).toHaveCount(1, { timeout: ciVideoTimeout });
        await holdOn(
            page,
            page
                .locator(".sound-category-sidebar .p-treenode-content")
                .or(page.getByTestId("category-tree-all"))
                .or(soundCard(renamedSound)),
        );
        await stopFeatureRecording(page);
    });
});
