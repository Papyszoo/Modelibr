import { test, expect, type Page } from "@playwright/test";
import {
    ciVideoTimeout,
    caption,
    focusOn,
    glideClick,
    glideTo,
    holdOn,
    dwell,
    offCamera,
    mediumPause,
    shortPause,
    viewerPause,
    navigateTo,
    clearAllData,
    settleImportSuggestions,
    waitForThumbnailsReady,
    startFeatureRecording,
    stopFeatureRecording,
} from "../helpers/video-helpers";
import { demoArt, renderSvg, uploadDemoModel } from "../helpers/demo-art";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8090";

async function uploadImage(page: Page, fileName: string, svg: string) {
    const response = await page.request.post(`${API_BASE}/files`, {
        multipart: {
            file: {
                name: fileName,
                mimeType: "image/png",
                buffer: await renderSvg(page, svg, 480, 270),
            },
        },
    });
    expect(response.ok()).toBeTruthy();
    return Number((await response.json()).fileId);
}

async function createProject(
    page: Page,
    payload: { name: string; description: string; notes: string },
    coverId: number,
    referenceIds: number[],
    modelIds: number[],
) {
    const response = await page.request.post(`${API_BASE}/projects`, { data: payload });
    expect(response.ok()).toBeTruthy();
    const projectId = Number((await response.json()).id);
    expect(
        (
            await page.request.put(`${API_BASE}/projects/${projectId}/thumbnail`, {
                data: { fileId: coverId },
            })
        ).ok(),
    ).toBeTruthy();
    for (const fileId of referenceIds) {
        expect(
            (
                await page.request.post(`${API_BASE}/projects/${projectId}/concept-images`, {
                    data: { fileId },
                })
            ).ok(),
        ).toBeTruthy();
    }
    for (const modelId of modelIds) {
        expect(
            (await page.request.post(`${API_BASE}/projects/${projectId}/models/${modelId}`)).ok(),
        ).toBeTruthy();
    }
    return projectId;
}

