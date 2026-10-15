import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { connectMcp, McpClient } from "../helpers/mcp-client";
import {
    AssetStorePage,
    STORE_FIXTURE_EMAIL,
} from "../pages/AssetStorePage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// Fixture values (tests/e2e/fixtures/store-fixture/server.mjs). The catalog
// asset is GUID-keyed and anonymous; the legacy browser pack is not.
const CATALOG_PACK_TITLE = "E2E Catalog Pack";
const CATALOG_TITLE = "E2E Catalog Cube";
const CATALOG_ASSET_ID = "3b1a2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CATALOG_CATEGORY = "Catalog Props";

const MCP_KEY = "store-mcp:mcp";
const SEARCH_KEY = "store-mcp:search";
const DETAIL_KEY = "store-mcp:detail";
const IMPORT_KEY = "store-mcp:import";
const JOB_KEY = "store-mcp:job";

async function mcp(page: Page): Promise<McpClient> {
    const state = getScenarioState(page);
    let client = state.getCustom<McpClient>(MCP_KEY);
    if (!client) {
        client = await connectMcp(page.request);
        state.setCustom(MCP_KEY, client);
    }
    return client;
}

function state<T>(page: Page, key: string): T {
    const found = getScenarioState(page).getCustom<T>(key);
    if (!found) {
        throw new Error(`No "${key}" was captured in this scenario.`);
    }
    return found;
}

async function expectOk(
    response: { ok(): boolean; status(): number; text(): Promise<string> },
    what: string,
): Promise<void> {
    expect(
        response.ok(),
        `${what}: ${response.status()} ${await response.text()}`,
    ).toBe(true);
}

/** Searches the catalog for `query` and remembers the answer. */
async function searchCatalog(page: Page, query: string): Promise<any> {
    const result = await (
        await mcp(page)
    ).callTool("search_store_assets", { query });
    expect(result.error, JSON.stringify(result)).toBeUndefined();
    getScenarioState(page).setCustom(SEARCH_KEY, result);
    return result;
}

/** The catalog hit for the fixture asset. */
function catalogHit(page: Page): any {
    const result = state<any>(page, SEARCH_KEY);
    const hit = (result.assets ?? []).find(
        (asset: { storeAssetId: string }) =>
            asset.storeAssetId === CATALOG_ASSET_ID,
    );
    expect(
        hit,
        `The catalog did not list "${CATALOG_PACK_TITLE}": ${JSON.stringify(result)}`,
    ).toBeTruthy();
    return hit;
}

/** Reads the fixture hit's public detail and remembers it. */
async function readCatalogHit(page: Page): Promise<any> {
    const hit = catalogHit(page);
    const detail = await (
        await mcp(page)
    ).callTool("get_store_asset", { storeAssetId: hit.storeAssetId });
    expect(detail.error, JSON.stringify(detail)).toBeUndefined();
    getScenarioState(page).setCustom(DETAIL_KEY, detail);
    return detail;
}

/**
 * Removes anything a previous attempt at this scenario imported, so a Playwright
 * retry starts from the same clean state as the first attempt (an already-imported
 * pack would make import_store_asset refuse, and a surviving model would dedupe the
 * re-import to zero created items).
 */
async function removeImportedCatalogPack(page: Page): Promise<void> {
    const packsResponse = await page.request.get(`${API_BASE}/packs`);
    if (!packsResponse.ok()) return;
    const { packs } = await packsResponse.json();
    for (const pack of (packs ?? []).filter(
        (candidate: { storeImportAssetId?: string }) =>
            candidate.storeImportAssetId === CATALOG_ASSET_ID,
    )) {
        const detail = await page.request.get(`${API_BASE}/packs/${pack.id}`);
        if (detail.ok()) {
            const body = await detail.json();
            for (const model of body.models ?? []) {
                await page.request.delete(`${API_BASE}/models/${model.id}`);
                await page.request.delete(
                    `${API_BASE}/recycled/model/${model.id}/permanent`,
                );
            }
        }
        await page.request.delete(`${API_BASE}/packs/${pack.id}`);
    }
}

