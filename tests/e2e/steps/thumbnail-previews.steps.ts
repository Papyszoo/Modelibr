/**
 * Step definitions for Thumbnail Preview E2E tests
 *
 * Tests that:
 * - Thumbnail previews are auto-generated on file upload
 * - Per-channel previews (R, G, B) are generated for texture files
 * - Sprites get RGB thumbnails
 * - All UI preview surfaces use thumbnails (preview endpoint) rather than raw files
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { TextureSetsPage } from "../pages/TextureSetsPage";
import { SpriteListPage } from "../pages/SpriteListPage";

const { Given, When, Then } = createBdd();
const apiHelper = new ApiHelper();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// Track uploaded file IDs for assertions
let lastUploadedFileId: number | null = null;
let lastTextureSetId: number | null = null;
let lastTextureSetName: string | null = null;
let lastSpriteId: number | null = null;
let lastSpriteName: string | null = null;
let lastSpriteFileId: number | null = null;

// Unique suffix to avoid name collisions across test runs
const runId = Date.now().toString(36).slice(-4);
let testCounter = 0;

// ============= API-level steps =============

Given("I upload a texture PNG file via API", async () => {
    const filePath = await UniqueFileGenerator.generate("texture.png");
    const result = await apiHelper.uploadFile(filePath);
    lastUploadedFileId = result.fileId;
    expect(lastUploadedFileId).toBeGreaterThan(0);
});

Given("I upload a texture EXR file via API", async () => {
    // Use existing EXR test asset from the global texture directory
    const filePath = await UniqueFileGenerator.generate(
        "global texture/roughness.exr",
    );
    const result = await apiHelper.uploadFile(filePath);
    lastUploadedFileId = result.fileId;
    expect(lastUploadedFileId).toBeGreaterThan(0);
});

Given("I upload a sprite PNG file via API", async () => {
    const name = `thumb-sprite-${runId}`;
    const filePath = await UniqueFileGenerator.generate("red_color.png");
    const result = await apiHelper.createSprite(filePath, name);
    lastSpriteFileId = result.fileId;
    lastSpriteId = result.id;
    lastSpriteName = name;
    expect(lastSpriteFileId).toBeGreaterThan(0);
});

Then("the file should have an RGB preview available via API", async () => {
    expect(lastUploadedFileId).not.toBeNull();
    const preview = await apiHelper.getFilePreview(lastUploadedFileId!);
    expect(preview.status).toBe(200);
});

Then("the preview should be a PNG image", async () => {
    expect(lastUploadedFileId).not.toBeNull();
    const preview = await apiHelper.getFilePreview(lastUploadedFileId!);
    expect(preview.status).toBe(200);
    expect(preview.contentType).toContain("image/png");
});

Then(
    "the file should have a {string} channel preview available via API",
    async ({}, channel: string) => {
        expect(lastUploadedFileId).not.toBeNull();
        const preview = await apiHelper.getFilePreview(
            lastUploadedFileId!,
            channel,
        );
        expect(preview.status).toBe(200);
        expect(preview.contentType).toContain("image/png");
    },
);

Then(
    "the sprite file should have an RGB preview available via API",
    async () => {
        expect(lastSpriteFileId).not.toBeNull();
        const preview = await apiHelper.getFilePreview(lastSpriteFileId!);
        expect(preview.status).toBe(200);
        expect(preview.contentType).toContain("image/png");
    },
);

// ============= UI-level setup steps =============

Given("I have a texture set with an uploaded texture", async () => {
    testCounter++;
    const name = `thumb-ts-${runId}-${testCounter}`;
    const filePath = await UniqueFileGenerator.generate("texture.png");
    const result = await apiHelper.createTextureSetWithFile(
        name,
        filePath,
        1, // Albedo
    );
    lastTextureSetId = result.textureSetId;
    lastTextureSetName = name;
});

Given("I have a sprite with an uploaded image", async () => {
    if (!lastSpriteId || !lastSpriteName) {
        testCounter++;
        const name = `thumb-sprite-ui-${runId}-${testCounter}`;
        const filePath = await UniqueFileGenerator.generate("red_color.png");
        const result = await apiHelper.createSprite(filePath, name);
        lastSpriteId = result.id;
        lastSpriteName = name;
        lastSpriteFileId = result.fileId;
    }
});

// ============= UI navigation steps =============

/** After navigating to texture sets page, switch to Model-Specific tab
 *  (the default is Global Materials, but our API creates Model-Specific sets)
 *  Optionally searches for a specific card name to handle pagination (>50 sets). */
