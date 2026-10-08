import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import crypto from "crypto";
import fs from "fs";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import {
    createUniqueSolidHdrPayload,
    createUniqueSolidPngPayload,
} from "../helpers/file-payload-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import { waitForModelViewerCanvas } from "../helpers/viewer-canvas";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

// ---- Scenario state -----------------------------------------------------------

const MCP_KEY = "import-metadata:mcp";
const LAST_RESULT_KEY = "import-metadata:last-result";
const LAST_MODEL_KEY = "import-metadata:last-model";
const LAST_IMPORT_KEY = "import-metadata:last-import";
const TICKET_KEY = "import-metadata:ticket";
const CATEGORY_KEY = "import-metadata:category";
const REDERIVE_KEY = "import-metadata:rederive";

interface Batch3Model {
    id: number;
    name: string;
    versionId: number;
    categoryName?: string;
}

function unique(prefix: string): string {
    return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

function token(): string {
    return crypto.randomUUID().slice(0, 8);
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

function lastModel(page: Page): Batch3Model {
    const found = getScenarioState(page).getCustom<Batch3Model>(LAST_MODEL_KEY);
    if (!found) {
        throw new Error(
            "No batch3 model was provisioned - a Given is missing.",
        );
    }
    return found;
}

function lastResult(page: Page): any {
    const found = getScenarioState(page).getCustom<any>(LAST_RESULT_KEY);
    if (!found) {
        throw new Error("No MCP result was captured in this scenario.");
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

/** Uploads bytes to the HTTP data plane named by a ticket the agent requested. */
async function uploadWithTicket(
    page: Page,
    ticket: any,
    endpoint: string,
    multipart: Record<string, unknown>,
): Promise<any> {
    const response = await page.request.post(`${API_BASE}${endpoint}`, {
        headers: { [ticket.ticket.header]: ticket.ticket.value },
        multipart,
    });
    await expectOk(response, `The ${endpoint} upload was refused`);
    return response.json();
}

async function requestTicket(
    page: Page,
    assetType: string,
): Promise<any> {
    const result = await callTool(page, "request_upload_ticket", {
        assetType,
    });
    expect(result.status, JSON.stringify(result)).toBe("upload-required");
    getScenarioState(page).setCustom(TICKET_KEY, result);
    return result;
}

// ---- Provisioning ---------------------------------------------------------------

Given(
    "a batch3 model named like a {word} exists",
    async ({ page }, word: string) => {
        const suffix = token();
        const filename = `${word} ${suffix}.glb`;
        const source = await UniqueFileGenerator.generate("test-cube.glb");
        const model = await uploadWithTicket(
            page,
            await requestTicket(page, "Model"),
            "/models",
            {
                file: {
                    name: filename,
                    mimeType: "model/gltf-binary",
                    buffer: fs.readFileSync(source),
                },
            },
        );
        const detail = await page.request.get(
            `${API_BASE}/models/${model.id}`,
        );
        await expectOk(detail, "The uploaded model could not be read back");
        const versions = await page.request.get(
            `${API_BASE}/models/${model.id}/versions`,
        );
        await expectOk(versions, "The model versions could not be read");
        const provisioned: Batch3Model = {
            id: model.id,
            name: String((await detail.json()).name),
            versionId: Number((await versions.json())[0].id),
        };
        getScenarioState(page).setCustom(LAST_MODEL_KEY, provisioned);
    },
);

Given(
    "a batch3 model category {string} exists",
    async ({ page }, prefix: string) => {
        const created = await apiHelper.createModelCategory(unique(prefix));
        getScenarioState(page).setCustom(CATEGORY_KEY, created);
    },
);

// ---- Upload tickets -------------------------------------------------------------

When(
    "an agent requests a {string} upload ticket",
    async ({ page }, assetType: string) => {
        await requestTicket(page, assetType);
    },
);

Then(
    "the upload ticket should target {string}",
    async ({ page }, endpoint: string) => {
        const ticket = getScenarioState(page).getCustom<any>(TICKET_KEY);
        expect(ticket?.upload?.endpoint, JSON.stringify(ticket)).toBe(
            endpoint,
        );
    },
);

When(
    "the agent uploads a unique model with that ticket",
    async ({ page }) => {
        const ticket = getScenarioState(page).getCustom<any>(TICKET_KEY);
        const suffix = token();
        const source = await UniqueFileGenerator.generate("test-cube.glb");
        const model = await uploadWithTicket(
            page,
            ticket,
            "/models",
            {
                file: {
                    name: `batch3ticket ${suffix}.glb`,
                    mimeType: "model/gltf-binary",
                    buffer: fs.readFileSync(source),
                },
            },
        );
        getScenarioState(page).setCustom(LAST_IMPORT_KEY, {
            family: "model",
            id: model.id,
            name: `batch3ticket ${suffix}`,
            alreadyExists: model.alreadyExists,
        });
    },
);

Then(
    "the library should hold the model imported through the ticket",
    async ({ page }) => {
        const imported = getScenarioState(page).getCustom<any>(LAST_IMPORT_KEY);
        const response = await page.request.get(
            `${API_BASE}/models/${imported.id}`,
        );
        await expectOk(response, "The imported model could not be read");
        expect((await response.json()).name).toBe(imported.name);
        expect(imported.alreadyExists).toBe(false);
    },
);

Then(
    "the MCP upload contract should offer the loose-glTF alternative",
    async ({ page }) => {
        const ticket = getScenarioState(page).getCustom<any>(TICKET_KEY);
        expect(
            ticket.alternatives?.multiFile?.endpoint,
            JSON.stringify(ticket.alternatives),
        ).toContain("/models/multifile");
    },
);

// ---- The four non-model families ------------------------------------------------

When(
    "an agent imports a sound through an upload ticket",
    async ({ page }) => {
        const ticket = await requestTicket(page, "Sound");
        const payload = await UniqueFileGenerator.generate("test-tone.wav");
        const name = unique("Batch3 Sound");
        const body = await uploadWithTicket(page, ticket, "/sounds/with-file", {
            file: {
                name: `${name}.wav`,
                mimeType: "audio/wav",
                buffer: fs.readFileSync(payload),
            },
            name,
        });
        getScenarioState(page).setCustom(LAST_IMPORT_KEY, {
            family: "sound",
            id: body.soundId,
            name,
        });
    },
);

Then(
    "the library sound imported through the ticket should exist",
    async ({ page }) => {
        const imported = getScenarioState(page).getCustom<any>(LAST_IMPORT_KEY);
        const response = await page.request.get(
            `${API_BASE}/sounds/${imported.id}`,
        );
        await expectOk(response, "The imported sound could not be read");
        expect((await response.json()).name).toBe(imported.name);
    },
);

When(
    "an agent imports a sprite through an upload ticket",
    async ({ page }) => {
        const ticket = await requestTicket(page, "Sprite");
        const payload = createUniqueSolidPngPayload({
            filenamePrefix: "batch3sprite",
            width: 16,
            height: 16,
        });
        const body = await uploadWithTicket(page, ticket, "/sprites/with-file", {
            file: {
                name: payload.name,
                mimeType: payload.mimeType,
                buffer: payload.buffer,
            },
        });
        getScenarioState(page).setCustom(LAST_IMPORT_KEY, {
            family: "sprite",
            id: body.spriteId,
            // The sprite is named after its file, not the form name.
            name: payload.name.replace(/\.png$/, ""),
        });
    },
);

Then(
    "the library sprite imported through the ticket should exist",
    async ({ page }) => {
        const imported = getScenarioState(page).getCustom<any>(LAST_IMPORT_KEY);
        const response = await page.request.get(
            `${API_BASE}/sprites/${imported.id}`,
        );
        await expectOk(response, "The imported sprite could not be read");
        expect((await response.json()).name).toBe(imported.name);
    },
);

When(
    "an agent imports an environment map through an upload ticket",
    async ({ page }) => {
        const ticket = await requestTicket(page, "EnvironmentMap");
        const payload = createUniqueSolidHdrPayload({
            filenamePrefix: "batch3env",
            width: 64,
            height: 32,
        });
        const name = unique("Batch3 Env");
        const body = await uploadWithTicket(
            page,
            ticket,
            `/environment-maps/with-file?name=${encodeURIComponent(name)}`,
            {
                file: {
                    name: payload.name,
                    mimeType: payload.mimeType,
                    buffer: payload.buffer,
                },
            },
        );
        getScenarioState(page).setCustom(LAST_IMPORT_KEY, {
            family: "environment map",
            id: body.environmentMapId,
            name,
        });
    },
);

Then(
    "the library environment map imported through the ticket should exist",
    async ({ page }) => {
        const imported = getScenarioState(page).getCustom<any>(LAST_IMPORT_KEY);
        const response = await page.request.get(
            `${API_BASE}/environment-maps/${imported.id}`,
        );
        await expectOk(
            response,
            "The imported environment map could not be read",
        );
        expect((await response.json()).name).toBe(imported.name);
    },
);

When(
    "an agent imports a texture set through an upload ticket",
    async ({ page }) => {
        const ticket = await requestTicket(page, "TextureSet");
        const payload = createUniqueSolidPngPayload({
            filenamePrefix: "batch3tex",
            width: 16,
            height: 16,
        });
        const body = await uploadWithTicket(
            page,
            ticket,
            "/texture-sets/with-file",
            {
                file: {
                    name: payload.name,
                    mimeType: payload.mimeType,
                    buffer: payload.buffer,
                },
                textureType: "Albedo",
                kind: "Universal",
            },
        );
        getScenarioState(page).setCustom(LAST_IMPORT_KEY, {
            family: "texture set",
            id: body.textureSetId,
            name: payload.name.replace(/\.png$/, ""),
        });
    },
);

Then(
    "the library texture set imported through the ticket should exist",
    async ({ page }) => {
        const imported = getScenarioState(page).getCustom<any>(LAST_IMPORT_KEY);
        const response = await page.request.get(
            `${API_BASE}/texture-sets/${imported.id}`,
        );
        await expectOk(response, "The imported texture set could not be read");
        expect((await response.json()).name).toBe(imported.name);
    },
);

// ---- Path refusal ---------------------------------------------------------------

When(
    "an agent calls {string} with an unreadable server path",
    async ({ page }, tool: string) => {
        const args: Record<string, unknown> = {
            path: "/no/such/batch3-file.bin",
            name: "Batch3 Unreadable",
        };
        if (tool === "import_texture_set") {
            args.channels = [
                { path: "/no/such/batch3-file.png", textureType: "Albedo" },
            ];
        }
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (await mcp(page)).callTool(tool, {
                idempotencyKey: McpClient.key(tool),
                ...args,
            }),
        );
    },
);

Then("the agent should be told the path was not found", async ({ page }) => {
    expect(lastResult(page).error, JSON.stringify(lastResult(page))).toBe(
        "PathNotFound",
    );
});

// ---- Import suggestions ---------------------------------------------------------

Then(
    "the import suggestions should offer a category for that model",
    async ({ page }) => {
        const model = lastModel(page);
        // The automation runs after the upload commits, so wait for its
        // suggestion rather than racing it.
        await expect
            .poll(
                async () => {
                    const response = await page.request.get(
                        `${API_BASE}/metadata/import-suggestions?pageSize=200`,
                    );
                    if (!response.ok()) {
                        return null;
                    }
                    const body = await response.json();
                    return (
                        body.items?.find(
                            (item: { modelId: number }) =>
                                item.modelId === model.id,
                        )?.categoryName ?? null
                    );
                },
                {
                    message: `Waiting for the import suggestion for model ${model.id}`,
                    timeout: 30000,
                    intervals: [500, 1000, 2000],
                },
            )
            .not.toBeNull();
        const body = await (
            await page.request.get(
                `${API_BASE}/metadata/import-suggestions?pageSize=200`,
            )
        ).json();
        model.categoryName = body.items.find(
            (item: { modelId: number }) => item.modelId === model.id,
        )?.categoryName;
    },
);

When(
    "an agent rejects the import suggestions for that model",
    async ({ page }) => {
        const result = await callTool(page, "review_import_suggestions", {
            accept: false,
            modelIds: [lastModel(page).id],
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        expect(result.categoriesCleared).toBeGreaterThanOrEqual(1);
    },
);

Then(
    "the import suggestions should no longer offer that model",
    async ({ page }) => {
        await expect
            .poll(
                async () => {
                    const response = await page.request.get(
                        `${API_BASE}/metadata/import-suggestions?pageSize=200`,
                    );
                    if (!response.ok()) {
                        return "http " + response.status();
                    }
                    const body = await response.json();
                    return body.items?.some(
                        (item: { modelId: number }) =>
                            item.modelId === lastModel(page).id,
                    )
                        ? "present"
                        : "gone";
                },
                {
                    message: "Waiting for the import suggestion to settle",
                    timeout: 15000,
                    intervals: [500, 1000],
                },
            )
            .toBe("gone");
    },
);

Then("that model should have no category", async ({ page }) => {
    const response = await page.request.get(
        `${API_BASE}/metadata/Model/${lastModel(page).id}`,
    );
    await expectOk(response, "The model metadata could not be read");
    const category = (await response.json()).fields.find(
        (field: { key: string }) => field.key === "category",
    );
    expect(category?.value ?? null).toBeNull();
});

// ---- The review banner and dialog ----------------------------------------------

When("I open the model list", async ({ page }) => {
    await new ModelListPage(page).goto();
});

Then(
    "the import suggestions banner should be visible",
    async ({ page }) => {
        await expect(page.locator(".import-suggestions-banner")).toBeVisible({
            timeout: 15000,
        });
    },
);

When("I open the import suggestions review", async ({ page }) => {
    await page
        .locator(".import-suggestions-banner")
        .getByRole("button", { name: "Review" })
        .click();
});

Then("the review dialog should offer that model", async ({ page }) => {
    const dialog = page.getByRole("dialog", {
        name: "Review automatic categories",
    });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(
        dialog.getByText(lastModel(page).name, { exact: true }),
    ).toBeVisible({ timeout: 15000 });
});

When("I keep that suggestion in the dialog", async ({ page }) => {
    const dialog = page.getByRole("dialog", {
        name: "Review automatic categories",
    });
    // Select only our row, so the settle never touches another scenario's queue.
    await dialog
        .locator(`label[for="import-suggestion-${lastModel(page).id}"]`)
        .click();
    const settled = page.waitForResponse(
        (response) =>
            response.url().includes("/metadata/import-suggestions/review") &&
            response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Keep selected" }).click();
    expect((await settled).ok()).toBeTruthy();
});

Then(
    "that model should keep its automatic category",
    async ({ page }) => {
        const response = await page.request.get(
            `${API_BASE}/metadata/Model/${lastModel(page).id}`,
        );
        await expectOk(response, "The model metadata could not be read");
        const category = (await response.json()).fields.find(
            (field: { key: string }) => field.key === "category",
        );
        expect(category?.value?.name ?? category?.value ?? null).toBe(
            lastModel(page).categoryName,
        );
    },
);

// ---- Structured metadata --------------------------------------------------------

When(
    "an agent sets structured metadata on that model",
    async ({ page }) => {
        const result = await callTool(page, "set_asset_metadata", {
            assetType: "Model",
            assetId: lastModel(page).id,
            fields: {
                license: "CC0",
                author: "Batch3 Author",
                styles: ["Low Poly"],
                description: "Batch3 authored description",
            },
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then("the metadata schema should describe the license field", async ({ page }) => {
    const result = await (await mcp(page)).callTool("get_metadata_schema", {
        assetType: "Model",
    });
    const family = (result.families ?? []).find(
        (candidate: { assetType: string }) => candidate.assetType === "Model",
    );
    const license = (family?.fields ?? []).find(
        (field: { key: string }) => field.key === "license",
    );
    expect(license, JSON.stringify(result)).toBeTruthy();
    expect(license.readOnly).toBe(false);
    expect(license.allowedValues ?? license.values ?? []).toContain("CC0");
});

Then(
    "that model's metadata should carry the structured fields",
    async ({ page }) => {
        const result = await (await mcp(page)).callTool("get_asset_metadata", {
            assetType: "Model",
            assetId: lastModel(page).id,
        });
        const field = (key: string) =>
            result.fields.find((candidate: { key: string }) => candidate.key === key)
                ?.value;
        expect(field("license")).toBe("CC0");
        expect(field("author")).toBe("Batch3 Author");
        expect(field("styles")).toContain("Low Poly");
        expect(field("description")).toBe("Batch3 authored description");
    },
);

When(
    "an agent annotates that model with a different description and tags",
    async ({ page }) => {
        const result = await callTool(page, "annotate_asset", {
            assetType: "Model",
            assetId: lastModel(page).id,
            description: "This annotation must not replace the authored text",
            tags: ["batch3-annotation-tag"],
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        expect(result.descriptionWritten).toBe(false);
        expect(result.tagsWritten).toBe(true);
    },
);

Then("that model should keep the authored description", async ({ page }) => {
    const result = await (await mcp(page)).callTool("get_asset_metadata", {
        assetType: "Model",
        assetId: lastModel(page).id,
    });
    const description = result.fields.find(
        (field: { key: string }) => field.key === "description",
    )?.value;
    expect(description).toBe("Batch3 authored description");
});

Then("that model should carry the annotation tags", async ({ page }) => {
    const result = await (await mcp(page)).callTool("get_asset_metadata", {
        assetType: "Model",
        assetId: lastModel(page).id,
    });
    const tags = result.fields.find(
        (field: { key: string }) => field.key === "tags",
    )?.value;
    expect(tags).toContain("batch3-annotation-tag");
});

// ---- set_tags / set_category ----------------------------------------------------

When(
    "an agent sets that model's tags to {string}",
    async ({ page }, tags: string) => {
        const result = await callTool(page, "set_tags", {
            modelId: lastModel(page).id,
            tags: tags.split(",").map((tag) => tag.trim()),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "that model should store the tags {string}",
    async ({ page }, tags: string) => {
        const response = await page.request.get(
            `${API_BASE}/models/${lastModel(page).id}`,
        );
        await expectOk(response, "The model could not be read");
        expect((await response.json()).tags).toEqual(
            tags.split(",").map((tag) => tag.trim()),
        );
    },
);

When(
    "an agent sets that model's category to the batch3 category",
    async ({ page }) => {
        const category = getScenarioState(page).getCustom<{
            id: number;
            name: string;
        }>(CATEGORY_KEY);
        expect(category, "No batch3 category was provisioned").toBeTruthy();
        const result = await callTool(page, "set_category", {
            modelId: lastModel(page).id,
            categoryId: category!.id,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "that model should be filed under the batch3 category",
    async ({ page }) => {
        const category = getScenarioState(page).getCustom<{
            id: number;
            name: string;
        }>(CATEGORY_KEY);
        const response = await page.request.get(
            `${API_BASE}/models/${lastModel(page).id}`,
        );
        await expectOk(response, "The model could not be read");
        expect((await response.json()).category?.name).toBe(category!.name);
    },
);

// ---- The metadata panel ---------------------------------------------------------

When(
    "I open the metadata panel for that model",
    async ({ page }) => {
        const model = lastModel(page);
        const listPage = new ModelListPage(page);
        await listPage.goto();
        // The grid is virtualised: reveal the card (scroll + reload retries)
        // instead of asserting on the first render.
        await listPage.expectModelVisible(model.name, model.id);
        const card = listPage.getModelCard(model.name, model.id);
        await card.click();
        await waitForModelViewerCanvas(page, { timeout: 30000 });
        await new ModelViewerPage(page).openTab(
            "Metadata",
            '[data-testid="asset-metadata"]',
        );
        await expect(page.locator('[data-testid="asset-metadata"]')).toBeVisible({
            timeout: 15000,
        });
    },
);

When(
    "I set the metadata license to {string} and save",
    async ({ page }, license: string) => {
        const model = lastModel(page);
        await page.selectOption("#metadata-license", license);
        const saved = page.waitForResponse(
            (response) =>
                response.url().includes(`/metadata/Model/${model.id}`) &&
                response.request().method() === "PATCH",
        );
        await page.getByTestId("asset-metadata-save").click();
        expect((await saved).ok()).toBeTruthy();
    },
);

Then(
    "the API should store that model's license as {string}",
    async ({ page }, license: string) => {
        await expect
            .poll(
                async () => {
                    const response = await page.request.get(
                        `${API_BASE}/metadata/Model/${lastModel(page).id}`,
                    );
                    if (!response.ok()) {
                        return null;
                    }
                    return (await response.json()).fields.find(
                        (field: { key: string }) => field.key === "license",
                    )?.value;
                },
                {
                    message: "Waiting for the saved license",
                    timeout: 15000,
                    intervals: [500, 1000],
                },
            )
            .toBe(license);
    },
);

// ---- compute_on_demand / trigger_rederive ---------------------------------------

When(
    "an agent asks for the surface-area metric of an unknown geometry",
    async ({ page }) => {
        const result = await (await mcp(page)).callTool("compute_on_demand", {
            geometryHash: `batch3-unknown-${token()}`,
            metric: "surface-area",
        });
        getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    },
);

Then("the compute result should be pending", async ({ page }) => {
    expect(lastResult(page).status).toBe("pending");
});

When(
    "an agent asks for the UV-overlap metric of that geometry",
    async ({ page }) => {
        const result = await (await mcp(page)).callTool("compute_on_demand", {
            geometryHash: `batch3-unknown-${token()}`,
            metric: "uv-overlap",
        });
        getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    },
);

Then(
    "the compute tool should say the metric depends on the UV layout",
    async ({ page }) => {
        const result = lastResult(page);
        expect(result.status).toBe("unavailable");
        expect(result.message).toContain("UV layout");
    },
);

When(
    "an agent triggers a re-derivation of that model",
    async ({ page }) => {
        const idempotencyKey = McpClient.key("trigger-rederive");
        const result = await (
            await mcp(page)
        ).callTool("trigger_rederive", {
            assetType: "Model",
            assetId: lastModel(page).id,
            idempotencyKey,
        });
        getScenarioState(page).setCustom(REDERIVE_KEY, { idempotencyKey });
        getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    },
);

Then(
    "the re-derivation should be queued with a job id",
    async ({ page }) => {
        const result = lastResult(page);
        expect(result.status, JSON.stringify(result)).toBe("ok");
        expect(result.jobId).toBeGreaterThan(0);
    },
);

When(
    "an agent triggers the same re-derivation with the same key",
    async ({ page }) => {
        const write = getScenarioState(page).getCustom<{
            idempotencyKey: string;
        }>(REDERIVE_KEY);
        const result = await (
            await mcp(page)
        ).callTool("trigger_rederive", {
            assetType: "Model",
            assetId: lastModel(page).id,
            idempotencyKey: write!.idempotencyKey,
        });
        getScenarioState(page).setCustom(LAST_RESULT_KEY, result);
    },
);

Then(
    "the re-derivation should report it was already applied",
    async ({ page }) => {
        expect(lastResult(page).status).toBe("already-applied");
    },
);
