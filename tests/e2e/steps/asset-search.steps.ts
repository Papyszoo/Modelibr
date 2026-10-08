import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import crypto from "crypto";
import fs from "fs";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { createUniqueSolidPngPayload } from "../helpers/file-payload-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

// ---- Scenario state -----------------------------------------------------------

const MCP_KEY = "asset-search:mcp";
const LAST_RESULT_KEY = "asset-search:last-result";
const MODEL_KEY = "asset-search:model";
const VARIANTS_KEY = "asset-search:variants";
const DUPLICATES_KEY = "asset-search:duplicates";
const RANK_KEY = "asset-search:rank";
const METADATA_KEY = "asset-search:metadata";
const STYLED_KEY = "asset-search:styled";
const PROJECT_KEY = "asset-search:project";

interface SearchModel {
    id: number;
    name: string;
    token: string;
}

function token(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function unique(prefix: string): string {
    return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

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
        throw new Error(`No "${key}" was provisioned in this scenario.`);
    }
    return found;
}

function model(page: Page): SearchModel {
    return state<SearchModel>(page, MODEL_KEY);
}

function lastResult(page: Page): any {
    return state<any>(page, LAST_RESULT_KEY);
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

async function search(
    page: Page,
    args: Record<string, unknown>,
): Promise<any> {
    const result = await (await mcp(page)).callTool("search_assets", args);
    getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    return result;
}

async function callTool(
    page: Page,
    tool: string,
    args: Record<string, unknown>,
): Promise<any> {
    const result = await (await mcp(page)).callTool(tool, {
        idempotencyKey: McpClient.key(tool),
        ...args,
    });
    getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    return result;
}

async function uploadModel(
    page: Page,
    filename: string,
    source: string,
): Promise<{ id: number; name: string }> {
    const filePath = await UniqueFileGenerator.generate(source);
    const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    const mime =
        extension === ".glb"
            ? "model/gltf-binary"
            : extension === ".stl"
              ? "model/stl"
              : "application/octet-stream";
    const response = await page.request.post(`${API_BASE}/models`, {
        multipart: {
            file: {
                name: filename,
                mimeType: mime,
                buffer: fs.readFileSync(filePath),
            },
        },
    });
    await expectOk(response, `The model ${filename} was not uploaded`);
    const model = await response.json();
    const detail = await page.request.get(`${API_BASE}/models/${model.id}`);
    await expectOk(detail, "The uploaded model could not be read back");
    return { id: model.id, name: String((await detail.json()).name) };
}

/** Polls a search until `check` is happy, so nothing races the derivation. */
async function waitForSearch(
    page: Page,
    args: Record<string, unknown>,
    check: (result: any) => boolean,
    message: string,
): Promise<void> {
    await expect
        .poll(
            async () => {
                const result = await (await mcp(page)).callTool(
                    "search_assets",
                    args,
                );
                if (result.error) {
                    return false;
                }
                return check(result);
            },
            { message, timeout: 60000, intervals: [1000, 2000] },
        )
        .toBe(true);
}

function hasHit(result: any, id: number): boolean {
    return (result.hits ?? []).some(
        (hit: { assetId: number }) => hit.assetId === id,
    );
}

// ---- Provisioning ---------------------------------------------------------------

Given("a batch3 search model exists", async ({ page }) => {
    const value = token();
    const name = `srch ${value}`;
    const uploaded = await uploadModel(page, `${name}.glb`, "test-cube.glb");
    const provisioned: SearchModel = {
        id: uploaded.id,
        name,
        token: value,
    };
    getScenarioState(page).setCustom(MODEL_KEY, provisioned);
    await waitForSearch(
        page,
        { query: value },
        (result) => hasHit(result, provisioned.id),
        `Waiting for model ${provisioned.id} to be indexed`,
    );
});

Given("two batch3 search variant models exist", async ({ page }) => {
    const value = token();
    const stem = `svar${value}`;
    const first = await uploadModel(
        page,
        `${stem}-01.glb`,
        "test-cube.glb",
    );
    const second = await uploadModel(
        page,
        `${stem}-02.stl`,
        "test-cube.stl",
    );
    getScenarioState(page).setCustom(VARIANTS_KEY, {
        stem,
        ids: [first.id, second.id],
        names: [first.name, second.name],
    });
    await waitForSearch(
        page,
        { query: stem },
        (result) =>
            (result.hits ?? []).length === 1 &&
            (result.hits[0].variants ?? []).length >= 1,
        `Waiting for the variant stem ${stem} to fold`,
    );
});

Given("two batch3 search duplicate models exist", async ({ page }) => {
    const value = token();
    const first = await uploadModel(
        page,
        `sdup${value} one.glb`,
        "test-cube.glb",
    );
    const second = await uploadModel(
        page,
        `sdup${value} two.glb`,
        "test-cube.glb",
    );
    getScenarioState(page).setCustom(DUPLICATES_KEY, {
        token: `sdup${value}`,
        survivor: first.id,
        redundant: second.id,
    });
    await waitForSearch(
        page,
        { query: `sdup${value}` },
        (result) =>
            (result.hits ?? []).length === 1 &&
            (result.hits[0].alsoAt ?? []).length >= 1,
        "Waiting for the two duplicate copies to fold",
    );
});

Given(
    "several batch3 search models carry a common token and one carries a rare token",
    async ({ page }) => {
        const value = token();
        const commonToken = `cmn${value}`;
        const rareToken = `rar${value}`;
        for (const label of ["a", "b", "c"]) {
            await uploadModel(
                page,
                `${commonToken} item ${label}.glb`,
                "test-cube.glb",
            );
        }
        await uploadModel(page, `${rareToken} item.stl`, "test-cube.stl");
        getScenarioState(page).setCustom(RANK_KEY, {
            commonToken,
            rareToken,
        });
        // All three decoys share geometry and fold into one hit with two
        // also-at copies; that is the proof all three documents landed.
        await waitForSearch(
            page,
            { query: commonToken },
            (result) =>
                (result.hits ?? []).length === 1 &&
                (result.hits[0].alsoAt ?? []).length === 2,
            `Waiting for the three common-token decoys to index`,
        );
        await waitForSearch(
            page,
            { query: rareToken },
            (result) => (result.hits ?? []).length >= 1,
            `Waiting for the rare-token model to index`,
        );
    },
);

Given(
    "a batch3 search model with searchable metadata exists",
    async ({ page }) => {
        const value = token();
        const name = `meta${value}`;
        const uploaded = await uploadModel(
            page,
            `${name}.glb`,
            "test-cube.glb",
        );
        const description = `dsctok${value}`;
        const tag = `tgtok${value}`;
        await (await mcp(page)).callTool("set_asset_metadata", {
            assetType: "Model",
            assetId: uploaded.id,
            idempotencyKey: McpClient.key("meta"),
            fields: { description, tags: [tag] },
        });
        await (await mcp(page)).callTool("reindex_search", {
            idempotencyKey: McpClient.key("reindex"),
            modelId: uploaded.id,
        });
        getScenarioState(page).setCustom(METADATA_KEY, {
            id: uploaded.id,
            description,
            tag,
        });
        await waitForSearch(
            page,
            { query: description },
            (result) => hasHit(result, uploaded.id),
            `Waiting for the description token to be indexed`,
        );
        await waitForSearch(
            page,
            { query: tag },
            (result) => hasHit(result, uploaded.id),
            `Waiting for the tag token to be indexed`,
        );
    },
);

Given("two batch3 styled search models exist", async ({ page }) => {
    const value = token();
    const sharedToken = `sty${value}`;
    const first = await uploadModel(
        page,
        `${sharedToken} alpha.glb`,
        "test-cube.glb",
    );
    const second = await uploadModel(
        page,
        `${sharedToken} beta.stl`,
        "test-cube.stl",
    );
    const setStyle = async (assetId: number, style: string) => {
        await (await mcp(page)).callTool("set_asset_metadata", {
            assetType: "Model",
            assetId,
            idempotencyKey: McpClient.key("style"),
            fields: { styles: [style] },
        });
        await (await mcp(page)).callTool("reindex_search", {
            idempotencyKey: McpClient.key("style-index"),
            modelId: assetId,
        });
    };
    await setStyle(first.id, "Low Poly");
    await setStyle(second.id, "Realistic");
    getScenarioState(page).setCustom(STYLED_KEY, {
        sharedToken,
        lowPoly: first.id,
        realistic: second.id,
    });
    await waitForSearch(
        page,
        { query: sharedToken },
        (result) =>
            (result.hits ?? []).length >= 2 &&
            (result.hits ?? []).every(
                (hit: { facts?: { styles?: string[] } }) =>
                    (hit.facts?.styles ?? []).length > 0,
            ),
        `Waiting for both styled models to carry their styles`,
    );
});

Given(
    "a batch3 search project styled {string} exists",
    async ({ page }, style: string) => {
        const created = await apiHelper.createProject(
            unique("Batch3 Search Project"),
            "Asset search profile-fit coverage",
        );
        const optionsResponse = await page.request.get(
            `${API_BASE}/projects/profile-options`,
        );
        await expectOk(optionsResponse, "The profile options could not be read");
        const styleOption = ((await optionsResponse.json()).options as Array<{
            id: number;
            dimension: string;
            name: string;
        }>).find(
            (option) =>
                option.dimension === "style" && option.name === style,
        );
        expect(styleOption, `No style option "${style}"`).toBeTruthy();
        const profile = await page.request.put(
            `${API_BASE}/projects/${created.id}/profile`,
            {
                data: {
                    dimensions: {
                        style: [{ optionId: styleOption!.id }],
                    },
                },
            },
        );
        await expectOk(profile, "The project profile could not be set");
        getScenarioState(page).setCustom(PROJECT_KEY, {
            id: created.id,
            name: created.name,
        });
    },
);

// ---- Findability and reindex ----------------------------------------------------

Then(
    "searching for the batch3 search model's token should return it",
    async ({ page }) => {
        const result = await search(page, { query: model(page).token });
        expect(
            result.hits?.map((hit: { assetId: number }) => hit.assetId),
            JSON.stringify(result),
        ).toContain(model(page).id);
    },
);

Then(
    "searching for the batch3 search model's token should still return it",
    async ({ page }) => {
        const result = await search(page, { query: model(page).token });
        expect(
            result.hits?.map((hit: { assetId: number }) => hit.assetId),
            JSON.stringify(result),
        ).toContain(model(page).id);
    },
);

When("an agent reindexes the library over MCP", async ({ page }) => {
    const result = await callTool(page, "reindex_search", {});
    expect(result.status, JSON.stringify(result)).toBe("ok");
});

Then("the reindex should report the library scope", async ({ page }) => {
    expect(lastResult(page).scope).toBe("library");
});

// ---- Variant and duplicate folding ----------------------------------------------

Then(
    "searching for the variant stem should fold them into one hit",
    async ({ page }) => {
        const variants = state<{ stem: string; ids: number[] }>(
            page,
            VARIANTS_KEY,
        );
        const result = await search(page, { query: variants.stem });
        expect(result.hits, JSON.stringify(result)).toHaveLength(1);
        const folded = [
            result.hits[0].assetId,
            ...(result.hits[0].alsoAt ?? []),
            ...(result.hits[0].variants ?? []),
        ];
        for (const id of variants.ids) {
            expect(folded, JSON.stringify(result.hits[0])).toContain(id);
        }
        expect((result.hits[0].variants ?? []).length).toBe(1);
    },
);

Then(
    "searching for the duplicate token should collapse them into one hit",
    async ({ page }) => {
        const duplicates = state<{
            token: string;
            survivor: number;
            redundant: number;
        }>(page, DUPLICATES_KEY);
        const result = await search(page, { query: duplicates.token });
        expect(result.hits, JSON.stringify(result)).toHaveLength(1);
        const folded = [
            result.hits[0].assetId,
            ...(result.hits[0].alsoAt ?? []),
        ];
        expect(folded).toContain(duplicates.survivor);
        expect(folded).toContain(duplicates.redundant);
    },
);

// ---- Rarity ---------------------------------------------------------------------

When(
    "an agent searches for the common and rare tokens together",
    async ({ page }) => {
        const rank = state<{ commonToken: string; rareToken: string }>(
            page,
            RANK_KEY,
        );
        await search(page, {
            query: `${rank.commonToken} ${rank.rareToken}`,
        });
    },
);

Then(
    "the first hit should be the model carrying the rare token",
    async ({ page }) => {
        const rank = state<{ commonToken: string; rareToken: string }>(
            page,
            RANK_KEY,
        );
        const result = lastResult(page);
        expect(result.hits?.length, JSON.stringify(result)).toBeGreaterThan(0);
        expect(result.hits[0].displayName).toContain(rank.rareToken);
    },
);

// ---- Metadata tokens ------------------------------------------------------------

Then(
    "searching for its description token should return it",
    async ({ page }) => {
        const metadata = state<{ id: number; description: string }>(
            page,
            METADATA_KEY,
        );
        const result = await search(page, { query: metadata.description });
        expect(hasHit(result, metadata.id), JSON.stringify(result)).toBe(true);
    },
);

Then(
    "searching for its tag token should return it",
    async ({ page }) => {
        const metadata = state<{ id: number; tag: string }>(
            page,
            METADATA_KEY,
        );
        const result = await search(page, { query: metadata.tag });
        expect(hasHit(result, metadata.id), JSON.stringify(result)).toBe(true);
    },
);

// ---- Profile fit ----------------------------------------------------------------

When(
    "an agent searches on behalf of the batch3 project for the styled token",
    async ({ page }) => {
        const styled = state<{ sharedToken: string }>(page, STYLED_KEY);
        const project = state<{ id: number }>(page, PROJECT_KEY);
        await search(page, {
            query: styled.sharedToken,
            projectId: project.id,
        });
    },
);

Then(
    "the first hit should be the low-poly search model",
    async ({ page }) => {
        const styled = state<{ lowPoly: number }>(page, STYLED_KEY);
        const result = lastResult(page);
        expect(result.profile?.applied, JSON.stringify(result)).toBe(true);
        expect(result.hits[0].assetId).toBe(styled.lowPoly);
    },
);

Then(
    "every hit should report a profile fit against the batch3 project",
    async ({ page }) => {
        const project = state<{ id: number }>(page, PROJECT_KEY);
        const result = lastResult(page);
        expect(result.profile?.projectId).toBe(project.id);
        expect(result.hits.length).toBeGreaterThan(0);
        for (const hit of result.hits) {
            expect(hit.facts?.profileFit, JSON.stringify(hit)).toBeTruthy();
            expect(hit.facts.profileFit.budget).toBeGreaterThan(0);
        }
    },
);

// ---- Size filters ---------------------------------------------------------------

When(
    "an agent searches for the batch3 search model's token with a maximum size of 0.5",
    async ({ page }) => {
        await search(page, { query: model(page).token, maxSize: 0.5 });
    },
);

Then("the search should return no hits", async ({ page }) => {
    expect(lastResult(page).hits ?? []).toHaveLength(0);
});

When(
    "an agent searches for the batch3 search model's token with a minimum size of 0.5",
    async ({ page }) => {
        await search(page, { query: model(page).token, minSize: 0.5 });
    },
);

// ---- Facets ---------------------------------------------------------------------

When("an agent lists the search facets", async ({ page }) => {
    const result = await (await mcp(page)).callTool("list_facets", {});
    getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
});

Then(
    "the facet list should include the {string} filter",
    async ({ page }, name: string) => {
        const names = (lastResult(page).filters ?? []).map(
            (filter: { name: string }) => filter.name,
        );
        expect(names, JSON.stringify(lastResult(page))).toContain(name);
    },
);

When(
    "an agent asks for the facet ranges of models",
    async ({ page }) => {
        const result = await (await mcp(page)).callTool("get_facet_ranges", {
            assetType: "Model",
        });
        getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    },
);

Then(
    "the facet ranges should include a triangle range",
    async ({ page }) => {
        const ranges = (lastResult(page).ranges ?? []).map(
            (range: { field: string }) => range.field,
        );
        expect(ranges, JSON.stringify(lastResult(page))).toContain(
            "triangles",
        );
    },
);

// ---- get_asset / get_part / get_assets ------------------------------------------

When(
    "an agent reads the batch3 search model over MCP",
    async ({ page }) => {
        await callTool(page, "get_asset", {
            assetType: "Model",
            assetId: model(page).id,
        });
    },
);

Then(
    "the MCP asset read should list at least one part",
    async ({ page }) => {
        const parts = lastResult(page).parts ?? [];
        expect(parts.length, JSON.stringify(lastResult(page))).toBeGreaterThan(
            0,
        );
        getScenarioState(page).setCustom(
            "asset-search:part-path",
            parts[0].partPath,
        );
    },
);

When("an agent reads the first part over MCP", async ({ page }) => {
    const partPath = state<string>(page, "asset-search:part-path");
    await callTool(page, "get_part", {
        assetType: "Model",
        assetId: model(page).id,
        partPath,
    });
});

Then("the MCP part read should describe that part", async ({ page }) => {
    const partPath = state<string>(page, "asset-search:part-path");
    const parts = lastResult(page).parts ?? [];
    expect(parts).toHaveLength(1);
    expect(parts[0].partPath).toBe(partPath);
});

When(
    "an agent reads a batch with the model and a missing asset",
    async ({ page }) => {
        const result = await (await mcp(page)).callTool("get_assets", {
            assets: [
                { assetType: "Model", assetId: model(page).id },
                { assetType: "Model", assetId: 2147483000 },
            ],
        });
        getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    },
);

Then(
    "the batch should answer the model and report the missing asset",
    async ({ page }) => {
        const assets = lastResult(page).assets ?? [];
        expect(assets).toHaveLength(2);
        expect(assets[0].asset).toBeTruthy();
        expect(assets[1].error).toBeTruthy();
    },
);

// ---- search_many ----------------------------------------------------------------

When(
    "an agent runs a batch of two searches, one matching and one empty",
    async ({ page }) => {
        const value = model(page).token;
        const result = await (await mcp(page)).callTool("search_many", {
            searches: [
                { query: value, label: "match" },
                // A random token of its own, not the model's own token inside a
                // longer word: "empty<token>" fuzzy-matches the model it contains
                // and made the expected-empty search return it intermittently.
                { query: `nomatch${token()}`, label: "empty" },
            ],
        });
        getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    },
);

Then(
    "the batch should answer both entries with the registered labels",
    async ({ page }) => {
        const result = lastResult(page);
        expect(result.count).toBe(2);
        expect(result.searches[0].label).toBe("match");
        expect(result.searches[0].hits?.length).toBeGreaterThan(0);
        expect(result.searches[1].label).toBe("empty");
        expect(result.searches[1].hits?.length ?? 0).toBe(0);
    },
);

// ---- Duplicate collapse ---------------------------------------------------------

When("an agent lists duplicate assets", async ({ page }) => {
    const result = await (await mcp(page)).callTool("get_duplicate_assets", {
        page: 1,
        pageSize: 100,
    });
    getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
});

Then(
    "a duplicate group should contain both batch3 search duplicate models",
    async ({ page }) => {
        const duplicates = state<{ survivor: number; redundant: number }>(
            page,
            DUPLICATES_KEY,
        );
        const group = (lastResult(page).groups ?? []).find(
            (candidate: { members: Array<{ modelId: number }> }) => {
                const ids = candidate.members.map((m) => m.modelId);
                return (
                    ids.includes(duplicates.survivor) &&
                    ids.includes(duplicates.redundant)
                );
            },
        );
        expect(group, JSON.stringify(lastResult(page))).toBeTruthy();
    },
);

When(
    "an agent collapses the second duplicate as a dry run",
    async ({ page }) => {
        const duplicates = state<{ survivor: number; redundant: number }>(
            page,
            DUPLICATES_KEY,
        );
        const result = await callTool(page, "collapse_duplicate_assets", {
            survivorModelId: duplicates.survivor,
            redundantModelIds: [duplicates.redundant],
            dryRun: true,
        });
        expect(result.status, JSON.stringify(result)).toBe("dry-run");
        expect(result.recycled).toContain(duplicates.redundant);
    },
);

Then(
    "the dry run should not remove the second duplicate",
    async ({ page }) => {
        const duplicates = state<{ redundant: number }>(page, DUPLICATES_KEY);
        const response = await page.request.get(
            `${API_BASE}/models/${duplicates.redundant}`,
        );
        expect(response.status()).toBe(200);
    },
);

When(
    "an agent collapses the second duplicate for real",
    async ({ page }) => {
        const duplicates = state<{ survivor: number; redundant: number }>(
            page,
            DUPLICATES_KEY,
        );
        const result = await callTool(page, "collapse_duplicate_assets", {
            survivorModelId: duplicates.survivor,
            redundantModelIds: [duplicates.redundant],
            dryRun: false,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        expect(result.recycled).toContain(duplicates.redundant);
    },
);

Then("the second duplicate should be recycled", async ({ page }) => {
    const duplicates = state<{ redundant: number }>(page, DUPLICATES_KEY);
    await expect
        .poll(
            async () => {
                const response = await page.request.get(
                    `${API_BASE}/models/${duplicates.redundant}`,
                );
                return response.status();
            },
            {
                message: "Waiting for the redundant copy to be recycled",
                timeout: 15000,
                intervals: [500, 1000],
            },
        )
        .toBe(404);
});

Then(
    "the second duplicate should no longer be in a duplicate group",
    async ({ page }) => {
        const duplicates = state<{ redundant: number }>(page, DUPLICATES_KEY);
        await expect
            .poll(
                async () => {
                    const result = await (
                        await mcp(page)
                    ).callTool("get_duplicate_assets", {
                        page: 1,
                        pageSize: 100,
                    });
                    const listed = (result.groups ?? []).some(
                        (group: { members: Array<{ modelId: number }> }) =>
                            group.members.some(
                                (member) =>
                                    member.modelId === duplicates.redundant,
                            ),
                    );
                    return listed ? "listed" : "gone";
                },
                {
                    message: "Waiting for the recycled copy to leave the groups",
                    timeout: 15000,
                    intervals: [500, 1000],
                },
            )
            .toBe("gone");
    },
);

// ---- Packs ----------------------------------------------------------------------

When(
    "an agent creates a pack and adds the batch3 search model",
    async ({ page }) => {
        const created = await callTool(page, "create_pack", {
            name: unique("Batch3 Search Pack"),
        });
        expect(created.status, JSON.stringify(created)).toBe("ok");
        const added = await callTool(page, "add_to_pack", {
            packId: created.pack.id,
            modelId: model(page).id,
        });
        expect(added.status, JSON.stringify(added)).toBe("ok");
        getScenarioState(page).setCustom("asset-search:pack", {
            id: created.pack.id,
        });
    },
);

Then(
    "the pack should contain the batch3 search model",
    async ({ page }) => {
        const pack = state<{ id: number }>(page, "asset-search:pack");
        const models = await apiHelper.getModelsByPack(pack.id);
        expect(
            models.map((candidate: { id: number }) => candidate.id),
            JSON.stringify(models),
        ).toContain(model(page).id);
    },
);

// ---- Global search palette ------------------------------------------------------

When(
    "a batch3 sound and a batch3 sprite share a token",
    async ({ page }) => {
        const value = token();
        const soundName = `gsnd ${value}`;
        const spriteName = `gspr ${value}`;

        const wav = await UniqueFileGenerator.generate("test-tone.wav");
        const soundResponse = await page.request.post(
            `${API_BASE}/sounds/with-file`,
            {
                multipart: {
                    file: {
                        name: `${soundName}.wav`,
                        mimeType: "audio/wav",
                        buffer: fs.readFileSync(wav),
                    },
                    name: soundName,
                },
            },
        );
        await expectOk(soundResponse, "The batch3 sound was not created");

        const png = createUniqueSolidPngPayload({
            filenamePrefix: "batch3gspr",
            width: 16,
            height: 16,
        });
        const spriteResponse = await page.request.post(
            `${API_BASE}/sprites/with-file`,
            {
                multipart: {
                    file: {
                        name: `${spriteName}.png`,
                        mimeType: "image/png",
                        buffer: png.buffer,
                    },
                },
            },
        );
        await expectOk(spriteResponse, "The batch3 sprite was not created");

        getScenarioState(page).setCustom("asset-search:global", {
            token: value,
            soundName,
            spriteName,
        });
    },
);

When(
    "I search the palette for that shared token",
    async ({ page }) => {
        const global = state<{ token: string }>(page, "asset-search:global");
        await page.fill('[data-testid="search-palette-input"]', global.token);
        await expect(
            page.locator('[data-testid="search-palette-result"]').first(),
        ).toBeVisible({ timeout: 10000 });
    },
);

Then(
    "the palette should show the batch3 sound and the batch3 sprite",
    async ({ page }) => {
        const global = state<{ soundName: string; spriteName: string }>(
            page,
            "asset-search:global",
        );
        const results = page.locator('[data-testid="search-palette-result"]');
        await expect(
            results.filter({ hasText: global.soundName }),
        ).toHaveCount(1, { timeout: 10000 });
        await expect(
            results.filter({ hasText: global.spriteName }),
        ).toHaveCount(1, { timeout: 10000 });
    },
);