When(
    "I sign in to the store with the wrong password",
    async ({ page }) => {
        const store = new AssetStorePage(page);
        // The tab browses the public catalog when signed out; the form is
        // reached through the header's Sign in action.
        await expect(store.signInButton).toBeVisible({ timeout: 15000 });
        await store.signInButton.click();
        await expect(store.loginForm).toBeVisible({ timeout: 15000 });
        await store.emailInput.fill(STORE_FIXTURE_EMAIL);
        await store.passwordInput.fill("definitely-not-the-password");
        const loginResponse = page.waitForResponse(
            (response) =>
                response.url().includes("/api/auth/login") &&
                response.request().method() === "POST",
        );
        await store.submitButton.click();
        await loginResponse;
    },
);

Then(
    "the store login error should say {string}",
    async ({ page }, message: string) => {
        await expect(page.getByTestId("asset-store-login-error")).toContainText(
            message,
            { timeout: 15000 },
        );
    },
);

When(
    "an agent searches the store catalog over MCP for {string}",
    async ({ page }, query: string) => {
        await searchCatalog(page, query);
    },
);

Then("the store catalog should list the catalog asset", async ({ page }) => {
    const result = state<any>(page, SEARCH_KEY);
    expect(result.storeUrl, JSON.stringify(result)).toContain("localhost:9280");
    const hit = catalogHit(page);
    expect(hit.storeAssetId).toBe(CATALOG_ASSET_ID);
    expect(hit.isFree).toBe(true);
    expect(hit.itemTypes).toContain("Model");
});

When("an agent reads the catalog hit over MCP", async ({ page }) => {
    await readCatalogHit(page);
});

Given("an agent reads the catalog asset over MCP", async ({ page }) => {
    await removeImportedCatalogPack(page);
    await searchCatalog(page, "Catalog");
    await readCatalogHit(page);
});

Then(
    "the store asset detail should describe the catalog asset",
    async ({ page }) => {
        const detail = state<any>(page, DETAIL_KEY);
        expect(detail.storeUrl, JSON.stringify(detail)).toContain(
            "localhost:9280",
        );
        expect(detail.asset.title).toBe(CATALOG_PACK_TITLE);
        expect(detail.asset.isFree).toBe(true);
        expect(typeof detail.canImportWithoutAccount).toBe("boolean");

        const item = (detail.asset.items ?? []).find(
            (candidate: { name: string }) =>
                candidate.name === CATALOG_TITLE,
        );
        expect(item, JSON.stringify(detail)).toBeTruthy();
        expect(item.itemType).toBe("Model");
        expect(item.category).toBe(CATALOG_CATEGORY);
    },
);

When("an agent imports the catalog asset over MCP", async ({ page }) => {
    const hit = catalogHit(page);
    const result = await (
        await mcp(page)
    ).callTool("import_store_asset", {
        storeAssetId: hit.storeAssetId,
        idempotencyKey: McpClient.key("store-import"),
    });
    expect(result.error, JSON.stringify(result)).toBeUndefined();
    expect(result.status).toBe("queued");
    expect(typeof result.jobId).toBe("number");
    getScenarioState(page).setCustom(IMPORT_KEY, result);
});

Then("the store import job should complete", async ({ page }) => {
    const imported = state<any>(page, IMPORT_KEY);
    // get_store_import blocks server-side; call it again only if the first
    // answer was still running, so there is no client-side sleep.
    let job: any;
    for (let attempt = 0; attempt < 6; attempt++) {
        job = await (
            await mcp(page)
        ).callTool("get_store_import", {
            jobId: imported.jobId,
            waitSeconds: 60,
        });
        expect(job.error, JSON.stringify(job)).toBeUndefined();
        if (job.status === "Completed" || job.status === "Failed") {
            break;
        }
    }
    getScenarioState(page).setCustom(JOB_KEY, job);
    expect(job.status, JSON.stringify(job)).toBe("Completed");
    expect(job.itemsCreated).toBe(1);
    expect(job.itemsFailed).toBe(0);
    expect(typeof job.packId).toBe("number");
});

