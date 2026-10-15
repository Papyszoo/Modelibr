import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import crypto from "crypto";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { navigateToAppClean, openTabViaMenu } from "../helpers/navigation-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

const MCP_KEY = "materials:mcp";
const LAST_RESULT_KEY = "materials:last-result";
const MATERIAL_ID_KEY = "materials:material-id";
const TEXTURE_SET_KEY = "materials:texture-set";
const MODEL_KEY = "materials:model";
const SCENE_KEY = "materials:scene";
const NAMES_KEY = "materials:names";

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

/**
 * The real name behind a Gherkin alias. Names carry a per-scenario suffix so
 * two workers running the same scenario cannot collide on one library row - and
 * so a rename in one worker cannot make another worker's material disappear.
 */
function name(page: Page, kind: string, alias: string): string {
    const state = getScenarioState(page);
    const names =
        state.getCustom<Record<string, string>>(NAMES_KEY) ?? {};
    const key = `${kind}:${alias}`;
    if (!names[key]) {
        names[key] = `${alias} ${crypto.randomUUID().slice(0, 8)}`;
        state.setCustom(NAMES_KEY, names);
    }
    return names[key];
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

async function listMaterials(page: Page): Promise<any[]> {
    const response = await page.request.get(`${API_BASE}/materials`);
    await expectOk(response, "The materials could not be listed");
    return (await response.json()).materials;
}

async function materialNamed(page: Page, name: string): Promise<any> {
    const material = (await listMaterials(page)).find(
        (candidate: { name: string }) => candidate.name === name,
    );
    return material ?? null;
}

function materialTile(page: Page, materialId: number) {
    return page.locator(
        `[data-testid="material-tile"][data-material-id="${materialId}"]`,
    );
}

/** "#B5892B" -> "rgb(181, 137, 43)", the form toHaveCSS reports. */
function rgbOf(hex: string): string {
    const value = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((index) =>
        parseInt(value.slice(index, index + 2), 16),
    );
    return `rgb(${r}, ${g}, ${b})`;
}

/** Uploads a model and returns its id, name and active version id. */
async function uploadModel(
    page: Page,
): Promise<{ id: number; name: string; versionId: number }> {
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
    return {
        id: uploaded.id,
        name: String((await detail.json()).name),
        versionId: Number((await versions.json())[0].id),
    };
}

// ---- The PBR Materials page -------------------------------------------------------

When("I am on the PBR materials page", async ({ page }) => {
    await navigateToAppClean(page);
    await openTabViaMenu(page, "pbrMaterials", "left");
    await expect(page.getByTestId("material-list")).toBeVisible({
        timeout: 20000,
    });
});

When(
    "I create the PBR material {string} with colour {string}",
    async ({ page }, alias: string, hex: string) => {
        const created = name(page, "material", alias);
        await page.getByTestId("material-list-new").click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await page.getByTestId("material-name-input").fill(created);
        // A native colour input cannot be typed into; set the value and let the
        // change reach React's onChange the way the picker would.
        await page.getByTestId("material-base-color").evaluate((element, value) => {
            const input = element as HTMLInputElement;
            // React tracks the last value it wrote; going through the native
            // setter makes the assignment visible to its onChange.
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value",
            )!.set!;
            setter.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }, hex);
        const posted = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname === "/materials" &&
                response.request().method() === "POST",
            { timeout: 15000 },
        );
        await page.getByTestId("material-editor-save").click();
        expect((await posted).ok()).toBeTruthy();
        await expect(dialog).toBeHidden({ timeout: 15000 });
    },
);

Then(
    "the PBR material {string} should be listed",
    async ({ page }, alias: string) => {
        const actual = name(page, "material", alias);
        const material = await materialNamed(page, actual);
        expect(material, `No material named "${actual}" is stored`).toBeTruthy();
        await expect(materialTile(page, material.id)).toBeVisible({
            timeout: 15000,
        });
    },
);