test.describe("Projects", () => {
    test("Projects Video", async ({ page }, testInfo) => {
        await clearAllData(page);

        const [cubeId, coneId, cylinderId] = await Promise.all([
            uploadDemoModel(page, "test-cube.glb"),
            uploadDemoModel(page, "test-cone.fbx"),
            uploadDemoModel(page, "test-cylinder.fbx"),
        ]);
        await waitForThumbnailsReady(page, [cubeId, coneId, cylinderId]);
        await settleImportSuggestions(page);

        const art = {
            harbor: demoArt.scene(["#7dd3fc", "#e0f2fe"], "#475569", "#fbbf24"),
            harborDusk: demoArt.scene(["#fdba74", "#fde68a"], "#57534e", "#fef3c7"),
            harborNight: demoArt.scene(["#1e3a8a", "#6366f1"], "#0f172a", "#e0e7ff"),
            forest: demoArt.scene(["#134e4a", "#5eead4"], "#14532d", "#fde047"),
            dungeon: demoArt.scene(["#3b0764", "#a78bfa"], "#292524", "#f472b6"),
        };
        const files: Record<string, number> = {};
        for (const [key, svg] of Object.entries(art)) {
            files[key] = await uploadImage(page, `${key}.png`, svg);
        }

        await createProject(
            page,
            {
                name: "Sky Harbor Launch",
                description: "Launch bay with modular ships, cargo props and lighting beats.",
                notes: "Pitch-ready scene with hero angles and clear set dressing.",
            },
            files.harbor,
            [files.harbor, files.harborDusk, files.harborNight],
            [cubeId, coneId],
        );
        await createProject(
            page,
            {
                name: "Forest Night Market",
                description: "Lantern stalls, signage and walkable dressing passes.",
                notes: "Align shape language before the ambient audio pass.",
            },
            files.forest,
            [files.forest],
            [cylinderId],
        );
        await createProject(
            page,
            {
                name: "Dungeon Builder Kit",
                description: "Reusable room pieces for encounters and layout mockups.",
                notes: "Keep this one lean until the hero project is signed off.",
            },
            files.dungeon,
            [],
            [],
        );

        await navigateTo(page, "/?leftTabs=projects&activeLeft=projects");
        const projectCards = page.locator(".project-grid-card");
        await expect(projectCards).toHaveCount(3, { timeout: ciVideoTimeout });
        await expect(page.locator(".project-grid-card img")).toHaveCount(3, {
            timeout: ciVideoTimeout,
        });

        await startFeatureRecording(page, testInfo, {
            slug: "projects",
            caption: "Plan each project with references and assets",
        });

        // ── Step 1: open a project ──
        const featuredCard = projectCards.filter({
            has: page.getByRole("heading", { name: "Sky Harbor Launch" }),
        });
        const referencesTab = page.getByTestId("project-workspace-tab-references");
        await glideClick(page, featuredCard, {
            cutUntil: () => referencesTab.waitFor({ state: "visible", timeout: ciVideoTimeout }),
        });
        await mediumPause(page);

        // ── Step 2: the reference board ──
        caption(page, "Pin reference images to a shared board");
        const referenceBoard = page.getByTestId("project-reference-board");
        await glideClick(page, referencesTab, {
            cutUntil: () =>
                expect
                    .poll(
                        () =>
                            referenceBoard
                                .locator("img")
                                .evaluateAll(
                                    (images) =>
                                        images.filter(
                                            (img) =>
                                                (img as HTMLImageElement).complete &&
                                                (img as HTMLImageElement).naturalWidth > 0,
                                        ).length,
                                ),
                        { timeout: ciVideoTimeout },
                    )
                    .toBe(3),
        });
        await focusOn(page, referenceBoard.locator("img"));
        await dwell(page, 1200);
        // The lightbox covers the whole window: pull back first, and cut its
        // open and close fades.
        await focusOn(page, "full");
        const lightbox = page.locator(".image-lightbox-dialog");
        await glideClick(
            page,
            referenceBoard.getByRole("button", { name: /open reference/i }).nth(1),
            { cutUntil: () => lightbox.waitFor({ state: "visible", timeout: ciVideoTimeout }) },
        );
        await dwell(page, 1500);
        await offCamera(page, async () => {
            await page.keyboard.press("Escape");
            await lightbox.waitFor({ state: "hidden", timeout: ciVideoTimeout });
        });
        await shortPause(page);

        // ── Step 3: collect the models the project needs ──
        caption(page, "Collect the models it needs");
        await focusOn(page, "full");
        const modelsTab = page.getByTestId("container-tab-models");
        const addModelCard = page.locator(".model-card-add");
        await glideClick(page, modelsTab, {
            cutUntil: () => addModelCard.waitFor({ state: "visible", timeout: ciVideoTimeout }),
        });
        const addDialog = page.locator(".p-dialog").filter({
            has: page.getByText("Add Models to Project"),
        });
        const cylinderCard = addDialog.locator(`.container-card[data-model-id="${cylinderId}"]`);
        await glideClick(page, addModelCard, {
            cutUntil: () => cylinderCard.waitFor({ state: "visible", timeout: ciVideoTimeout }),
        });
        await focusOn(page, addDialog);
        await glideClick(page, cylinderCard);
        await glideClick(page, addDialog.getByRole("button", { name: /Add Selected \(1\)/ }), {
            cutUntil: () => addDialog.waitFor({ state: "hidden", timeout: ciVideoTimeout }),
        });
        await expect(page.getByTestId("container-tab-models")).toHaveAttribute(
            "aria-label",
            "Models (3)",
            { timeout: ciVideoTimeout },
        );
        const modelCards = page.locator(".model-card:not(.model-card-add)");
        await expect(modelCards).toHaveCount(3, { timeout: ciVideoTimeout });
        await glideTo(page, modelCards.nth(2), { follow: false });
        await holdOn(page, modelCards);
        await stopFeatureRecording(page);
    });
});
