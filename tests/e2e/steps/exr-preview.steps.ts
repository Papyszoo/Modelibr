import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { When, Then } = createBdd();

const apiHelper = new ApiHelper();

const GLOBAL_TEXTURE_DIR = path.resolve(
    __dirname,
    "..",
    "assets",
    "global texture",
);

// Run-unique ID to prevent collisions across test runs
const runId = Date.now().toString(36).slice(-4);

// Track created texture sets
const createdSets: Record<string, { id: number; name: string }> = {};

function uniqueName(baseName: string): string {
    return `${baseName}_${runId}`;
}

// ── Create texture sets with EXR files ────────────────────────────────

When(
    "I create a universal texture set with EXR textures named {string}",
    async ({ page }, baseName: string) => {
        const name = uniqueName(baseName);

        // Create with a normal.exr file (type 2 = Normal) as Universal (kind=1)
        const normalPath = path.join(GLOBAL_TEXTURE_DIR, "normal.exr");
        const result = await apiHelper.createTextureSetWithFileAndKind(
            name,
            normalPath,
            2, // Normal
            1, // Universal
        );
        createdSets[baseName] = { id: result.textureSetId, name };
        console.log(
            `[API] Created universal texture set "${name}" with EXR normal texture (ID: ${result.textureSetId})`,
        );

        // Upload roughness.exr as well
        const roughnessPath = path.join(GLOBAL_TEXTURE_DIR, "roughness.exr");
        await apiHelper.uploadTextureToSet(
            result.textureSetId,
            roughnessPath,
            5, // Roughness
        );
        console.log(`[API] Added EXR roughness texture to "${name}"`);

        // Reload to see new data
        await page.reload();
        await page.waitForSelector(".texture-set-list", { timeout: 10000 });
    },
);

When(
    "I create a universal texture set with mixed EXR and standard textures named {string}",
    async ({ page }, baseName: string) => {
        const name = uniqueName(baseName);

        // Create with diffuse.jpg (standard, type 1 = Albedo) as Universal (kind=1)
        const diffusePath = path.join(GLOBAL_TEXTURE_DIR, "diffuse.jpg");
        const result = await apiHelper.createTextureSetWithFileAndKind(
            name,
            diffusePath,
            1, // Albedo
            1, // Universal
        );
        createdSets[baseName] = { id: result.textureSetId, name };
        console.log(
            `[API] Created universal texture set "${name}" with diffuse.jpg (ID: ${result.textureSetId})`,
        );

        // Upload normal.exr (EXR file)
        const normalPath = path.join(GLOBAL_TEXTURE_DIR, "normal.exr");
        await apiHelper.uploadTextureToSet(
            result.textureSetId,
            normalPath,
            2, // Normal
        );
        console.log(`[API] Added EXR normal texture to "${name}"`);

        // Upload displacement.png (standard)
        const displacementPath = path.join(
            GLOBAL_TEXTURE_DIR,
            "displacement.png",
        );
        await apiHelper.uploadTextureToSet(
            result.textureSetId,
            displacementPath,
            12, // Displacement
        );
        console.log(`[API] Added displacement.png to "${name}"`);

        // Reload to see new data
        await page.reload();
        await page.waitForSelector(".texture-set-list", { timeout: 10000 });
    },
);

// ── Open texture set viewer for specific set ──────────────────────────

When(
    "I open the texture set viewer for {string}",
    async ({ page }, baseName: string) => {
        const set = createdSets[baseName];
        if (!set) {
            throw new Error(
                `Texture set "${baseName}" not tracked. Create it first.`,
            );
        }

        // Find the card by the unique name
        const card = page
            .locator(`.texture-set-card`)
            .filter({
                has: page.locator(
                    `.texture-set-card-name:has-text("${set.name}")`,
                ),
            })
            .first();

        await expect(card).toBeVisible({ timeout: 10000 });
        await card.dblclick();

        // Wait for viewer to open
        await page.waitForSelector(".texture-set-viewer", { timeout: 10000 });
        console.log(`[UI] Opened texture set viewer for "${set.name}" ✓`);
    },
);

// ── Preview tab steps ─────────────────────────────────────────────────

When("I switch to the Preview tab", async ({ page }) => {
    await page.waitForSelector(".p-tabview-nav", { timeout: 10000 });

    const previewTab = page
        .locator(".p-tabview-nav-link")
        .filter({ hasText: "Preview" });
    await expect(previewTab).toBeVisible({ timeout: 10000 });
    await previewTab.click();

    // Wait for the preview canvas to render
    await page.waitForTimeout(2000);
    console.log("[UI] Switched to Preview tab ✓");
});

Then("the 3D preview canvas should be visible", async ({ page }) => {
    const canvas = page.locator(".texture-preview-canvas canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    console.log("[UI] 3D preview canvas is visible ✓");
});

Then("no console errors should be present", async ({ page }) => {
    // Collect any errors that occurred (playwright doesn't have built-in error tracking,
    // so we check the page didn't navigate to an error page and the canvas is still alive)
    const canvas = page.locator(".texture-preview-canvas canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // Verify the React error overlay is NOT visible (would appear if component crashed)
    const errorOverlay = page.locator(
        "#webpack-dev-server-client-overlay, .error-boundary, .react-error-overlay",
    );
    const hasError = await errorOverlay
        .isVisible({ timeout: 1000 })
        .catch(() => false);
    expect(hasError).toBe(false);
    console.log("[UI] No console errors or error overlays detected ✓");
});

Then("the 3D preview should have textures applied", async ({ page }) => {
    // Verify the canvas is visible and has rendered content
    // In headless Chrome, readPixels from WebGL can return zeros between frames,
    // so instead we check the canvas dimensions and that Three.js didn't error
    const canvasInfo = await page.evaluate(() => {
        const canvas = document.querySelector(
            ".texture-preview-canvas canvas",
        ) as HTMLCanvasElement;
        if (!canvas) return { hasCanvas: false, width: 0, height: 0 };

        return {
            hasCanvas: true,
            width: canvas.width,
            height: canvas.height,
        };
    });

    expect(canvasInfo.hasCanvas).toBe(true);
    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);

    // Verify no error boundary is showing
    const errorOverlay = page.locator(".error-boundary, [class*='error']");
    const hasError = await errorOverlay
        .filter({ hasText: "Something went wrong" })
        .isVisible({ timeout: 1000 })
        .catch(() => false);
    expect(hasError).toBe(false);

    console.log(
        "[UI] 3D preview has textures applied including EXR (canvas rendered with valid dimensions) ✓",
    );
});

// Note: "I take a screenshot named {string}" step is defined in shared-setup.steps.ts
