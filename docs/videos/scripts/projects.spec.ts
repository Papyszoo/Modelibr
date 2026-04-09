import { test, expect, type Locator, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
    ciVideoTimeout,
    createRecordedPage,
    mediumPause,
    longPause,
    viewerPause,
    navigateTo,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");
const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8090";

async function showIntroSlate(page: Page) {
    await page.setContent(`
        <style>
            :root {
                color-scheme: dark;
                font-family: Inter, system-ui, sans-serif;
            }
            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                overflow: hidden;
                background:
                    radial-gradient(circle at top, rgba(99, 102, 241, 0.42), transparent 42%),
                    linear-gradient(135deg, #07111f 0%, #101a2d 55%, #16233d 100%);
                color: #f8fafc;
            }
            .slate {
                padding: 32px 40px;
                border: 1px solid rgba(148, 163, 184, 0.22);
                border-radius: 24px;
                background: rgba(15, 23, 42, 0.7);
                box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
                backdrop-filter: blur(16px);
            }
            .eyebrow {
                font-size: 12px;
                letter-spacing: 0.24em;
                text-transform: uppercase;
                color: #93c5fd;
                margin-bottom: 12px;
            }
            h1 {
                margin: 0;
                font-size: 52px;
                line-height: 1.02;
            }
            p {
                margin: 12px 0 0;
                color: #cbd5e1;
                font-size: 20px;
            }
        </style>
        <div class="slate">
            <div class="eyebrow">Modelibr</div>
            <h1>Projects</h1>
            <p>Build production-ready collections with context, planning, and assets.</p>
        </div>
    `);
}

async function installRevealOverlay(page: Page) {
    await page.addInitScript(() => {
        window.addEventListener("DOMContentLoaded", () => {
            if (document.getElementById("__projects_video_overlay")) {
                return;
            }

            const overlay = document.createElement("div");
            overlay.id = "__projects_video_overlay";
            overlay.innerHTML = `
                <div class="eyebrow">Modelibr</div>
                <h1>Projects</h1>
                <p>Build production-ready collections with context, planning, and assets.</p>
            `;

            Object.assign(overlay.style, {
                position: "fixed",
                inset: "0",
                display: "grid",
                placeItems: "center",
                background:
                    "radial-gradient(circle at top, rgba(99, 102, 241, 0.42), transparent 42%), linear-gradient(135deg, #07111f 0%, #101a2d 55%, #16233d 100%)",
                color: "#f8fafc",
                zIndex: "999999",
                fontFamily: "Inter, system-ui, sans-serif",
            });

            const styles = document.createElement("style");
            styles.id = "__projects_video_overlay_styles";
            styles.textContent = `
                #__projects_video_overlay > div,
                #__projects_video_overlay {
                    text-align: left;
                }
                #__projects_video_overlay::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.26);
                }
                #__projects_video_overlay .eyebrow,
                #__projects_video_overlay h1,
                #__projects_video_overlay p {
                    position: relative;
                    margin-left: 40px;
                    margin-right: 40px;
                }
                #__projects_video_overlay .eyebrow {
                    font-size: 12px;
                    letter-spacing: 0.24em;
                    text-transform: uppercase;
                    color: #93c5fd;
                    margin-bottom: 12px;
                }
                #__projects_video_overlay h1 {
                    margin-top: 0;
                    margin-bottom: 0;
                    font-size: 52px;
                    line-height: 1.02;
                }
                #__projects_video_overlay p {
                    margin-top: 12px;
                    color: #cbd5e1;
                    font-size: 20px;
                    max-width: 760px;
                }
            `;

            document.head.appendChild(styles);
            document.body.appendChild(overlay);
        });
    });
}

async function removeRevealOverlay(page: Page) {
    await page.evaluate(() => {
        const overlay = document.getElementById("__projects_video_overlay");
        if (!overlay) {
            return;
        }

        overlay.style.transition = "opacity 300ms ease";
        overlay.style.opacity = "0";
        window.setTimeout(() => overlay.remove(), 320);

        const styles = document.getElementById("__projects_video_overlay_styles");
        window.setTimeout(() => styles?.remove(), 340);
    });
}

async function moveToLocator(page: Page, locator: Locator, pause = 250) {
    const target = locator.first();
    await target.waitFor({ state: "visible", timeout: ciVideoTimeout });
    const box = await target.boundingBox();
    if (!box) {
        throw new Error("Unable to move to target locator.");
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 20,
    });
    await viewerPause(page, pause);
}