async function switchToModelSpecificKind(page: any, searchText?: string) {
    const modelSpecificBtn = page.locator(".kind-filter-select button").filter({
        hasText: "Model-Specific",
    });
    await expect(modelSpecificBtn).toBeVisible({ timeout: 5000 });
    const isActive = await modelSpecificBtn.evaluate((el: Element) =>
        el.classList.contains("p-highlight"),
    );
    if (!isActive) {
        await modelSpecificBtn.click();
    }
    // Wait for the query to settle
    await page.waitForTimeout(500);
    // If a search text is provided, filter the grid so the card appears on the first page
    if (searchText) {
        const searchInput = page.locator(".search-input");
        if (await searchInput.isVisible({ timeout: 3000 })) {
            await searchInput.clear();
            await searchInput.fill(searchText);
            await page.waitForTimeout(500);
        }
    }
}

When(
    "I navigate to the texture sets page for thumbnail test",
    async ({ page }) => {
        const textureSetsPage = new TextureSetsPage(page);
        await textureSetsPage.goto();
        await switchToModelSpecificKind(page, lastTextureSetName ?? undefined);
    },
);

When("I open the texture set detail viewer", async ({ page }) => {
    expect(lastTextureSetName).not.toBeNull();

    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.goto();
    await switchToModelSpecificKind(page, lastTextureSetName!);

    // Click the texture set card with the right name
    const card = page.locator(".texture-set-card").filter({
        hasText: lastTextureSetName!,
    });
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    // Wait for the detail viewer to appear
    await page.waitForSelector(".texture-set-viewer", { timeout: 10000 });
});

// "I switch to the Files tab" is defined in texture-types.steps.ts — reused here

When("I navigate to the sprites page for thumbnail test", async ({ page }) => {
    const spritesPage = new SpriteListPage(page);
    await spritesPage.goto();
});

// ============= UI assertion steps =============

Then(
    "the texture set card should display a preview image from the preview endpoint",
    async ({ page }) => {
        expect(lastTextureSetName).not.toBeNull();

        const textureSetsPage = new TextureSetsPage(page);
        await textureSetsPage.goto();
        await switchToModelSpecificKind(page, lastTextureSetName!);

        // Find the card with our texture set name (search has already filtered the grid)
        const card = page.locator(".texture-set-card").filter({
            hasText: lastTextureSetName!,
        });
        await expect(card).toBeVisible({ timeout: 10000 });

        // Get the image inside the card
        const img = card.locator("img").first();
        await expect(img).toBeVisible({ timeout: 10000 });

        // Verify the img src contains the preview endpoint
        const src = await img.getAttribute("src");
        expect(src).not.toBeNull();
        expect(src).toContain("/preview");
    },
);

Then(
    "the texture type card should display a preview image from the preview endpoint",
    async ({ page }) => {
        // The Texture Types tab should be active by default
        // Find a texture card with a preview image
        const textureCard = page.locator(".texture-card-with-preview").first();
        await expect(textureCard).toBeVisible({ timeout: 10000 });

        // The preview image should use the preview endpoint
        const img = textureCard.locator("img").first();
        await expect(img).toBeVisible({ timeout: 5000 });

        const src = await img.getAttribute("src");
        expect(src).not.toBeNull();
        expect(src).toContain("/preview");
    },
);

Then(
    "the file preview should display an image from the preview endpoint",
    async ({ page }) => {
        // In the Files tab, find the file preview image
        const filePreview = page.locator(".file-preview img").first();
        await expect(filePreview).toBeVisible({ timeout: 10000 });

        const src = await filePreview.getAttribute("src");
        expect(src).not.toBeNull();
        expect(src).toContain("/preview");
    },
);

Then(
    "the sprite card should display a preview image from the preview endpoint",
    async ({ page }) => {
        expect(lastSpriteName).not.toBeNull();

        // Find the card with our sprite name
        const card = page.locator(".sprite-card").filter({
            hasText: lastSpriteName!,
        });
        await expect(card).toBeVisible({ timeout: 10000 });

        // Get the image inside the sprite preview
        const img = card.locator(".sprite-preview img").first();
        await expect(img).toBeVisible({ timeout: 10000 });

        const src = await img.getAttribute("src");
        expect(src).not.toBeNull();
        expect(src).toContain("/preview");
    },
);
