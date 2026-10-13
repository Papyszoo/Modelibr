import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import crypto from "crypto";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

const MCP_KEY = "undo:mcp";
const LAST_RESULT_KEY = "undo:last-result";
const LAST_WRITE_KEY = "undo:last-write";
const MODEL_KEY = "undo:model";
const PACK_KEY = "undo:pack";
const CATEGORY_KEY = "undo:category";

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

async function readModel(page: Page, modelId: number): Promise<any> {
    const response = await page.request.get(`${API_BASE}/models/${modelId}`);
    await expectOk(response, "The model could not be read");
    return response.json();
}

async function sceneNamed(
    page: Page,
    name: string,
): Promise<{ id: number } | null> {
    const listed = await page.request.get(`${API_BASE}/scenes`);
    await expectOk(listed, "The scenes could not be listed");
    const { scenes } = await listed.json();
    return (
        scenes.find((scene: { name: string }) => scene.name === name) ?? null
    );
}

// ---- Provisioning -----------------------------------------------------------------

Given("a reversible model exists", async ({ page }) => {
    const filePath = await UniqueFileGenerator.generate("test-cube.glb", {
        uniqueFilename: true,
    });
    const uploaded = await apiHelper.uploadModel(filePath);
    const detail = await page.request.get(`${API_BASE}/models/${uploaded.id}`);
    await expectOk(detail, "The uploaded model could not be read back");
    const versions = await page.request.get(
        `${API_BASE}/models/${uploaded.id}/versions`,
    );
    await expectOk(versions, "The model versions could not be read");
    getScenarioState(page).setCustom(MODEL_KEY, {
        id: uploaded.id,
        name: String((await detail.json()).name),
        versionId: Number((await versions.json())[0].id),
    });
});

Given("a model category {string} exists", async ({ page }, prefix: string) => {
    const created = await apiHelper.createModelCategory(unique(prefix));
    getScenarioState(page).setCustom(CATEGORY_KEY, created);
});

Given("a pack {string} exists", async ({ page }, prefix: string) => {
    const created = await apiHelper.createPack(unique(prefix));
    getScenarioState(page).setCustom(PACK_KEY, created);
});

// ---- Reversing an ordinary write ---------------------------------------------------

When("an agent sets the reversible model's tags to {string}", async ({ page }, tags: string) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const idempotencyKey = McpClient.key("undo-set-tags");
    const result = await (
        await mcp(page)
    ).callTool("set_asset_metadata", {
        assetType: "Model",
        assetId: model!.id,
        fields: { tags: tags.split(",").map((tag) => tag.trim()) },
        idempotencyKey,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
});

Then("the reversible model should store the tags {string}", async ({ page }, tags: string) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const stored = await readModel(page, model!.id);
    expect(stored.tags).toEqual(
        tags.split(",").map((tag) => tag.trim()),
    );
});

Then("the reversible model should have no tags", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const stored = await readModel(page, model!.id);
    expect(stored.tags ?? []).toEqual([]);
});

When("an agent sets the reversible model's category to {string}", async ({ page }, category: string) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const created = getScenarioState(page).getCustom<{ id: number; name: string }>(
        CATEGORY_KEY,
    );
    expect(created, "No model category was provisioned").toBeTruthy();
    const idempotencyKey = McpClient.key("undo-set-category");
    const result = await (
        await mcp(page)
    ).callTool("set_asset_metadata", {
        assetType: "Model",
        assetId: model!.id,
        fields: { category: created!.id },
        idempotencyKey,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
});

Then("the reversible model should be in the provisioned category", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const created = getScenarioState(page).getCustom<{ id: number; name: string }>(
        CATEGORY_KEY,
    );
    const stored = await readModel(page, model!.id);
    expect(stored.category?.name).toBe(created!.name);
});

Then("the reversible model should have no category", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const stored = await readModel(page, model!.id);
    expect(stored.category ?? null).toBeNull();
});

