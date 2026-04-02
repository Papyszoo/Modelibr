/**
 * Step definitions for Embedded Materials Preset E2E tests.
 *
 * Tests the built-in "__embedded__" preset that preserves original
 * model PBR materials without applying texture sets.
 */
import { createBdd } from "playwright-bdd";
import { ModelViewerPage } from "../pages/ModelViewerPage";

const { Then } = createBdd();

Then('the "Link Texture Set" buttons should be hidden', async ({ page }) => {
    const viewer = new ModelViewerPage(page);
    await viewer.expectLinkTextureSetHidden();
});

Then('the "Link Texture Set" buttons should be visible', async ({ page }) => {
    const viewer = new ModelViewerPage(page);
    await viewer.expectLinkTextureSetVisible();
});

Then(
    'all unlinked materials should show "Embedded" indicator',
    async ({ page }) => {
        const viewer = new ModelViewerPage(page);
        await viewer.expectMaterialShowsEmbedded();
    },
);
