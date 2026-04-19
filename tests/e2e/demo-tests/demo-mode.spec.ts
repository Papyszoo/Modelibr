import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { test, expect, type Page } from "@playwright/test";

import { navigateToTab, openTabViaMenu } from "../helpers/navigation-helper";
import { EnvironmentMapsPage } from "../pages/EnvironmentMapsPage";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import { RecycledFilesPage } from "../pages/RecycledFilesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SoundListPage } from "../pages/SoundListPage";
import { SpriteListPage } from "../pages/SpriteListPage";
import { TextureSetsPage } from "../pages/TextureSetsPage";
import { UploadHistoryPage } from "../pages/UploadHistoryPage";

const assetsDir = fileURLToPath(new URL("../assets/", import.meta.url));

async function createUploadCopy(sourceFileName, targetFileName) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "modelibr-demo-"));
    const sourcePath = path.join(assetsDir, sourceFileName);
    const targetPath = path.join(tempDir, targetFileName);

    await fs.copyFile(sourcePath, targetPath);

    return {
        filePath: targetPath,
        async cleanup() {
            await fs.rm(tempDir, { recursive: true, force: true });
        },
    };
}

async function createPack(page, name, description, licenseType, url) {
    await navigateToTab(page, "packs");

    await page.getByRole("button", { name: "Create Pack" }).first().click();

    const dialog = page.locator('.p-dialog:has-text("Create New Pack")');
    await expect(dialog).toBeVisible();

    await dialog.locator("#pack-name").fill(name);
    await dialog.locator("#pack-description").fill(description);
    if (licenseType) {
        await dialog.locator("#pack-license .p-dropdown-trigger").click();
        await page
            .locator(".p-dropdown-item", { hasText: licenseType })
            .click();
    }
    if (url) {
        await dialog.locator("#pack-url").fill(url);
    }
    await dialog.locator('.p-dialog-footer button:has-text("Create")').click();

    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(
        page.locator(".pack-grid-card", { hasText: name }).first(),
    ).toBeVisible({
        timeout: 15000,
    });
}

async function openPack(page, name) {
    const packCard = page.locator(".pack-grid-card", { hasText: name }).first();
    await expect(packCard).toBeVisible({ timeout: 15000 });
    await packCard.click();
    await expect(page.locator(".container-viewer")).toBeVisible({
        timeout: 15000,
    });
}

async function createProject(page, name, description, notes) {
    await navigateToTab(page, "projects");

    await page.getByRole("button", { name: "Create Project" }).first().click();

    const dialog = page.locator('.p-dialog:has-text("Create New Project")');
    await expect(dialog).toBeVisible();

    await dialog.locator("#project-name").fill(name);
    await dialog.locator("#project-description").fill(description);
    await dialog.locator("#project-notes").fill(notes);
    await dialog.locator('.p-dialog-footer button:has-text("Create")').click();

    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(
        page.locator(".project-grid-card", { hasText: name }).first(),
    ).toBeVisible({ timeout: 15000 });
}

async function openProject(page, name) {
    const projectCard = page
        .locator(".project-grid-card", { hasText: name })
        .first();
    await expect(projectCard).toBeVisible({ timeout: 15000 });
    await projectCard.click();
    await expect(page.locator(".container-viewer")).toBeVisible({
        timeout: 15000,
    });
}

async function addModelToOpenPack(page, modelName, modelId) {
    await page.locator(".p-tabview-nav li", { hasText: /^Models:/ }).click();

    const addCard = page.locator(".model-card.model-card-add").first();
    await expect(addCard).toBeVisible({ timeout: 15000 });
    await addCard.click();

    const dialog = page.locator('.p-dialog:has-text("Add Models to Pack")');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    const modelCard = dialog
        .locator(`.container-card[data-model-id="${modelId}"]`)
        .filter({ hasText: modelName })
        .first();
    await expect(modelCard).toBeVisible({ timeout: 15000 });
    await modelCard.click();

    const addSelectedButton = dialog.getByRole("button", {
        name: /Add Selected \(1\)/,
    });
    await expect(addSelectedButton).toBeEnabled({ timeout: 10000 });
    await addSelectedButton.click();

    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(
        page.locator(`.model-card[data-model-id="${modelId}"]`),
    ).toBeVisible({
        timeout: 15000,
    });
}