When("an agent creates a non-reversible material", async ({ page }) => {
    // create_material records an operation but the reverser defines no inverse
    // for it, which is exactly the case this scenario checks is reported rather
    // than claimed as reversed.
    const idempotencyKey = McpClient.key("undo-material");
    const result = await (
        await mcp(page)
    ).callTool("create_material", {
        name: unique("Undo Material"),
        baseColorHex: "#101010",
        idempotencyKey,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
});

When("an agent creates a scene {string}", async ({ page }, prefix: string) => {
    const name = unique(prefix);
    const idempotencyKey = McpClient.key("undo-create-scene");
    const result = await (
        await mcp(page)
    ).callTool("create_scene", { name, idempotencyKey });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
    getScenarioState(page).setCustom("undo:scene-name", name);
});

Given("an undo scene exists", async ({ page }) => {
    const name = unique("Undo Scene");
    const created = await page.request.post(`${API_BASE}/scenes`, {
        data: { name, description: "Agent undo coverage" },
    });
    await expectOk(created, "The undo scene could not be created");
    const view = await created.json();
    getScenarioState(page).setCustom("undo:scene", {
        id: view.scene.id,
        name: view.scene.name,
    });
});

When(
    "an agent places the reversible model into the undo scene",
    async ({ page }) => {
        const model = getScenarioState(page).getCustom<{
            id: number;
            versionId: number;
        }>(MODEL_KEY);
        const scene = getScenarioState(page).getCustom<{ id: number }>(
            "undo:scene",
        );
        expect(scene, "No undo scene was provisioned").toBeTruthy();
        const idempotencyKey = McpClient.key("undo-place-asset");
        const result = await (
            await mcp(page)
        ).callTool("place_asset", {
            sceneId: scene!.id,
            assetType: "Model",
            assetId: model!.id,
            versionId: model!.versionId,
            idempotencyKey,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
    },
);

Then("the undo scene should hold {int} node(s)", async ({ page }, count: number) => {
    const scene = getScenarioState(page).getCustom<{ id: number }>("undo:scene");
    const response = await page.request.get(`${API_BASE}/scenes/${scene!.id}`);
    await expectOk(response, "The undo scene could not be read");
    const view = await response.json();
    expect((view.document?.nodes ?? []).length).toBe(count);
});

Then("the agent-created scene should exist", async ({ page }) => {
    const name = getScenarioState(page).getCustom<string>("undo:scene-name");
    expect(await sceneNamed(page, name!)).toBeTruthy();
});

Then("the agent-created scene should not exist", async ({ page }) => {
    const name = getScenarioState(page).getCustom<string>("undo:scene-name");
    expect(await sceneNamed(page, name!)).toBeNull();
});

When("an agent adds the reversible model to the pack", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const pack = getScenarioState(page).getCustom<{ id: number }>(PACK_KEY);
    expect(pack, "No pack was provisioned").toBeTruthy();
    const idempotencyKey = McpClient.key("undo-add-to-pack");
    const result = await (
        await mcp(page)
    ).callTool("add_to_pack", {
        packId: pack!.id,
        modelId: model!.id,
        idempotencyKey,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
});

Then("the pack should contain the reversible model", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const pack = getScenarioState(page).getCustom<{ id: number }>(PACK_KEY);
    const members = await apiHelper.getModelsByPack(pack!.id);
    expect(members.map((member: { id: number }) => member.id)).toContain(
        model!.id,
    );
});

Then("the pack should not contain the reversible model", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const pack = getScenarioState(page).getCustom<{ id: number }>(PACK_KEY);
    const members = await apiHelper.getModelsByPack(pack!.id);
    expect(members.map((member: { id: number }) => member.id)).not.toContain(
        model!.id,
    );
});

When("an agent reverses the last undo write", async ({ page }) => {
    const write = getScenarioState(page).getCustom<{ idempotencyKey: string }>(
        LAST_WRITE_KEY,
    );
    expect(write, "No undoable write was captured").toBeTruthy();
    const result = await (
        await mcp(page)
    ).callTool("reverse_operation", {
        idempotencyKey: write!.idempotencyKey,
        dryRun: false,
    });
    expect(result.status, JSON.stringify(result)).toBe("reversed");
});

When("an agent asks to reverse the last undo write", async ({ page }) => {
    const write = getScenarioState(page).getCustom<{ idempotencyKey: string }>(
        LAST_WRITE_KEY,
    );
    expect(write, "No write was captured").toBeTruthy();
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (
            await mcp(page)
        ).callTool("reverse_operation", {
            idempotencyKey: write!.idempotencyKey,
            dryRun: false,
        }),
    );
});

Then("the reversal should report that no inverse exists", async ({ page }) => {
    const result = lastResult(page);
    expect(result.status, JSON.stringify(result)).not.toBe("reversed");
    const step = (result.steps ?? []).find(
        (candidate: { reversed: boolean }) => candidate.reversed === false,
    );
    expect(step, JSON.stringify(result)).toBeTruthy();
});

// ---- restore_asset and delete_asset -------------------------------------------------

When("the reversible model is recycled through the app", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    await apiHelper.softDeleteModel(model!.id);
});

Then("the reversible model should be in the recycle bin", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const response = await page.request.get(`${API_BASE}/recycled`);
    await expectOk(response, "The recycle bin could not be read");
    const recycled = await response.json();
    expect(
        (recycled.models ?? []).map((entry: { id: number }) => entry.id),
        JSON.stringify(recycled.models),
    ).toContain(model!.id);
});

When("an agent restores the reversible model", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const result = await (
        await mcp(page)
    ).callTool("restore_asset", {
        assetType: "Model",
        assetId: model!.id,
        idempotencyKey: McpClient.key("undo-restore"),
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    expect(result.restored).toBe(true);
});

Then("the reversible model should be back in the library", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    const detail = await page.request.get(`${API_BASE}/models/${model!.id}`);
    await expectOk(detail, "The restored model could not be read");
    const response = await page.request.get(`${API_BASE}/recycled`);
    await expectOk(response, "The recycle bin could not be read");
    const recycled = await response.json();
    expect(
        (recycled.models ?? []).map((entry: { id: number }) => entry.id),
    ).not.toContain(model!.id);
});

When("an agent asks to delete the reversible model", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (
            await mcp(page)
        ).callTool("delete_asset", {
            assetType: "Model",
            assetId: model!.id,
            idempotencyKey: McpClient.key("undo-delete-dry"),
        }),
    );
});

Then("the agent should be told it would recycle the model", async ({ page }) => {
    const result = lastResult(page);
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    expect(result.status, JSON.stringify(result)).toBe("dry-run");
    expect(result.wouldDelete.assetId).toBe(model!.id);
});

When("an agent deletes the reversible model for real", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (
            await mcp(page)
        ).callTool("delete_asset", {
            assetType: "Model",
            assetId: model!.id,
            dryRun: false,
            idempotencyKey: McpClient.key("undo-delete-real"),
        }),
    );
});

Then(
    "the agent should be told destructive work is disabled",
    async ({ page }) => {
        expect(lastResult(page).error).toBe("DestructiveDisabled");
    },
);
