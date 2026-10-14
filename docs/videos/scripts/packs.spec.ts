import { test, expect } from "@playwright/test";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    glideTo,
    glideType,
    holdOn,
    mediumPause,
    shortPause,
    navigateTo,
    clearAllData,
    settleImportSuggestions,
    waitForThumbnailsReady,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { demoArt, renderSvg, uploadDemoModel } from "../helpers/demo-art";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Packs", () => {
    test("Packs Video", async ({ page }, testInfo) => {
        // ── Setup: clear data and upload models via API ──
        await clearAllData(page);

        const modelIds = [
            await uploadDemoModel(page, "test-cube.glb"),
            await uploadDemoModel(page, "test-cone.fbx"),
        ];
        await waitForThumbnailsReady(page, modelIds);
        await settleImportSuggestions(page);

        // Two existing packs with covers, so the clip opens on a real library.
        for (const pack of [
            {
                name: "Fantasy Village",
                description: "Cottages, fences and market stalls.",
                cover: demoArt.scene(["#86efac", "#ecfccb"], "#166534", "#fde047"),
            },
            {
                name: "Desert Outpost",
                description: "Sandstone ruins, tents and cargo.",
                cover: demoArt.scene(["#fdba74", "#fef3c7"], "#9a3412", "#fff7ed"),
            },
        ]) {
            const created = await page.request.post(`${API_BASE}/packs`, {
                data: { name: pack.name, description: pack.description },
            });
            expect(created.ok()).toBeTruthy();
            const packId = Number((await created.json()).id);
            const cover = await page.request.post(`${API_BASE}/files`, {
                multipart: {
                    file: {
                        name: `${packId}-cover.png`,
                        mimeType: "image/png",
                        buffer: await renderSvg(page, pack.cover, 480, 270),
                    },
                },
            });
            expect(cover.ok()).toBeTruthy();
            const thumbnail = await page.request.put(`${API_BASE}/packs/${packId}/thumbnail`, {
                data: { fileId: Number((await cover.json()).fileId) },
            });
            expect(thumbnail.ok()).toBeTruthy();
        }

        await navigateTo(page, "/?leftTabs=packs&activeLeft=packs");
        const createBtn = page
            .locator("button")
            .filter({ hasText: /create.*pack/i })
            .last();
        await createBtn.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await expect(page.locator(".pack-grid-card img")).toHaveCount(2, {
            timeout: ciVideoTimeout,
        });

        await startFeatureRecording(page, testInfo, {
            slug: "packs",
            caption: "Bundle models, textures and sounds into a pack",
        });

        // ── Step 1: create the pack ──
        await glideClick(page, createBtn);
        const dialog = page.locator(".p-dialog").first();
        await dialog.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await focusOn(page, dialog);
        caption(page, "Give it a name and a short description");
        await shortPause(page);

        await glideType(page, dialog.locator("input").first(), "Sci-Fi Essentials");
        await shortPause(page);
        await glideType(
            page,
            dialog.locator("textarea").first(),
            "Hero props and modular hull pieces.",
            32,
        );
        await shortPause(page);

        await glideClick(
            page,
            dialog.locator("button").filter({ hasText: /create|save/i }).first(),
            { cutUntil: () => dialog.waitFor({ state: "hidden", timeout: ciVideoTimeout }) },
        );

        // ── Step 2: open the new pack ──
        const packCard = page
            .locator(".pack-grid-card")
            .filter({ hasText: "Sci-Fi Essentials" })
            .first();
        await packCard.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await focusOn(page, "full");
        caption(page, null);
        await mediumPause(page);
        caption(page, "Open it to fill it with assets");
        const modelsTab = page.getByTestId("container-tab-models");
        await glideClick(page, packCard, {
            cutUntil: () =>
                page
                    .getByText("Publishing Details")
                    .waitFor({ state: "visible", timeout: ciVideoTimeout }),
        });
        await mediumPause(page);
        caption(page, "Add models to it in one step");
        const addModelCard = page.locator(".model-card.model-card-add");
        await glideClick(page, modelsTab, {
            cutUntil: () => addModelCard.waitFor({ state: "visible", timeout: ciVideoTimeout }),
        });

        // ── Step 3: add both models ──
        await focusOn(page, addModelCard, { zoom: 1.6 });
        await shortPause(page);
        const selectionDialog = page.locator(".p-dialog").filter({
            has: page.getByText("Add Models to Pack"),
        });
        const selectableItems = selectionDialog.locator(".container-card[data-model-id]");
        await glideClick(page, addModelCard, {
            cutUntil: () => expect(selectableItems).toHaveCount(2, { timeout: ciVideoTimeout }),
        });
        await focusOn(page, selectionDialog);
        for (let i = 0; i < 2; i++) {
            await glideClick(page, selectableItems.nth(i));
        }
        await glideClick(
            page,
            selectionDialog.getByRole("button", { name: /Add Selected \(2\)/ }),
            {
                cutUntil: () =>
                    selectionDialog.waitFor({ state: "hidden", timeout: ciVideoTimeout }),
            },
        );

        await expect(page.getByTestId("container-tab-models")).toHaveAttribute(
            "aria-label",
            "Models (2)",
            { timeout: ciVideoTimeout },
        );
        const assignedModelCards = page.locator(".model-card:not(.model-card-add)");
        await expect(assignedModelCards).toHaveCount(2, { timeout: ciVideoTimeout });
        caption(page, "Both models now live in the pack");
        await glideTo(page, assignedModelCards.nth(1), { follow: false });
        await holdOn(page, page.locator(".model-card"));
        await stopFeatureRecording(page);
    });
});
