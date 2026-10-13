import { createBdd } from "playwright-bdd";
import { expect, type Request } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import {
    AssetStorePage,
    STORE_FIXTURE_EMAIL,
    STORE_FIXTURE_PASSWORD,
} from "../pages/AssetStorePage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const STORE_ASSET_ID = "e2e-props-pack";

// Fixture values (tests/e2e/fixtures/store-fixture/server.mjs). The free pack
// and the texture pack are Guid-keyed and anonymous - what the signed-out UI
// browses - while the legacy browser pack is account-scoped.
const FREE_STORE_ASSET_ID = "2d3c4b5a-6e7f-4890-9a1b-2c3d4e5f6a7b";
const TEXTURE_STORE_ASSET_ID = "6f1e2d3c-4b5a-6978-8c9d-0e1f2a3b4c5d";

const MINT_REQUESTS_KEY = "asset-store:mint-requests";
const IMPORTED_TEXTURE_SET_KEY = "asset-store:imported-texture-set";

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
    "I open {string} from the store library",
    async ({ page }, assetId: string) => {
        const storePage = new AssetStorePage(page);
        await storePage.openPackDetail(assetId);
    },
);

// Regression: the row and its checkbox both toggled selection, so a click on
// the checkbox toggled twice (bubbling to the row) and the checkbox looked
// dead. The previous suite only imported the default all-selected set, so it
// never clicked one.
Then(
    "clicking an item's checkbox deselects and reselects that item",
    async ({ page }) => {
        const storePage = new AssetStorePage(page);
        const checkbox = storePage.itemCheckbox(0);
        await expect(checkbox).toBeChecked();

        await checkbox.click();
        await expect(checkbox).not.toBeChecked();
        // Nothing selected - importing is not offered.
        await expect(storePage.importSelectedButton()).toBeDisabled();

        await checkbox.click();
        await expect(checkbox).toBeChecked();
        await expect(storePage.importSelectedButton()).toBeEnabled();
        console.log("[Assert] Item checkbox toggles selection exactly once");
    },
);

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
        await expect(storePage.openInLibraryButton()).toBeVisible({
            timeout: 60000,
        });
        console.log("[Assert] Import completed - open-in-library offered");
    },
);

