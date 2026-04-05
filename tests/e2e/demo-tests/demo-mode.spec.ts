import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { test, expect, type Page } from "@playwright/test";

import { navigateToTab, openTabViaMenu } from "../helpers/navigation-helper";
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

async function createPack(page, name, description) {
    await navigateToTab(page, "packs");

    await page.getByRole("button", { name: "Create Pack" }).click();

    const dialog = page.locator('.p-dialog:has-text("Create New Pack")');
    await expect(dialog).toBeVisible();

    await dialog.locator("#pack-name").fill(name);
    await dialog.locator("#pack-description").fill(description);
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
        const textureSetsPage = new TextureSetsPage(page);
        const spriteListPage = new SpriteListPage(page);
        const soundListPage = new SoundListPage(page);

        await modelListPage.goto();
        await expect(page.getByText("Test Cube").first()).toBeVisible();
        await expect(page.getByText("Test Torus").first()).toBeVisible();

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
        await expect(
            page.locator(".pack-grid-card", { hasText: "Demo Pack" }).first(),
        ).toBeVisible();
        await expect(
            page.locator(".pack-grid-card", { hasText: "Shapes Pack" }).first(),
        ).toBeVisible();

        await navigateToTab(page, "projects");
        await expect(
            page
                .locator(".project-grid-card", { hasText: "Demo Project" })
                .first(),
        ).toBeVisible();

        await spriteListPage.goto();
        expect(await spriteListPage.getSpriteCount()).toBeGreaterThanOrEqual(1);
        expect(await spriteListPage.spriteExists("Demo Sprite")).toBe(true);

        await soundListPage.goto();
        expect(await soundListPage.soundExists("Test Tone")).toBe(true);
        await soundListPage.clickSoundByName("Test Tone");
        await expect(page.locator(".p-dialog")).toContainText("Test Tone");
        await soundListPage.closeDialog();
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

        await textureSetsPage.recycleTextureSet(textureSetName);

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

    test("shows the demo-only Blender settings restriction", async ({
        page,
    }) => {
        const settingsPage = new SettingsPage(page);

        await settingsPage.navigateToSettings();
        await settingsPage.waitForLoaded();

        await expect(page.locator(".settings-demo-warning")).toHaveText(
            "Blender settings are not available in demo mode.",
        );
    });
});