Then(
    "the PBR material {string} should show a {string} swatch",
    async ({ page }, alias: string, hex: string) => {
        const actual = name(page, "material", alias);
        const material = await materialNamed(page, actual);
        expect(material, `No material named "${actual}" is stored`).toBeTruthy();
        const tile = materialTile(page, material.id);
        await expect(tile).toBeVisible({ timeout: 15000 });
        await expect(
            tile
                .getByTestId("material-swatch")
                .locator(".material-swatch-sphere"),
        ).toHaveCSS("background-color", rgbOf(hex));
    },
);

Then(
    "the API should store the PBR material {string} with colour {string} and roughness {float}",
    async ({ page }, alias: string, hex: string, roughness: number) => {
        const actual = name(page, "material", alias);
        const material = await materialNamed(page, actual);
        expect(material, `No material named "${actual}" is stored`).toBeTruthy();
        expect(material.parameters.baseColorHex).toBe(hex);
        expect(material.parameters.roughness).toBeCloseTo(roughness, 2);
    },
);

Given(
    "a materials PBR material named {string} exists",
    async ({ page }, alias: string) => {
        const actual = name(page, "material", alias);
        if (await materialNamed(page, actual)) {
            return;
        }
        const created = await page.request.post(`${API_BASE}/materials`, {
            data: {
                name: actual,
                parameters: { baseColorHex: "#556677", roughness: 0.6 },
            },
        });
        await expectOk(created, `The material "${actual}" was not created`);
    },
);

When(
    "I edit the PBR material {string} to {string}",
    async ({ page }, fromAlias: string, toAlias: string) => {
        const from = name(page, "material", fromAlias);
        const to = name(page, "material", toAlias);
        const material = await materialNamed(page, from);
        expect(material, `No material named "${from}" is stored`).toBeTruthy();
        await materialTile(page, material.id).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await page.getByTestId("material-name-input").fill(to);
        const updated = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname ===
                    `/materials/${material.id}` &&
                response.request().method() === "PUT",
            { timeout: 15000 },
        );
        await page.getByTestId("material-editor-save").click();
        expect((await updated).ok()).toBeTruthy();
        await expect(dialog).toBeHidden({ timeout: 15000 });
    },
);

// ---- Materials over MCP -------------------------------------------------------------

