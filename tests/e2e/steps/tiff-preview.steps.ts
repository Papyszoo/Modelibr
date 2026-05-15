import { createBdd } from "playwright-bdd";
import { ApiHelper } from "../helpers/api-helper";
import { TextureSetsPage } from "../pages/TextureSetsPage";
import { createdSets } from "./exr-preview.steps";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { When } = createBdd();

const apiHelper = new ApiHelper();

const ASSETS_DIR = path.resolve(__dirname, "..", "assets");
const GLOBAL_TEXTURE_DIR = path.join(ASSETS_DIR, "global texture");
const TIFF_PATH = path.join(ASSETS_DIR, "greenGradient.tif");

// Run-unique ID to prevent collisions across test runs
const runId = Date.now().toString(36).slice(-4);

function uniqueName(baseName: string): string {
    return `${baseName}_${runId}`;
}

// ── Create texture sets with TIFF files ───────────────────────────────
//
// Shares the `createdSets` registry exported from exr-preview.steps.ts so
// the existing "I open the texture set viewer for {string}" step (defined
// there) can resolve TIFF-created sets too.

When(
    "I create a universal texture set with a TIFF texture named {string}",
    async ({ page }, baseName: string) => {
        const name = uniqueName(baseName);

        // greenGradient.tif as Albedo (type 1) on a Universal set (kind=1)
        const result = await apiHelper.createTextureSetWithFileAndKind(
            name,
            TIFF_PATH,
            1, // Albedo
            1, // Universal
        );
        createdSets[baseName] = { id: result.textureSetId, name };
        console.log(
            `[API] Created universal texture set "${name}" with TIFF albedo (ID: ${result.textureSetId})`,
        );

        // Reload so the list reflects the new set
        await page.reload();
        await new TextureSetsPage(page).waitForList();
    },
);

When(
    "I create a universal texture set with mixed TIFF and standard textures named {string}",
    async ({ page }, baseName: string) => {
        const name = uniqueName(baseName);

        // Start with diffuse.jpg (Albedo) on a Universal set (kind=1)
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

        // Add the TIFF as Roughness so the TIFF loader rides alongside the JPG loader
        await apiHelper.uploadTextureToSet(
            result.textureSetId,
            TIFF_PATH,
            5, // Roughness
        );
        console.log(`[API] Added TIFF roughness texture to "${name}"`);

        // Add a PNG displacement to round out the mix
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

        await page.reload();
        await new TextureSetsPage(page).waitForList();
    },
);
