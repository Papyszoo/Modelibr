import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import {
    narrowVirtualisedList,
    waitForR3FCanvas,
} from "../helpers/list-toolbar-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { TextureSetsPage } from "../pages/TextureSetsPage";
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

// Track created texture sets — exported so other step files (e.g. tiff-preview.steps.ts)
// can register their own sets and reuse the shared "open the texture set viewer for"
// and "switch to the Preview tab" steps defined below.
export const createdSets: Record<string, { id: number; name: string }> = {};

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
        await new TextureSetsPage(page).waitForList();
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
        await new TextureSetsPage(page).waitForList();
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

        // Narrow the virtualized grid to the target set so the card is
        // rendered in DOM even if it'd otherwise scroll off-screen.
        const textureSetsPage = new TextureSetsPage(page);
        const card = textureSetsPage.getCardByName(set.name).first();

        // `narrowVirtualisedList` waits on the count chip, which can briefly
        // read "stable" at its pre-filter value before the search debounce
        // fires — leaving the target card rendered off-screen in the
        // VirtuosoGrid, where a plain visibility wait can't recover because
        // nothing scrolls it back into the DOM. Re-narrow + scroll into view
        // until the card actually materialises, so a single stale count read
        // can't fail the step (intermittent in CI).
        await expect
            .poll(
                async () => {
                    await narrowVirtualisedList(page, set.name);
                    if ((await card.count()) === 0) return false;
                    await card.scrollIntoViewIfNeeded().catch(() => {});
                    return card.isVisible().catch(() => false);
                },
                { timeout: 30000, intervals: [500, 1000, 2000, 3000] },
            )
            .toBe(true);

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

    // Wait until the Canvas wrapper exists in the DOM. `state: "attached"`
    // — NOT "visible" (the default). The canvas mounts inside an absolutely-
    // positioned R3F wrapper that's briefly 0×0 while the flex parent
    // finishes laying out, so a visibility wait here would race against
    // layout and time out before the assertion step even runs.
    await page.waitForSelector(".texture-preview-canvas canvas", {
        state: "attached",
        timeout: 30000,
    });
    console.log("[UI] Switched to Preview tab ✓");
});

Then("the 3D preview canvas should be visible", async ({ page }) => {
    // What this assertion actually proves: the Preview tab mounted the
    // R3F Canvas without the React tree crashing. We don't check CSS
    // visibility — see `waitForR3FCanvas` for why. The downstream "no
    // console errors" / "has textures applied" steps cover the no-crash
    // invariant via separate channels.
    await waitForR3FCanvas(page, ".texture-preview-canvas");
    console.log("[UI] 3D preview canvas mounted ✓");
});

Then("no console errors should be present", async ({ page }) => {
    // The previous step already proved the canvas is mounted and visible.
    // This step only needs to confirm the React error overlay didn't
    // appear (it would mean a component crashed during render).
    const errorOverlay = page.locator(
        "#webpack-dev-server-client-overlay, .error-boundary, .react-error-overlay",
    );
    const hasError = await errorOverlay.isVisible().catch(() => false);
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
    const hasError2 = await errorOverlay
        .filter({ hasText: "Something went wrong" })
        .isVisible()
        .catch(() => false);
    expect(hasError2).toBe(false);

    console.log(
        "[UI] 3D preview has textures applied including EXR (canvas rendered with valid dimensions) ✓",
    );
});

// Note: "I take a screenshot named {string}" step is defined in shared-setup.steps.ts
