import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import {
    AssetStorePage,
    STORE_FIXTURE_EMAIL,
    STORE_FIXTURE_PASSWORD,
} from "../pages/AssetStorePage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const STORE_ASSET_ID = "e2e-props-pack";

Given("I am on the Asset Store tab", async ({ page }) => {
    const storePage = new AssetStorePage(page);
    await storePage.navigateTo();
});

When("I sign in to the asset store", async ({ page }) => {
    const storePage = new AssetStorePage(page);
    await storePage.signIn(STORE_FIXTURE_EMAIL, STORE_FIXTURE_PASSWORD);
});

Then("my store library shows {string}", async ({ page }, title: string) => {
    const storePage = new AssetStorePage(page);
    const tile = storePage.libraryTile(STORE_ASSET_ID);
    await expect(tile).toBeVisible({ timeout: 15000 });
    await expect(tile).toContainText(title);
});

When(
    "I import {string} from the store library",
    async ({ page }, assetId: string) => {
        const storePage = new AssetStorePage(page);
        await storePage.importAsset(assetId);
    },
);

Then(
    "the store import completes with an option to open the pack",
    async ({ page }) => {
        const storePage = new AssetStorePage(page);
        // The backend job downloads the manifest + files from the fixture and
        // replays them through the upload handlers; generous timeout absorbs a
        // cold thumbnail-queue/db moment, not a render (nothing waits on GPU).
        await expect(
            storePage.openInLibraryButton(STORE_ASSET_ID),
        ).toBeVisible({ timeout: 60000 });
        console.log("[Assert] Import completed — open-in-library offered");
    },
);

Then(
    "opening the imported pack shows the pack viewer for {string}",
    async ({ page }, packName: string) => {
        const storePage = new AssetStorePage(page);
        await storePage.openInLibraryButton(STORE_ASSET_ID).click();
        // PackViewer (ContainerViewer) header shows the pack name.
        await expect(
            page.locator(`.container-viewer :text("${packName}")`).first(),
        ).toBeVisible({ timeout: 15000 });
        console.log(`[Assert] Pack viewer opened for "${packName}"`);
    },
);

Then(
    "the imported pack {string} contains the model {string} with store provenance",
    async ({ page }, packName: string, modelName: string) => {
        // API-level assert: the pack exists, carries provenance pointing at
        // the fixture store, and really contains the imported model.
        const packsResponse = await page.request.get(`${API_BASE}/packs`);
        expect(packsResponse.ok()).toBe(true);
        const { packs } = await packsResponse.json();
        const pack = (packs || []).find(
            (p: { name: string }) => p.name === packName,
        );
        expect(pack, `pack "${packName}" should exist`).toBeTruthy();
        expect(pack.storeImportAssetId).toBe(STORE_ASSET_ID);
        expect(pack.storeImportUrl).toContain("localhost:9280");
        expect(pack.modelCount).toBe(1);

        const detailResponse = await page.request.get(
            `${API_BASE}/packs/${pack.id}`,
        );
        expect(detailResponse.ok()).toBe(true);
        const detail = await detailResponse.json();
        const modelNames = (detail.models || []).map(
            (m: { name: string }) => m.name,
        );
        expect(modelNames).toContain(modelName);

        getScenarioState(page).setCustom("importedPackId", pack.id);
        console.log(
            `[Assert] Pack ${pack.id} has provenance + model "${modelName}"`,
        );
    },
);