When(
    "an agent creates a PBR material {string} with colour {string}",
    async ({ page }, alias: string, hex: string) => {
        const actual = name(page, "material", alias);
        const result = await (
            await mcp(page)
        ).callTool("create_material", {
            name: actual,
            baseColorHex: hex,
            roughness: 0.35,
            idempotencyKey: McpClient.key("mcp-material"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(MATERIAL_ID_KEY, result.materialId);
    },
);

When("an agent reads the created material over MCP", async ({ page }) => {
    const materialId = getScenarioState(page).getCustom<number>(
        MATERIAL_ID_KEY,
    );
    expect(materialId, "No material was created over MCP").toBeTruthy();
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (await mcp(page)).callTool("get_material", { materialId }),
    );
});

Then(
    "the MCP material should be named {string} with colour {string}",
    async ({ page }, alias: string, hex: string) => {
        const material = lastResult(page);
        expect(material.error, JSON.stringify(material)).toBeUndefined();
        expect(material.name).toBe(name(page, "material", alias));
        expect(material.parameters.baseColorHex).toBe(hex);
    },
);

When("an agent lists the material library over MCP", async ({ page }) => {
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (await mcp(page)).callTool("list_materials", {}),
    );
});

Then(
    "the MCP material library should include {string} as a {string}",
    async ({ page }, alias: string, kind: string) => {
        const actual = name(page, "material", alias);
        const entry = (lastResult(page).entries ?? []).find(
            (candidate: { name: string; kind: string }) =>
                candidate.name === actual && candidate.kind === kind,
        );
        expect(entry, JSON.stringify(lastResult(page))).toBeTruthy();
    },
);

Then(
    "the MCP material library should include the texture set {string} as a {string}",
    async ({ page }, alias: string, kind: string) => {
        const actual = name(page, "texture-set", alias);
        const entry = (lastResult(page).entries ?? []).find(
            (candidate: { name: string; kind: string }) =>
                candidate.name === actual && candidate.kind === kind,
        );
        expect(entry, JSON.stringify(lastResult(page))).toBeTruthy();
    },
);

Given(
    "a universal texture set named {string} exists",
    async ({ page }, alias: string) => {
        const actual = name(page, "texture-set", alias);
        const created = await apiHelper.createTextureSetWithKind(actual, 1);
        getScenarioState(page).setCustom(TEXTURE_SET_KEY, {
            id: created.id,
            name: actual,
        });
    },
);

When(
    "an agent updates the created material to colour {string}",
    async ({ page }, hex: string) => {
        const materialId = getScenarioState(page).getCustom<number>(
            MATERIAL_ID_KEY,
        );
        const result = await (
            await mcp(page)
        ).callTool("update_material", {
            materialId,
            baseColorHex: hex,
            idempotencyKey: McpClient.key("mcp-update-material"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the MCP material should now have colour {string}",
    async ({ page }, hex: string) => {
        const materialId = getScenarioState(page).getCustom<number>(
            MATERIAL_ID_KEY,
        );
        const material = await (
            await mcp(page)
        ).callTool("get_material", { materialId });
        expect(material.parameters.baseColorHex).toBe(hex);
    },
);

// ---- apply_material: dressing a scene node ------------------------------------------

Given("a scene with a placed materials model exists", async ({ page }) => {
    const model = await uploadModel(page);
    const created = await page.request.post(`${API_BASE}/scenes`, {
        data: {
            name: `Materials Dressing ${crypto.randomUUID().slice(0, 8)}`,
            description: "MCP apply_material coverage",
        },
    });
    await expectOk(created, "The scene could not be created");
    const view = await created.json();
    const sceneId = view.scene.id;
    const nodeId = `materials-node-${crypto.randomUUID().slice(0, 8)}`;
    // A placed Model node has to pin its version; the server refuses one that
    // does not, so the active version is read back rather than assumed.
    const saved = await page.request.put(
        `${API_BASE}/scenes/${sceneId}/document`,
        {
            data: {
                documentJson: JSON.stringify({
                    ...view.document,
                    nodes: [
                        {
                            id: nodeId,
                            name: model.name,
                            transform: {
                                position: { x: 0, y: 0, z: 0 },
                                rotationEuler: { x: 0, y: 0, z: 0 },
                                scale: { x: 1, y: 1, z: 1 },
                            },
                            asset: {
                                assetType: "Model",
                                assetId: model.id,
                                versionId: model.versionId,
                            },
                            visible: true,
                        },
                    ],
                }),
            },
        },
    );
    await expectOk(saved, "The scene document could not be saved");
    getScenarioState(page).setCustom(SCENE_KEY, { sceneId, nodeId });
});

When(
    "an agent dresses the placed node with the created material",
    async ({ page }) => {
        const scene = getScenarioState(page).getCustom<{
            sceneId: number;
            nodeId: string;
        }>(SCENE_KEY);
        const materialId = getScenarioState(page).getCustom<number>(
            MATERIAL_ID_KEY,
        );
        expect(scene, "No scene was provisioned").toBeTruthy();
        expect(materialId, "No material was created").toBeTruthy();
        const idempotencyKey = McpClient.key("mcp-apply-material");
        const result = await (
            await mcp(page)
        ).callTool("apply_material", {
            sceneId: scene!.sceneId,
            nodeId: scene!.nodeId,
            materialId,
            idempotencyKey,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom("materials:last-write", {
            idempotencyKey,
        });
    },
);

Then(
    "the scene node should be dressed with the created material",
    async ({ page }) => {
        const scene = getScenarioState(page).getCustom<{
            sceneId: number;
            nodeId: string;
        }>(SCENE_KEY);
        const materialId = getScenarioState(page).getCustom<number>(
            MATERIAL_ID_KEY,
        );
        const response = await page.request.get(
            `${API_BASE}/scenes/${scene!.sceneId}`,
        );
        await expectOk(response, "The scene could not be read");
        const view = await response.json();
        const node = view.document.nodes.find(
            (candidate: { id: string }) => candidate.id === scene!.nodeId,
        );
        expect(node, "The placed node is missing from the scene").toBeTruthy();
        expect(node.material?.materialId).toBe(materialId);
    },
);

When("an agent reverses that material write", async ({ page }) => {
    const write = getScenarioState(page).getCustom<{ idempotencyKey: string }>(
        "materials:last-write",
    );
    expect(write, "No material write was captured").toBeTruthy();
    const result = await (
        await mcp(page)
    ).callTool("reverse_operation", {
        idempotencyKey: write!.idempotencyKey,
        dryRun: false,
    });
    expect(result.status, JSON.stringify(result)).toBe("reversed");
});

Then("the scene node should have no material binding", async ({ page }) => {
    const scene = getScenarioState(page).getCustom<{
        sceneId: number;
        nodeId: string;
    }>(SCENE_KEY);
    const response = await page.request.get(
        `${API_BASE}/scenes/${scene!.sceneId}`,
    );
    await expectOk(response, "The scene could not be read");
    const view = await response.json();
    const node = view.document.nodes.find(
        (candidate: { id: string }) => candidate.id === scene!.nodeId,
    );
    expect(node.material ?? null).toBeNull();
});

// ---- bind_texture_set ----------------------------------------------------------------

Given("a materials model exists", async ({ page }) => {
    getScenarioState(page).setCustom(MODEL_KEY, await uploadModel(page));
});

When(
    "an agent binds the universal texture set to the materials model",
    async ({ page }) => {
        const model = getScenarioState(page).getCustom<{ id: number }>(
            MODEL_KEY,
        );
        const textureSet = getScenarioState(page).getCustom<{ id: number }>(
            TEXTURE_SET_KEY,
        );
        expect(model, "No materials model was uploaded").toBeTruthy();
        expect(textureSet, "No universal texture set was provisioned").toBeTruthy();
        const result = await (
            await mcp(page)
        ).callTool("bind_texture_set", {
            textureSetId: textureSet!.id,
            modelId: model!.id,
            idempotencyKey: McpClient.key("mcp-bind-texture-set"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        expect(result.isDefault).toBe(true);
    },
);

Then(
    "the model's default texture set should be the universal texture set",
    async ({ page }) => {
        const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
        const textureSet = getScenarioState(page).getCustom<{ id: number }>(
            TEXTURE_SET_KEY,
        );
        const versions = await page.request.get(
            `${API_BASE}/models/${model!.id}/versions`,
        );
        await expectOk(versions, "The model versions could not be read");
        const defaults = (await versions.json()).map(
            (version: { defaultTextureSetId: number | null }) =>
                version.defaultTextureSetId,
        );
        expect(defaults).toContain(textureSet!.id);
    },
);

// ---- add_texture_channel -------------------------------------------------------------
//
// The tool reads a path the SERVER can see, and the E2E webapi runs in a
// container that shares no filesystem with the test host, so a successful add
// is not drivable here. What is checked is the contract the tool does enforce
// from this side: an unreadable path is reported, not silently ignored.

When(
    "an agent adds a texture channel from an unreadable path",
    async ({ page }) => {
        const textureSet = getScenarioState(page).getCustom<{ id: number }>(
            TEXTURE_SET_KEY,
        );
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("add_texture_channel", {
                textureSetId: textureSet!.id,
                path: "/nonexistent/modelibr-e2e-channel.png",
                textureType: "Normal",
                idempotencyKey: McpClient.key("mcp-add-channel"),
            }),
        );
    },
);

Then("the agent should be told the path is not readable", async ({ page }) => {
    expect(lastResult(page).error).toBe("PathNotFound");
});