Then(
    "opening the imported pack shows the pack viewer for {string}",
    async ({ page }, packName: string) => {
        const storePage = new AssetStorePage(page);
        await storePage.openInLibraryButton().click();
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

Then(
    "the imported model {string} is filed under the {string} model category",
    async ({ page }, modelName: string, categoryName: string) => {
        // The fixture manifest carries metadataJson {"category": "Props"} on the
        // item; the importer must find-or-create that model category and assign
        // the created model to it (taxonomy v1 integration contract).
        const categoriesResponse = await page.request.get(
            `${API_BASE}/model-categories`,
        );
        expect(categoriesResponse.ok()).toBe(true);
        const { categories } = await categoriesResponse.json();
        const category = (categories || []).find(
            (c: { name: string }) => c.name === categoryName,
        );
        expect(
            category,
            `model category "${categoryName}" should exist after import`,
        ).toBeTruthy();

        const modelsResponse = await page.request.get(`${API_BASE}/models`);
        expect(modelsResponse.ok()).toBe(true);
        // Unpaginated /models returns a flat array (backward-compat shape).
        const models = await modelsResponse.json();
        const model = (models || []).find(
            (m: { name: string }) => m.name === modelName,
        );
        expect(model, `model "${modelName}" should exist`).toBeTruthy();
        expect(model.categoryId).toBe(category.id);
        console.log(
            `[Assert] Model "${modelName}" is in category "${categoryName}" (id ${category.id})`,
        );
    },
);

// ── Signed-out browsing and free-pack import ─────────────────────────────

Given(
    "I am on the Asset Store tab without a store session",
    async ({ page }) => {
        const storePage = new AssetStorePage(page);
        await storePage.navigateTo();
        // A fresh browser context has no persisted store session, and the page
        // must render the catalog browse surface (the sign-in action available,
        // not forced).
        await expect(storePage.signInButton).toBeVisible({ timeout: 15000 });
    },
);

Then(
    "the store catalog shows {string} without a sign-in form",
    async ({ page }, title: string) => {
        const storePage = new AssetStorePage(page);
        // The catalog is fetched anonymously: no /api/library call is made and
        // the login form must not take over the page.
        await expect(
            page.locator(`[data-store-asset-id]`, { hasText: title }).first(),
        ).toBeVisible({ timeout: 15000 });
        await expect(storePage.loginForm).toBeHidden();
        console.log(`[Assert] Catalog shows "${title}" while signed out`);
    },
);

When(
    "I open {string} from the store catalog",
    async ({ page }, assetId: string) => {
        const storePage = new AssetStorePage(page);
        await storePage.openPackDetail(assetId);
    },
);

When(
    "I import {string} from the store catalog without signing in",
    async ({ page }, assetId: string) => {
        const storePage = new AssetStorePage(page);

        // Capture store-side token mints for the whole action. startImport
        // awaits the mint (if any) BEFORE posting the job, so by the time the
        // local POST is observed, a mint would have been observed too.
        const mintRequests: string[] = [];
        const onRequest = (request: Request) => {
            if (request.url().includes("/import-token")) {
                mintRequests.push(request.url());
            }
        };
        page.on("request", onRequest);
        const importStarted = page.waitForRequest(
            (request) =>
                request.url().includes("/store-imports") &&
                request.method() === "POST",
        );

        await storePage.importAsset(assetId);

        await importStarted;
        page.off("request", onRequest);
        getScenarioState(page).setCustom(MINT_REQUESTS_KEY, mintRequests);
        console.log("[Action] Started a signed-out import from the catalog");
    },
);

Then("no store import token was minted", async ({ page }) => {
    const mintRequests =
        getScenarioState(page).getCustom<string[]>(MINT_REQUESTS_KEY) ?? [];
    expect(
        mintRequests,
        `an anonymous import must not mint a store token: ${mintRequests.join(", ")}`,
    ).toHaveLength(0);
});

Then(
    "the imported store pack {string} contains the model {string}",
    async ({ page }, packName: string, modelName: string) => {
        // API-level assert: the pack exists with fixture provenance and really
        // contains the imported model.
        const packsResponse = await page.request.get(`${API_BASE}/packs`);
        expect(packsResponse.ok()).toBe(true);
        const { packs } = await packsResponse.json();
        const pack = (packs || []).find(
            (p: { name: string }) => p.name === packName,
        );
        expect(pack, `pack "${packName}" should exist`).toBeTruthy();
        expect(pack.storeImportAssetId).toBe(FREE_STORE_ASSET_ID);
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
        console.log(
            `[Assert] Signed-out import produced pack ${pack.id} with "${modelName}"`,
        );
    },
);

Then(
    "the imported texture pack {string} contains the texture set {string}",
    async ({ page }, packName: string, setName: string) => {
        const packsResponse = await page.request.get(`${API_BASE}/packs`);
        expect(packsResponse.ok()).toBe(true);
        const { packs } = await packsResponse.json();
        const pack = (packs || []).find(
            (p: { name: string }) => p.name === packName,
        );
        expect(pack, `pack "${packName}" should exist`).toBeTruthy();
        expect(pack.storeImportAssetId).toBe(TEXTURE_STORE_ASSET_ID);
        expect(pack.storeImportUrl).toContain("localhost:9280");

        const detailResponse = await page.request.get(
            `${API_BASE}/packs/${pack.id}`,
        );
        expect(detailResponse.ok()).toBe(true);
        const detail = await detailResponse.json();
        const textureSet = (detail.textureSets || []).find(
            (ts: { name: string }) => ts.name === setName,
        );
        expect(
            textureSet,
            `pack ${pack.id} should contain texture set "${setName}"`,
        ).toBeTruthy();
        getScenarioState(page).setCustom(IMPORTED_TEXTURE_SET_KEY, textureSet.id);
        console.log(
            `[Assert] Texture pack produced texture set ${textureSet.id} "${setName}"`,
        );
    },
);

Then(
    "the texture set {string} holds the maps {string}, {string} and {string} in the {string} category",
    async (
        { page },
        setName: string,
        mapA: string,
        mapB: string,
        mapC: string,
        categoryName: string,
    ) => {
        // The regression this pins: KTX2 and WebP maps were rejected as "not a
        // texture", so the set was created empty/failed and never carried its
        // store category. The set must hold all three maps AND be filed under
        // the manifest's category.
        const setId =
            getScenarioState(page).getCustom<number>(IMPORTED_TEXTURE_SET_KEY);
        expect(setId, "no texture set id was captured").toBeTruthy();

        const response = await page.request.get(
            `${API_BASE}/texture-sets/${setId}`,
        );
        expect(
            response.ok(),
            `texture set ${setId} could not be read: ${response.status()}`,
        ).toBe(true);
        const textureSet = await response.json();
        expect(textureSet.name).toBe(setName);

        const fileNames = (textureSet.textures || []).map(
            (t: { fileName: string }) => t.fileName,
        );
        expect(fileNames).toContain(mapA);
        expect(fileNames).toContain(mapB);
        expect(fileNames).toContain(mapC);

        const category = textureSet.category;
        expect(
            category?.name,
            `texture set ${setId} should be filed under "${categoryName}"`,
        ).toBe(categoryName);

        // KTX2 has no browser/backend preview decoder: the preview endpoint
        // must answer "no preview" (404) rather than failing the import or the
        // request. This is the graceful-degradation contract.
        const ktx2 = (textureSet.textures || []).find(
            (t: { fileName: string }) => t.fileName === mapA,
        );
        expect(ktx2, `no texture for ${mapA}`).toBeTruthy();
        const previewResponse = await page.request.get(
            `${API_BASE}/files/${ktx2.fileId}/preview`,
        );
        expect(previewResponse.status()).toBe(404);

        console.log(
            `[Assert] Texture set ${setId} holds ${mapA}, ${mapB}, ${mapC} in "${categoryName}"`,
        );
    },
);