Then(
    "the imported catalog asset should be in the library with its metadata",
    async ({ page }) => {
        const job = state<any>(page, JOB_KEY);

        const packsResponse = await page.request.get(`${API_BASE}/packs`);
        await expectOk(packsResponse, "Packs could not be listed");
        const { packs } = await packsResponse.json();
        const pack = (packs ?? []).find(
            (candidate: { id: number }) => candidate.id === job.packId,
        );
        expect(pack, `No pack ${job.packId} in ${JSON.stringify(packs)}`).toBeTruthy();
        expect(pack.storeImportAssetId).toBe(CATALOG_ASSET_ID);
        expect(pack.storeImportUrl).toContain("localhost:9280");

        const detailResponse = await page.request.get(
            `${API_BASE}/packs/${job.packId}`,
        );
        await expectOk(detailResponse, "The imported pack could not be read");
        const detail = await detailResponse.json();
        const model = (detail.models ?? []).find(
            (candidate: { name: string }) => candidate.name === CATALOG_TITLE,
        );
        expect(model, `The pack has no "${CATALOG_TITLE}"`).toBeTruthy();

        const categoriesResponse = await page.request.get(
            `${API_BASE}/model-categories`,
        );
        await expectOk(categoriesResponse, "Model categories could not be read");
        const { categories } = await categoriesResponse.json();
        const category = (categories ?? []).find(
            (candidate: { name: string }) =>
                candidate.name === CATALOG_CATEGORY,
        );
        expect(
            category,
            `Model category "${CATALOG_CATEGORY}" was not created`,
        ).toBeTruthy();

        const modelsResponse = await page.request.get(`${API_BASE}/models`);
        await expectOk(modelsResponse, "Models could not be listed");
        const models = await modelsResponse.json();
        const listed = (models ?? []).find(
            (candidate: { id: number }) => candidate.id === model.id,
        );
        expect(listed, `Model ${model.id} is missing from the library`).toBeTruthy();
        expect(listed.categoryId).toBe(category.id);

        // The rights and provenance the importer stamps onto the asset.
        const metadata = await (
            await mcp(page)
        ).callTool("get_asset_metadata", {
            assetType: "Model",
            assetId: model.id,
        });
        const field = (key: string) =>
            metadata.fields.find(
                (candidate: { key: string }) => candidate.key === key,
            )?.value;
        expect(field("license")).toBe("CC0");
        expect(field("author")).toBe("E2E Fixture");
        expect(field("description")).toBe("A catalog-imported cube.");
        expect(field("sourceKind")).toBe("Store Import");
        expect(field("storeAssetId")).toBe(CATALOG_ASSET_ID);
        expect(String(field("storeUrl"))).toContain("localhost:9280");
        expect(String(field("sourceUrl"))).toContain(CATALOG_ASSET_ID);
        expect(field("tags")).toContain("catalog-import");
    },
);

Then("the catalog hit should report it is already imported", async ({ page }) => {
    await searchCatalog(page, "Catalog");
    expect(catalogHit(page).alreadyImported).toBe(true);
});

When("an agent reads a store import job over MCP", async ({ page }) => {
    getScenarioState(page).setCustom(JOB_KEY, await (
        await mcp(page)
    ).callTool("get_store_import", {
        jobId: 2147483000,
    }));
});

Then("the store import job should be reported missing", async ({ page }) => {
    const job = state<any>(page, JOB_KEY);
    expect(job.error, JSON.stringify(job)).toBe("StoreImportJobNotFound");
});