test.describe("demo mode e2e", () => {
    test("shows seeded demo libraries across tabs", async ({ page }) => {
        const modelListPage = new ModelListPage(page);
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const textureSetsPage = new TextureSetsPage(page);
        const spriteListPage = new SpriteListPage(page);
        const soundListPage = new SoundListPage(page);

        await modelListPage.goto();
        await expect(page.getByText("Test Cube").first()).toBeVisible();
        await expect(page.getByText("Test Torus").first()).toBeVisible();
        await page.getByRole("button", { name: /^filters$/i }).click();
        await page
            .locator(
                "#model-grid-filters-panel .models-filter-switch .p-inputswitch",
            )
            .click();
        await expect(page.locator('[data-model-id="1"]')).toBeVisible();
        await expect(page.locator('[data-model-id="2"]')).toHaveCount(0);

        await textureSetsPage.goto();
        await textureSetsPage.selectKindTab("Global Materials");
        expect(await textureSetsPage.getTextureSetNames()).toEqual(
            expect.arrayContaining(["Global Stone Material"]),
        );

        await textureSetsPage.selectKindTab("Model-Specific");
        expect(await textureSetsPage.getTextureSetNames()).toEqual(
            expect.arrayContaining(["Basic Texture Set", "Color Textures"]),
        );

        await navigateToTab(page, "packs");
        const demoPackCard = page
            .locator(".pack-grid-card", { hasText: "Demo Pack" })
            .first();
        await expect(demoPackCard).toBeVisible();
        await expect(demoPackCard).toContainText("Royalty Free");
        await expect(demoPackCard.locator("img")).toBeVisible();
        await expect(
            page.locator(".pack-grid-card", { hasText: "Shapes Pack" }).first(),
        ).toBeVisible();

        await navigateToTab(page, "projects");
        const demoProjectCard = page
            .locator(".project-grid-card", { hasText: "Demo Project" })
            .first();
        await expect(demoProjectCard).toBeVisible();
        await expect(demoProjectCard.locator("img")).toBeVisible();
        await expect(
            demoProjectCard.locator(".project-grid-card-stats span").last(),
        ).toContainText("1");

        await spriteListPage.goto();
        expect(await spriteListPage.getSpriteCount()).toBeGreaterThanOrEqual(1);
        expect(await spriteListPage.spriteExists("Demo Sprite")).toBe(true);

        await soundListPage.goto();
        expect(await soundListPage.soundExists("Test Tone")).toBe(true);
        await soundListPage.clickSoundByName("Test Tone");
        await expect(page.locator(".p-dialog")).toContainText("Test Tone");
        await soundListPage.closeDialog();

        await environmentMapsPage.goto();
        await environmentMapsPage.waitForToolbarCountLabel("1 map");
        await environmentMapsPage.waitForEnvironmentMapByName("City Night Lights");
    });

    test("opens a seeded environment map preview in demo mode", async ({ page }) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);

        await environmentMapsPage.goto();
        await environmentMapsPage.openEnvironmentMapByName("City Night Lights");
        await environmentMapsPage.waitForPreviewSizeLabel("1K");
        await environmentMapsPage.waitForPreviewSizeLabel("2K");
        await environmentMapsPage.waitForThreeJsPreviewLoaded();
    });

    test("opens a seeded model viewer with linked materials", async ({
        page,
    }) => {
        const modelListPage = new ModelListPage(page);
        const modelViewerPage = new ModelViewerPage(page);

        await modelListPage.openModel("Test Cylinder");
        await modelViewerPage.waitForModelLoaded();
        await modelViewerPage.openTab(
            "Materials",
            '[data-testid="materials-panel"]',
        );

        await expect(
            page.locator('[data-testid="materials-panel"]'),
        ).toContainText("Basic Texture Set");
    });

    test("uploads a model and records it in upload history", async ({
        page,
    }) => {
        const upload = await createUploadCopy(
            "test-cube.glb",
            "DemoUploadModel.glb",
        );
        const modelListPage = new ModelListPage(page);
        const uploadHistoryPage = new UploadHistoryPage(page);
        const modelViewerPage = new ModelViewerPage(page);

        try {
            await modelListPage.goto();
            await modelListPage.uploadModel(upload.filePath);
            await modelListPage.expectModelVisible("DemoUploadModel");

            await uploadHistoryPage.goto();
            expect(await uploadHistoryPage.hasEntries()).toBe(true);
            await expect(
                page.locator(".history-item-name").first(),
            ).toContainText("DemoUploadModel.glb");

            await uploadHistoryPage.clickOpenModel(0);
            await modelViewerPage.waitForModelLoaded();
        } finally {
            await upload.cleanup();
        }
    });

    test("creates, recycles, and restores a texture set", async ({ page }) => {
        const textureSetsPage = new TextureSetsPage(page);
        const recycledFilesPage = new RecycledFilesPage(page);
        const textureSetName = `Demo Runtime Texture Set ${Date.now()}`;

        await textureSetsPage.goto();
        await textureSetsPage.selectKindTab("Model-Specific");
        await textureSetsPage.createEmptyTextureSet(textureSetName);
        await expect(textureSetsPage.getCardByName(textureSetName)).toBeVisible(
            {
                timeout: 15000,
            },
        );

        await textureSetsPage.openContextMenu(textureSetName);
        await textureSetsPage.selectContextMenuOption("Recycle");
        await expect(
            page.locator(".p-toast-message", {
                hasText: "Texture set moved to recycled files",
            }),
        ).toBeVisible({ timeout: 15000 });

        await recycledFilesPage.goto();
        await expect
            .poll(() => recycledFilesPage.getRecycledTextureSetCount())
            .toBe(1);
        await expect
            .poll(() => recycledFilesPage.getTextureSetName(0))
            .toContain(textureSetName);

        await recycledFilesPage.restoreTextureSet(0);

        await textureSetsPage.goto();
        await textureSetsPage.selectKindTab("Model-Specific");
        await expect(textureSetsPage.getCardByName(textureSetName)).toBeVisible(
            {
                timeout: 15000,
            },
        );
    });

    test("creates a pack and adds a seeded model", async ({ page }) => {
        const packName = `Demo Automation Pack ${Date.now()}`;

        await createPack(page, packName, "Pack created by demo e2e");
        await openPack(page, packName);
        await addModelToOpenPack(page, "Test Cone", 2);

        await expect(
            page.locator(".p-tabview-nav li", { hasText: /^Models: 1$/ }),
        ).toBeVisible();
    });

    test("creates a pack with metadata and uploads a custom thumbnail", async ({
        page,
    }) => {
        const thumbnail = await createUploadCopy(
            "blue_color.png",
            `DemoPackThumb-${Date.now()}.png`,
        );
        const packName = `Demo Metadata Pack ${Date.now()}`;

        try {
            await createPack(
                page,
                packName,
                "Pack metadata coverage in demo mode",
                "CC0",
                "https://example.com/demo-pack",
            );

            const packCard = page
                .locator(".pack-grid-card", { hasText: packName })
                .first();
            await expect(packCard).toContainText("CC0");

            await openPack(page, packName);
            await page
                .locator('.container-rich-side input[type="file"]')
                .first()
                .setInputFiles(thumbnail.filePath);
            await expect(
                page.locator(".container-cover-card img").first(),
            ).toBeVisible({ timeout: 15000 });

            await navigateToTab(page, "packs");
            const reloadedCard = page
                .locator(".pack-grid-card", { hasText: packName })
                .first();
            await expect(reloadedCard).toContainText("CC0");
            await expect(reloadedCard.locator("img")).toBeVisible();
        } finally {
            await thumbnail.cleanup();
        }
    });

    test("creates a project with notes, thumbnail, and concept art", async ({
        page,
    }) => {
        const thumbnail = await createUploadCopy(
            "green_color.png",
            `DemoProjectThumb-${Date.now()}.png`,
        );
        const concept = await createUploadCopy(
            "yellow_color.png",
            `DemoProjectConcept-${Date.now()}.png`,
        );
        const projectName = `Demo Project ${Date.now()}`;
        const notes = "Demo mode keeps project notes and media editable.";

        try {
            await createProject(
                page,
                projectName,
                "Project media coverage in demo mode",
                notes,
            );

            await openProject(page, projectName);
            await expect(page.locator("#project-notes")).toHaveValue(notes);

            await page
                .locator('.container-rich-side input[type="file"]')
                .first()
                .setInputFiles(thumbnail.filePath);
            await expect(
                page.locator(".container-cover-card img").first(),
            ).toBeVisible({ timeout: 15000 });

            await page
                .locator('.container-rich-main input[type="file"][multiple]')
                .first()
                .setInputFiles(concept.filePath);
            await expect(
                page.locator(".container-media-card").first(),
            ).toBeVisible({
                timeout: 15000,
            });

            await navigateToTab(page, "projects");
            const projectCard = page
                .locator(".project-grid-card", { hasText: projectName })
                .first();
            await expect(projectCard).toContainText(notes);
            await expect(projectCard.locator("img")).toBeVisible();
            await expect(
                projectCard.locator(".project-grid-card-stats span").last(),
            ).toContainText("1");
        } finally {
            await thumbnail.cleanup();
            await concept.cleanup();
        }
    });

    test("locks Blender, SSL, and WebDAV settings sections in demo mode", async ({
        page,
    }) => {
        const settingsPage = new SettingsPage(page);

        await settingsPage.navigateToSettings();
        await settingsPage.waitForLoaded();

        const lockedSections = page.locator(".settings-section-header--locked");
        await expect(lockedSections).toHaveCount(3);

        // Verify each locked section shows the notice text
        for (const name of ["Blender Settings", "SSL Certificate", "WebDAV"]) {
            const header = page.locator(".settings-section-header--locked", {
                hasText: name,
            });
            await expect(header).toBeVisible();
            await expect(
                header.locator(".settings-demo-notice"),
            ).toHaveText("Not available in demo mode");
        }

        // Verify clicking a locked section does NOT expand it
        const blenderHeader = page.locator(".settings-section-header--locked", {
            hasText: "Blender Settings",
        });
        await blenderHeader.click();
        // The section content should NOT appear
        const blenderContent = blenderHeader
            .locator("..")
            .locator(".settings-section-content");
        await expect(blenderContent).toHaveCount(0);
    });

    test("shows the demo mode banner with reset and info buttons", async ({ page }) => {
        const modelListPage = new ModelListPage(page);
        await modelListPage.goto();

        const banner = page.getByTestId("demo-banner");
        await expect(banner).toBeVisible();
        await expect(banner).toContainText("Demo Mode");
        await expect(banner).toContainText(
            "data is stored locally in your browser",
        );

        const resetButton = page.getByTestId("demo-banner-reset");
        await expect(resetButton).toBeVisible();
        await expect(resetButton).toContainText("Reset");

        // Info button opens the limitations modal
        const infoButton = page.getByTestId("demo-banner-info");
        await expect(infoButton).toBeVisible();
        await infoButton.click();

        const dialog = page.getByTestId("demo-info-dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("Demo Mode Limitations");
        await expect(dialog).toContainText("Blender Integration");
        await expect(dialog).toContainText("SSL Certificate");
        await expect(dialog).toContainText("WebDAV");

        // Close the modal via the close button
        await dialog.getByRole("button", { name: "Close" }).click();
        await expect(dialog).toBeHidden();
    });

    test("shows a thumbnail for seeded environment maps", async ({ page }) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        await environmentMapsPage.goto();
        await environmentMapsPage.waitForEnvironmentMapByName(
            "City Night Lights",
        );

        // Wait for the generated thumbnail to appear (prewarm is fire-and-forget;
        // on slow CI runners the render can take >30s)
        await expect(
            page
                .locator('[data-testid="environment-map-card-thumbnail"]')
                .first(),
        ).toBeVisible({ timeout: 60000 });
    });

    test("shows a waveform for the seeded Test Tone sound", async ({
        page,
    }) => {
        const soundListPage = new SoundListPage(page);
        await soundListPage.goto();

        await expect(
            soundListPage.getSoundCardByName("Test Tone"),
        ).toBeVisible();

        // Wait for the waveform image to appear (prewarm is fire-and-forget;
        // on slow CI runners the audio decode + canvas render can take >30s)
        const soundCard = soundListPage.getSoundCardByName("Test Tone");
        await expect(soundCard.locator("img.sound-waveform")).toBeVisible({
            timeout: 60000,
        });
    });

    test("shows waveform after uploading a new sound without refresh", async ({
        page,
    }) => {
        const upload = await createUploadCopy(
            "test-tone.wav",
            `DemoUploadSound-${Date.now()}.wav`,
        );
        const soundListPage = new SoundListPage(page);

        try {
            await soundListPage.goto();
            await soundListPage.uploadSound(upload.filePath);
            await soundListPage.waitForSoundByName("DemoUploadSound", 15000);

            // The waveform should appear automatically (generated during upload handler)
            const uploadedCard =
                soundListPage.getSoundCardByName("DemoUploadSound");
            await expect(
                uploadedCard.locator("img.sound-waveform"),
            ).toBeVisible({ timeout: 60000 });
        } finally {
            await upload.cleanup();
        }
    });
});