async function uploadModel(page: Page, fileName: string) {
    const response = await page.request.post(`${API_BASE}/models`, {
        multipart: {
            file: {
                name: fileName,
                mimeType: "application/octet-stream",
                buffer: fs.readFileSync(path.join(assetsDir, fileName)),
            },
        },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return Number(data.id);
}

async function uploadFile(page: Page, fileName: string, mimeType = "image/png") {
    const response = await page.request.post(`${API_BASE}/files`, {
        multipart: {
            file: {
                name: fileName,
                mimeType,
                buffer: fs.readFileSync(path.join(assetsDir, fileName)),
            },
        },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return Number(data.fileId);
}

async function createProject(page: Page, payload: {
    name: string;
    description: string;
    notes: string;
}) {
    const response = await page.request.post(`${API_BASE}/projects`, {
        data: payload,
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return Number(data.id);
}

async function setProjectThumbnail(page: Page, projectId: number, fileId: number) {
    const response = await page.request.put(`${API_BASE}/projects/${projectId}/thumbnail`, {
        data: { fileId },
    });
    expect(response.ok()).toBeTruthy();
}

async function addProjectConcept(page: Page, projectId: number, fileId: number) {
    const response = await page.request.post(
        `${API_BASE}/projects/${projectId}/concept-images`,
        {
            data: { fileId },
        },
    );
    expect(response.ok()).toBeTruthy();
}

async function addModelToProject(page: Page, projectId: number, modelId: number) {
    const response = await page.request.post(
        `${API_BASE}/projects/${projectId}/models/${modelId}`,
    );
    expect(response.ok()).toBeTruthy();
}

test.describe("Projects", () => {
    test("Projects Video", async ({ browser, page: setupPage }, testInfo) => {
        await clearAllData(setupPage);

        const [cubeModelId, coneModelId, cylinderModelId] = await Promise.all([
            uploadModel(setupPage, "test-cube.glb"),
            uploadModel(setupPage, "test-cone.fbx"),
            uploadModel(setupPage, "test-cylinder.fbx"),
        ]);

        const [blueImageId, pinkImageId, yellowImageId, greenImageId, redImageId] =
            await Promise.all([
                uploadFile(setupPage, "blue_color.png"),
                uploadFile(setupPage, "pink_color.png"),
                uploadFile(setupPage, "yellow_color.png"),
                uploadFile(setupPage, "green_color.png"),
                uploadFile(setupPage, "red_color.png"),
            ]);

        await expect
            .poll(
                async () => {
                    const response = await setupPage.request.get(`${API_BASE}/models`);
                    if (!response.ok()) {
                        return 0;
                    }

                    const models = await response.json();
                    return Array.isArray(models) ? models.length : 0;
                },
                { timeout: ciVideoTimeout * 2 },
            )
            .toBeGreaterThanOrEqual(3);

        const skyHarborProjectId = await createProject(setupPage, {
            name: "Sky Harbor Launch",
            description: "Cinematic launch bay with modular ships, cargo props, and lighting beats.",
            notes: "Creative target: fast pitch-ready scene with hero angles and clear set dressing.",
        });
        await setProjectThumbnail(setupPage, skyHarborProjectId, blueImageId);
        await addProjectConcept(setupPage, skyHarborProjectId, blueImageId);
        await addProjectConcept(setupPage, skyHarborProjectId, pinkImageId);
        await addProjectConcept(setupPage, skyHarborProjectId, yellowImageId);
        await addModelToProject(setupPage, skyHarborProjectId, cubeModelId);
        await addModelToProject(setupPage, skyHarborProjectId, coneModelId);

        const forestMarketProjectId = await createProject(setupPage, {
            name: "Forest Night Market",
            description: "Cozy prop collection for lantern stalls, signage, and walkable dressing passes.",
            notes: "Use concept boards to align shape language before adding the ambient audio pass.",
        });
        await setProjectThumbnail(setupPage, forestMarketProjectId, greenImageId);
        await addProjectConcept(setupPage, forestMarketProjectId, greenImageId);
        await addProjectConcept(setupPage, forestMarketProjectId, yellowImageId);
        await addModelToProject(setupPage, forestMarketProjectId, cylinderModelId);

        const dungeonKitProjectId = await createProject(setupPage, {
            name: "Dungeon Builder Kit",
            description: "Reusable room pieces for encounter spaces, traversal tests, and layout mockups.",
            notes: "Keep this one lean until the hero project gets final sign-off.",
        });
        await setProjectThumbnail(setupPage, dungeonKitProjectId, redImageId);
        expect(dungeonKitProjectId).toBeGreaterThan(0);

        const { context, page } = await createRecordedPage(browser, testInfo);
        await showIntroSlate(page);
        await viewerPause(page, 900);
        await installRevealOverlay(page);
        await navigateTo(page, "/?leftTabs=projects&activeLeft=projects");
        await disableHighlights(page);

        const projectCards = page.locator(".project-grid-card");
        await expect(projectCards).toHaveCount(3, { timeout: ciVideoTimeout });
        await expect(page.locator(".project-grid-card-content").first()).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await expect(page.locator(".project-grid-card-description").first()).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await removeRevealOverlay(page);
        await mediumPause(page);

        const searchInput = page.getByPlaceholder("Search projects");
        const featuredCard = page
            .locator(".project-grid-card")
            .filter({ has: page.getByRole("heading", { name: "Sky Harbor Launch" }) });

        await moveToLocator(page, featuredCard, 320);
        const openFiltersButton = page.getByRole("button", { name: "Open Filters" });
        if (await openFiltersButton.isVisible().catch(() => false)) {
            await moveToLocator(page, openFiltersButton, 220);
            await openFiltersButton.click();
            await viewerPause(page, 350);
        }
        await moveToLocator(page, searchInput, 220);
        await searchInput.click();
        await searchInput.pressSequentially("sky", { delay: 55 });
        await viewerPause(page, 700);
        await expect(projectCards).toHaveCount(1, { timeout: ciVideoTimeout });

        await moveToLocator(page, featuredCard, 320);
        await featuredCard.click();
        await expect(
            page.getByRole("heading", { name: /Project:\s*Sky Harbor Launch/i }),
        ).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await disableHighlights(page);
        await longPause(page);

        const coverCard = page.locator(".container-cover-card");
        await moveToLocator(page, coverCard, 320);

        const firstConceptImage = page.getByRole("button", {
            name: /open concept image/i,
        }).first();
        await moveToLocator(page, firstConceptImage, 280);
        await firstConceptImage.click();
        await viewerPause(page, 950);
        await page.keyboard.press("Escape");
        await viewerPause(page, 300);

        const notesField = page.getByLabel("Notes");
        await moveToLocator(page, notesField, 240);
        await notesField.click();
        await notesField.press("End");
        await page.keyboard.type("\nHero prop pass: add the cargo beacon near the launch deck.", {
            delay: 42,
        });
        await viewerPause(page, 380);

        const saveButton = page.getByRole("button", { name: /^Save$/ });
        await moveToLocator(page, saveButton, 260);
        await saveButton.click();
        await expect(page.getByText("Project details updated.")).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await viewerPause(page, 700);

        const modelsTab = page.getByRole("tab", { name: /Models:\s*2/i });
        await moveToLocator(page, modelsTab, 220);
        await modelsTab.click();
        await expect(page.locator(".model-card:not(.model-card-add)").first()).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await mediumPause(page);

        const addModelCard = page.locator(".model-card-add");
        await moveToLocator(page, addModelCard, 240);
        await addModelCard.click();

        const addDialog = page.locator(".p-dialog").filter({
            has: page.getByText("Add Models to Project"),
        });
        await expect(addDialog).toBeVisible({ timeout: ciVideoTimeout });

        const addDialogSearch = addDialog.getByPlaceholder("Search models...");
        await moveToLocator(page, addDialogSearch, 220);
        await addDialogSearch.click();
        await addDialogSearch.pressSequentially("cylinder", { delay: 50 });
        await viewerPause(page, 500);

        const cylinderCard = addDialog.locator(
            `.container-card[data-model-id="${cylinderModelId}"]`,
        );
        await moveToLocator(page, cylinderCard, 240);
        await cylinderCard.click();

        const confirmAddButton = page.getByRole("button", {
            name: /Add Selected \(1\)/,
        });
        await moveToLocator(page, confirmAddButton, 240);
        await confirmAddButton.click();

        await expect(page.getByRole("tab", { name: /Models:\s*3/i })).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await longPause(page);

        const visibleModelCards = page.locator(".model-card:not(.model-card-add)");
        const modelCardCount = await visibleModelCards.count();
        for (let i = 0; i < Math.min(modelCardCount, 3); i++) {
            await moveToLocator(page, visibleModelCards.nth(i), 200);
        }
        await page.mouse.move(1120, 120, { steps: 18 });
        await viewerPause(page, 1200);
        await context.close();
    });
});
