import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    glideDrag,
    glideTo,
    holdOn,
    offCamera,
    regionAround,
    shortPause,
    viewerPause,
    navigateTo,
    waitForModelCards,
    waitForThumbnails,
    waitForThumbnailsReady,
    settleImportSuggestions,
    clearAllData,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { uploadDemoModel } from "../helpers/demo-art";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");

test.describe("Model Management", () => {
    test("Model Management Video", async ({ page }, testInfo) => {
        // Off-camera setup: a small, thumbnail-ready library.
        await clearAllData(page);
        // The hero is a block-out "wheel" whose new version is the real tire.
        const modelIds = await Promise.all([
            uploadDemoModel(page, "test-cube.glb", "wheel"),
            uploadDemoModel(page, "test-cylinder.fbx"),
            uploadDemoModel(page, "test-cone.fbx"),
        ]);
        const heroModelId = modelIds[0];
        await waitForThumbnailsReady(page, modelIds);
        await settleImportSuggestions(page);

        // Start on a split view: library on the left, the hero model on the right.
        await navigateTo(
            page,
            `/?leftTabs=modelList&rightTabs=model-${heroModelId}&activeRight=model-${heroModelId}`,
        );
        await waitForModelCards(page, 3);
        await waitForThumbnails(page, 3, 30000);
        const rightPanel = page.locator(".p-splitter-panel").nth(1);
        const canvas = rightPanel.locator("canvas").first();
        await expect(canvas).toBeVisible({ timeout: ciVideoTimeout });
        await viewerPause(page, 1500);

        await startFeatureRecording(page, testInfo, {
            slug: "model-management",
            caption: "Inspect every model in a live 3D viewer",
            cursorAt: { x: 1000, y: 470 },
        });

        const orbit = async (dx: number, dy: number) => {
            const box = await canvas.boundingBox();
            if (!box) return;
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            await glideDrag(
                page,
                { x: cx - dx / 2, y: cy - dy / 2 },
                () => ({ x: cx + dx / 2, y: cy + dy / 2 }),
                { follow: false, maxSteps: 10 },
            );
        };

        // ── Step 1: orbit the hero model ──
        await focusOn(page, await regionAround(rightPanel, 560, 380));
        await orbit(150, -40);
        await shortPause(page);

        // ── Step 2: upload a new version ──
        caption(page, "Upload a new version and keep the old one");
        const menubar = rightPanel.getByTestId("viewer-menubar");
        await focusOn(page, menubar.or(rightPanel.getByTestId("version-dropdown-trigger")), {
            zoom: 1.6,
        });
        const fileMenu = rightPanel
            .locator('.p-menubar .p-menuitem-link:has(.p-menuitem-text:text-is("File"))')
            .first();
        await glideClick(page, fileMenu);
        await glideClick(page, menubar.getByRole("menuitem", { name: "Add New Version" }));

        const versionInput = rightPanel.locator('input[type="file"]').first();
        const uploadDialog = page.locator('.p-dialog:has-text("Upload File to Model")');
        await offCamera(page, async () => {
            await versionInput.setInputFiles({
                name: "wheel.fbx",
                mimeType: "application/octet-stream",
                buffer: fs.readFileSync(path.join(assetsDir, "test-torus.fbx")),
            });
            await uploadDialog.waitFor({ state: "visible", timeout: ciVideoTimeout });
        });
        await focusOn(page, uploadDialog);
        await glideClick(page, page.getByLabel("Create new version"));
        // The dialog grows by a description field; frame it again.
        const descriptionInput = uploadDialog.locator("#description");
        await descriptionInput.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await focusOn(page, uploadDialog);
        await glideClick(page, descriptionInput);
        await page.keyboard.type("Gameplay update", { delay: 45 });
        await shortPause(page);
        await glideClick(
            page,
            uploadDialog.locator(".p-dialog-footer button", { hasText: "Upload" }).first(),
            {
                cutUntil: async () => {
                    await uploadDialog.waitFor({ state: "hidden", timeout: 60000 });
                    await expect(page.locator(".p-toast-message")).toHaveCount(0, {
                        timeout: 15000,
                    });
                },
            },
        );

        // ── Step 3: switch to the new version ──
        caption(page, "Switch between versions at any time");
        const versionDropdown = rightPanel.getByTestId("version-dropdown-trigger");
        await focusOn(page, versionDropdown, { zoom: 1.7 });
        await glideClick(page, versionDropdown);
        // The viewer's "Loading 3D Model..." label is drawn inside the canvas,
        // so there is no DOM state to wait on: cut until the new version's
        // file has downloaded, plus a beat for parsing it.
        const modelFile = page.waitForResponse(
            (response) => /\/files\/\d+/.test(response.url()) && response.ok(),
            { timeout: 30000 },
        );
        await glideClick(page, page.getByTestId("version-dropdown-item-2"), {
            cutUntil: async () => {
                await expect(versionDropdown).toContainText("v2", { timeout: 10000 });
                await modelFile;
                await page.waitForTimeout(900);
            },
        });

        // Bring the new version up close: wheel-zoom and a short orbit.
        await focusOn(page, await regionAround(rightPanel, 560, 380));
        const box = await canvas.boundingBox();
        if (box) {
            await glideTo(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, {
                follow: false,
                durationMs: 500,
            });
            for (let i = 0; i < 6; i++) {
                await page.mouse.wheel(0, -160);
                await page.waitForTimeout(90);
            }
        }
        await orbit(110, 70);
        await glideTo(page, { x: 1215, y: 640 }, { follow: false });
        // End close on the new version (its v2 badge was just shown above).
        await holdOn(page, await regionAround(rightPanel, 520, 360));
        await stopFeatureRecording(page);
    });
});
