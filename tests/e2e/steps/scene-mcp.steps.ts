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

// ---- Scenario state -----------------------------------------------------------

const MCP_KEY = "scene-mcp:mcp";
const MODEL_KEY = "scene-mcp:model";
const SCENE_KEY = "scene-mcp:scene";
const NODE_KEY = "scene-mcp:node";
const SLOT_NODE_KEY = "scene-mcp:slot-node";
const LAST_RESULT_KEY = "scene-mcp:last-result";
const PROJECT_KEY = "scene-mcp:project";
const RENDER_KEY = "scene-mcp:render";

interface McpScene {
    id: number;
    name: string;
}

interface McpModel {
    id: number;
    name: string;
    versionId: number;
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

function scene(page: Page): McpScene {
    const found = getScenarioState(page).getCustom<McpScene>(SCENE_KEY);
    if (!found) {
        throw new Error(
            "No scene was created over MCP in this scenario - a Given that creates one is missing.",
        );
    }
    return found;
}

function model(page: Page): McpModel {
    const found = getScenarioState(page).getCustom<McpModel>(MODEL_KEY);
    if (!found) {
        throw new Error(
            'No "scene MCP model" was provisioned - the Background step is missing.',
        );
    }
    return found;
}

function nodeId(page: Page): string {
    const found = getScenarioState(page).getCustom<string>(NODE_KEY);
    if (!found) {
        throw new Error("No placed node was captured in this scenario.");
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

async function readScene(page: Page, id: number): Promise<any> {
    const response = await page.request.get(`${API_BASE}/scenes/${id}`);
    await expectOk(response, "The scene could not be read");
    return response.json();
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

// ---- Provisioning -------------------------------------------------------------

async function uploadModel(page: Page): Promise<McpModel> {
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
    const versionId = Number((await versions.json())[0].id);

    // Scene geometry checks (contact, containment, budget fit) are skipped for an
    // asset with no derived bounds, so the scenarios that exercise them must wait
    // for the processor to finish deriving this fresh upload. Nothing here renders;
    // this is the cheap bounds lookup the editor itself uses before a placement.
    await expect
        .poll(
            async () => {
                const response = await page.request.get(
                    `${API_BASE}/scenes/asset-facts?assetType=Model&assetId=${uploaded.id}&versionId=${versionId}`,
                );
                if (!response.ok()) {
                    return false;
                }
                return Boolean((await response.json()).sourceDimensions);
            },
            {
                message: `Waiting for model ${uploaded.id} to be derived`,
                timeout: 90000,
                intervals: [1000, 2000],
            },
        )
        .toBe(true);

    return {
        id: uploaded.id,
        name: String((await detail.json()).name),
        versionId,
    };
}

async function createScene(page: Page, prefix: string): Promise<McpScene> {
    const name = unique(prefix);
    const result = await (await mcp(page)).callTool("create_scene", {
        name,
        description: "Scene MCP tool coverage",
        idempotencyKey: McpClient.key("create-scene"),
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    const created = { id: Number(result.scene.id), name };
    getScenarioState(page).setCustom(SCENE_KEY, created);
    return created;
}

async function placeModel(page: Page, slotId?: string): Promise<any> {
    const current = model(page);
    const target = scene(page);
    const result = await callTool(page, "place_asset", {
        sceneId: target.id,
        assetType: "Model",
        assetId: current.id,
        versionId: current.versionId,
        ...(slotId ? { slotId } : {}),
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(NODE_KEY, result.node.nodeId);
    if (slotId) {
        getScenarioState(page).setCustom(SLOT_NODE_KEY, result.node.nodeId);
    }
    return result;
}

async function proposeTwo(page: Page, slotId: string): Promise<any> {
    const current = model(page);
    const target = scene(page);
    const proposal = (rationale: string) => ({
        assetType: "Model",
        assetId: current.id,
        versionId: current.versionId,
        rationale,
    });
    const result = await callTool(page, "propose_candidates", {
        sceneId: target.id,
        slotId,
        brief: "low-poly, reads as rundown",
        candidates: [
            proposal("closest to the brief"),
            proposal("cleaner, in case the brief is wrong"),
        ],
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    return result;
}

// ---- Background ---------------------------------------------------------------

Given("a scene MCP model exists", async ({ page }) => {
    getScenarioState(page).setCustom(MODEL_KEY, await uploadModel(page));
});

// ---- create_scene / list_scenes / get_scene -----------------------------------

When("an agent creates a scene over MCP", async ({ page }) => {
    await createScene(page, "Scene MCP");
});

Given("an agent-created scene exists", async ({ page }) => {
    await createScene(page, "Scene MCP");
});

Then("the MCP scene list should include that scene", async ({ page }) => {
    const result = await (await mcp(page)).callTool("list_scenes", {});
    const summary = (result.scenes ?? []).find(
        (candidate: { id: number }) => candidate.id === scene(page).id,
    );
    expect(summary, JSON.stringify(result)).toBeTruthy();
    expect(summary.name).toBe(scene(page).name);
    expect(typeof summary.nodeCount).toBe("number");
});

Then(
    "the MCP scene read should report that scene with {int} node(s)",
    async ({ page }, count: number) => {
        const result = await (await mcp(page)).callTool("get_scene", {
            sceneId: scene(page).id,
        });
        expect(result.error, JSON.stringify(result)).toBeUndefined();
        expect(result.scene.scene.id).toBe(scene(page).id);
        expect(result.scene.document.nodes ?? []).toHaveLength(count);
    },
);

// ---- place_asset / move_asset -------------------------------------------------

When("an agent places the scene MCP model in the scene", async ({ page }) => {
    await placeModel(page);
});

Then(
    "the scene should hold {int} node(s) over REST",
    async ({ page }, count: number) => {
        const view = await readScene(page, scene(page).id);
        expect(view.document.nodes ?? []).toHaveLength(count);
    },
);

Then("the MCP placement should pin the model's version", async ({ page }) => {
    const result = lastResult(page);
    const current = model(page);
    expect(result.node.asset.assetId).toBe(current.id);
    expect(result.node.asset.versionId).toBe(current.versionId);
});

When(
    "an agent moves the placed node to x {float}",
    async ({ page }, x: number) => {
        const result = await callTool(page, "move_asset", {
            sceneId: scene(page).id,
            nodeId: nodeId(page),
            position: [x, 0, 0],
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the scene's first node should sit at x {float} over REST",
    async ({ page }, x: number) => {
        const view = await readScene(page, scene(page).id);
        expect(view.document.nodes[0].transform.position.x).toBeCloseTo(x, 3);
    },
);

When(
    "an agent places a second model resting on the first",
    async ({ page }) => {
        const current = model(page);
        const result = await callTool(page, "place_asset", {
            sceneId: scene(page).id,
            assetType: "Model",
            assetId: current.id,
            versionId: current.versionId,
            nodeId: "on-top",
            on: nodeId(page),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(
            "scene-mcp:resting-node",
            result.node.nodeId,
        );
    },
);

Then(
    "the second node should rest on the first over REST",
    async ({ page }) => {
        const view = await readScene(page, scene(page).id);
        const restingId =
            getScenarioState(page).getCustom<string>("scene-mcp:resting-node");
        const resting = view.document.nodes.find(
            (candidate: { id: string }) => candidate.id === restingId,
        );
        expect(resting, JSON.stringify(view.document.nodes)).toBeTruthy();
        expect(resting.anchor?.onNodeId).toBe(nodeId(page));
    },
);

// ---- place_assets_batch -------------------------------------------------------

When("an agent places a batch of 2 models in the scene", async ({ page }) => {
    const current = model(page);
    const result = await callTool(page, "place_assets_batch", {
        sceneId: scene(page).id,
        placements: [
            {
                assetType: "Model",
                assetId: current.id,
                versionId: current.versionId,
                nodeId: "batch-a",
            },
            {
                assetType: "Model",
                assetId: current.id,
                versionId: current.versionId,
                nodeId: "batch-b",
            },
        ],
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
});

Then("the MCP batch should report {int} nodes", async ({ page }, count: number) => {
    expect(lastResult(page).nodes).toHaveLength(count);
});

// ---- distribute_assets --------------------------------------------------------

When(
    "an agent distributes {int} copies of the scene MCP model from x {float} to x {float}",
    async ({ page }, count: number, from: number, to: number) => {
        const current = model(page);
        const result = await callTool(page, "distribute_assets", {
            sceneId: scene(page).id,
            assetType: "Model",
            assetId: current.id,
            versionId: current.versionId,
            start: [from, 0, 0],
            end: [to, 0, 0],
            count,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the MCP distribution should report {int} nodes",
    async ({ page }, count: number) => {
        expect(lastResult(page).nodes).toHaveLength(count);
    },
);

Then(
    "the scene's nodes should sit at x {float}, {float} and {float}",
    async ({ page }, a: number, b: number, c: number) => {
        const view = await readScene(page, scene(page).id);
        const xs = view.document.nodes
            .map((node: { transform: { position: { x: number } } }) =>
                node.transform.position.x,
            )
            .sort((left: number, right: number) => left - right);
        expect(xs).toHaveLength(3);
        expect(xs[0]).toBeCloseTo(a, 3);
        expect(xs[1]).toBeCloseTo(b, 3);
        expect(xs[2]).toBeCloseTo(c, 3);
    },
);

// ---- place_primitive ----------------------------------------------------------

When("an agent places a {string} primitive", async ({ page }, shape: string) => {
    const result = await callTool(page, "place_primitive", {
        sceneId: scene(page).id,
        shape,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(NODE_KEY, result.node.nodeId);
});

Then(
    "the scene's first node should be a {string} primitive",
    async ({ page }, shape: string) => {
        expect(lastResult(page).node.primitive.shape).toBe(shape);
        const view = await readScene(page, scene(page).id);
        expect(view.document.nodes[0].primitive.shape).toBe(shape);
    },
);

// ---- create_room --------------------------------------------------------------

When(
    "an agent creates a room {float} by {float} by {float}",
    async ({ page }, width: number, depth: number, height: number) => {
        const result = await callTool(page, "create_room", {
            sceneId: scene(page).id,
            width,
            depth,
            height,
            nodeIdPrefix: "shell",
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then("the scene should hold the parts of a room", async ({ page }) => {
    const view = await readScene(page, scene(page).id);
    const ids = view.document.nodes.map((node: { id: string }) => node.id);
    for (const part of [
        "shell-floor",
        "shell-wall-north",
        "shell-wall-south",
        "shell-wall-west",
        "shell-wall-east",
    ]) {
        expect(ids, JSON.stringify(ids)).toContain(part);
    }
});

// ---- set_lighting_preset / set_light ------------------------------------------

When(
    "an agent applies the {string} lighting preset",
    async ({ page }, preset: string) => {
        const result = await callTool(page, "set_lighting_preset", {
            sceneId: scene(page).id,
            preset,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then("the scene should have a key light", async ({ page }) => {
    const view = await readScene(page, scene(page).id);
    const lights: Array<{ type: string }> = view.document.lights ?? [];
    expect(lights.length).toBeGreaterThan(0);
    expect(lights.some((light) => light.type !== "ambient")).toBe(true);
});

When(
    "an agent sets a {string} light named {string}",
    async ({ page }, type: string, name: string) => {
        const result = await callTool(page, "set_light", {
            sceneId: scene(page).id,
            lightId: name,
            type,
            intensity: 2,
            position: [2, 3, 2],
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the scene's light {string} should be a {string}",
    async ({ page }, name: string, type: string) => {
        const view = await readScene(page, scene(page).id);
        const light = (view.document.lights ?? []).find(
            (candidate: { id: string }) => candidate.id === name,
        );
        expect(light, JSON.stringify(view.document.lights)).toBeTruthy();
        expect(light.type).toBe(type);
    },
);

When(
    "an agent removes the light {string}",
    async ({ page }, name: string) => {
        const result = await callTool(page, "set_light", {
            sceneId: scene(page).id,
            lightId: name,
            remove: true,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the scene should have no light {string}",
    async ({ page }, name: string) => {
        const view = await readScene(page, scene(page).id);
        const light = (view.document.lights ?? []).find(
            (candidate: { id: string }) => candidate.id === name,
        );
        expect(light ?? null).toBeNull();
    },
);

// ---- remove_asset -------------------------------------------------------------

Given(
    "an agent-created scene with one placed model exists",
    async ({ page }) => {
        await createScene(page, "Scene MCP");
        await placeModel(page);
    },
);

When("an agent removes the placed node", async ({ page }) => {
    const result = await callTool(page, "remove_asset", {
        sceneId: scene(page).id,
        nodeId: nodeId(page),
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
});

Then("the MCP removal should report the removed node", async ({ page }) => {
    expect(lastResult(page).removedNode.id).toBe(nodeId(page));
});

// ---- update_scene_document ----------------------------------------------------

When(
    "an agent replaces the scene document with a blockout box",
    async ({ page }) => {
        const view = await readScene(page, scene(page).id);
        const document = {
            ...view.document,
            nodes: [
                {
                    id: "document-box",
                    name: "Document box",
                    transform: {
                        position: { x: 0, y: 0.5, z: 0 },
                        rotationEuler: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 },
                    },
                    primitive: { shape: "box", size: { x: 1, y: 1, z: 1 } },
                    visible: true,
                },
            ],
        };
        const result = await callTool(page, "update_scene_document", {
            sceneId: scene(page).id,
            documentJson: JSON.stringify(document),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then("the scene should hold a blockout box over REST", async ({ page }) => {
    const view = await readScene(page, scene(page).id);
    expect(view.document.nodes).toHaveLength(1);
    expect(view.document.nodes[0].primitive.shape).toBe("box");
});

Then("the MCP document update should be reflected", async ({ page }) => {
    expect(lastResult(page).scene.id).toBe(scene(page).id);
});

// ---- validate_scene -----------------------------------------------------------

When(
    "an agent lifts the placed node {int} m into the air",
    async ({ page }, metres: number) => {
        const result = await callTool(page, "move_asset", {
            sceneId: scene(page).id,
            nodeId: nodeId(page),
            position: [0, metres, 0],
            groundSnap: false,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

When("an agent validates the scene over MCP", async ({ page }) => {
    await callTool(page, "validate_scene", { sceneId: scene(page).id });
});

Then(
    "the MCP validation should report {string}",
    async ({ page }, code: string) => {
        const codes = (lastResult(page).findings ?? []).map(
            (finding: { code: string }) => finding.code,
        );
        expect(codes, JSON.stringify(lastResult(page))).toContain(code);
    },
);

Then("the MCP validation should name its blind spots", async ({ page }) => {
    const limitations: string[] = lastResult(page).coverage.limitations ?? [];
    expect(limitations.length).toBeGreaterThan(0);
    expect(limitations.join(" ")).toContain("axis-aligned");
});

// ---- set_scene_stage ----------------------------------------------------------

When(
    "an agent sets the scene stage to {string}",
    async ({ page }, stage: string) => {
        const result = await callTool(page, "set_scene_stage", {
            sceneId: scene(page).id,
            stage,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the MCP scene should report the {string} stage",
    async ({ page }, stage: string) => {
        expect(lastResult(page).stage).toBe(stage);
        const view = await readScene(page, scene(page).id);
        expect(view.scene.stage).toBe(stage);
    },
);

When("an agent clears the scene stage", async ({ page }) => {
    const result = await callTool(page, "set_scene_stage", {
        sceneId: scene(page).id,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
});

Then("the MCP scene should report no stage", async ({ page }) => {
    const view = await readScene(page, scene(page).id);
    expect(view.scene.stage ?? null).toBeNull();
});

// ---- propose_candidates / get_slots / resolve / reject / recommend ------------

Given(
    "the scene MCP model is placed for the slot {string}",
    async ({ page }, slotId: string) => {
        await placeModel(page, slotId);
    },
);

When(
    "an agent proposes two candidates for the slot {string}",
    async ({ page }, slotId: string) => {
        await proposeTwo(page, slotId);
    },
);

Given(
    "two candidates have been proposed over MCP for the slot {string}",
    async ({ page }, slotId: string) => {
        await proposeTwo(page, slotId);
    },
);

Then(
    "the MCP slot {string} should offer {int} candidates",
    async ({ page }, slotId: string, count: number) => {
        const slot = lastResult(page).slot;
        expect(slot.slotId).toBe(slotId);
        expect(slot.candidates).toHaveLength(count);
        // The node's own asset is captured as the first candidate, so the ids are stable
        // and the card refs are already assembled.
        expect(slot.candidates[0].id).toBe("A");
        expect(slot.candidates[0].ref).toBe(`${slotId}/A`);
    },
);

Then(
    "the MCP slots should list the slot {string} with {int} candidates",
    async ({ page }, slotId: string, count: number) => {
        const result = await (await mcp(page)).callTool("get_slots", {
            sceneId: scene(page).id,
        });
        const slot = (result.slots ?? []).find(
            (candidate: { slotId: string }) => candidate.slotId === slotId,
        );
        expect(slot, JSON.stringify(result)).toBeTruthy();
        expect(slot.candidates).toHaveLength(count);
    },
);

When(
    "an agent resolves the slot {string} on candidate {string}",
    async ({ page }, slotId: string, candidateId: string) => {
        const result = await callTool(page, "resolve_slot", {
            sceneId: scene(page).id,
            slotId,
            candidateId,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the MCP slot {string} should be chosen as {string} by {string}",
    async ({ page }, slotId: string, candidateId: string, resolver: string) => {
        const slot = lastResult(page).slot;
        expect(slot.slotId).toBe(slotId);
        expect(slot.chosenCandidateId).toBe(candidateId);
        expect(slot.resolvedBy).toBe(resolver);
        expect(slot.status).toBe("chosen");
    },
);

When(
    "an agent rejects every candidate in the slot {string} saying {string}",
    async ({ page }, slotId: string, reason: string) => {
        const result = await callTool(page, "reject_candidates", {
            sceneId: scene(page).id,
            slotId,
            reason,
            all: true,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the MCP slot {string} should record {string} against every candidate",
    async ({ page }, slotId: string, reason: string) => {
        const slot = lastResult(page).slot;
        expect(slot.slotId).toBe(slotId);
        expect(slot.candidates.length).toBeGreaterThan(0);
        for (const candidate of slot.candidates) {
            expect(candidate.rejected).toBe(true);
            expect(candidate.rejectedReason).toBe(reason);
        }
        expect(slot.reopenedReason).toBe(reason);
    },
);

When(
    "an agent recommends candidate {string} for the slot {string} saying {string}",
    async ({ page }, candidateId: string, slotId: string, summary: string) => {
        const result = await callTool(page, "set_scene_recommendations", {
            sceneId: scene(page).id,
            recommendations: [{ slotId, candidateId }],
            summary,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the MCP slot {string} should recommend {string} with the summary {string}",
    async ({ page }, slotId: string, candidateId: string, summary: string) => {
        const result = lastResult(page);
        expect(result.summary).toBe(summary);
        const slot = result.slots.find(
            (candidate: { slotId: string }) => candidate.slotId === slotId,
        );
        expect(slot, JSON.stringify(result)).toBeTruthy();
        expect(slot.recommendedCandidateId).toBe(candidateId);
    },
);

Then(
    "the MCP slot {string} should remain open",
    async ({ page }, slotId: string) => {
        const slot = lastResult(page).slots.find(
            (candidate: { slotId: string }) => candidate.slotId === slotId,
        );
        expect(slot.status).not.toBe("chosen");
    },
);

// ---- Project profile fit ------------------------------------------------------

Given(
    "a batch2 project with a per-asset budget exists",
    async ({ page }) => {
        const name = unique("Scene MCP Project");
        const created = await apiHelper.createProject(
            name,
            "Scene MCP project-fit coverage",
        );

        const optionsResponse = await page.request.get(
            `${API_BASE}/projects/profile-options`,
        );
        await expectOk(optionsResponse, "The profile options could not be read");
        const options: Array<{ id: number; dimension: string }> = (
            await optionsResponse.json()
        ).options;
        const style = options.find(
            (option) => option.dimension === "style",
        );
        const platform = options.find(
            (option) => option.dimension === "platform",
        );
        expect(style, "The profile vocabulary has no style option").toBeTruthy();
        expect(
            platform,
            "The profile vocabulary has no platform option",
        ).toBeTruthy();

        const profile = await page.request.put(
            `${API_BASE}/projects/${created.id}/profile`,
            {
                data: {
                    dimensions: {
                        style: [{ optionId: style!.id }],
                        platform: [{ optionId: platform!.id }],
                    },
                    settings: { maxTrianglesPerAsset: 5000 },
                },
            },
        );
        await expectOk(profile, "The project profile could not be set");

        getScenarioState(page).setCustom(PROJECT_KEY, {
            id: created.id,
            name,
            maxTrianglesPerAsset: 5000,
        });
    },
);

Given("the scene is linked to the batch2 project", async ({ page }) => {
    const project = getScenarioState(page).getCustom<{ id: number }>(
        PROJECT_KEY,
    );
    expect(project, "No batch2 project was provisioned").toBeTruthy();
    const response = await page.request.put(
        `${API_BASE}/scenes/${scene(page).id}/project`,
        { data: { projectId: project!.id } },
    );
    await expectOk(response, "The scene could not be linked to the project");
});

Then(
    "the MCP slot candidates should be measured against the project",
    async ({ page }) => {
        const project = getScenarioState(page).getCustom<{
            name: string;
            maxTrianglesPerAsset: number;
        }>(PROJECT_KEY);
        expect(project, "No batch2 project was provisioned").toBeTruthy();

        const slot = lastResult(page).slot;
        expect(slot.candidates.length).toBeGreaterThan(0);
        for (const candidate of slot.candidates) {
            expect(
                candidate.profileFit,
                JSON.stringify(candidate),
            ).toBeTruthy();
            expect(candidate.profileFit.projectName).toBe(project!.name);
            expect(candidate.profileFit.budget).toBeGreaterThan(0);
            expect(candidate.profileFit.summary).toBeTruthy();
        }
    },
);

Then(
    "the MCP scene read should carry the project brief",
    async ({ page }) => {
        const project = getScenarioState(page).getCustom<{ name: string }>(
            PROJECT_KEY,
        );
        const result = await (await mcp(page)).callTool("get_scene", {
            sceneId: scene(page).id,
        });
        expect(result.project, JSON.stringify(result)).toBeTruthy();
        expect(result.project.name).toBe(project!.name);
        expect(result.project.styles?.length ?? 0).toBeGreaterThan(0);
    },
);

// ---- get_scenes_using_asset ---------------------------------------------------

When(
    "an agent asks which scenes use the scene MCP model",
    async ({ page }) => {
        const current = model(page);
        await callTool(page, "get_scenes_using_asset", {
            assetType: "Model",
            assetId: current.id,
        });
    },
);

Then("the MCP usage should list that scene", async ({ page }) => {
    const result = lastResult(page);
    expect(result.assetId).toBe(model(page).id);
    const used = (result.scenes ?? []).find(
        (candidate: { sceneId: number }) => candidate.sceneId === scene(page).id,
    );
    expect(used, JSON.stringify(result)).toBeTruthy();
    expect(used.nodeCount).toBeGreaterThan(0);
});

// ---- delete_scene (destructive refusal) ---------------------------------------

When("an agent asks to delete the scene over MCP", async ({ page }) => {
    await callTool(page, "delete_scene", { sceneId: scene(page).id });
});

Then("the agent should be told the scene would be deleted", async ({ page }) => {
    const result = lastResult(page);
    expect(result.status).toBe("dry-run");
    expect(result.wouldDelete.sceneId).toBe(scene(page).id);
});

When("an agent deletes the scene over MCP for real", async ({ page }) => {
    await callTool(page, "delete_scene", {
        sceneId: scene(page).id,
        dryRun: false,
    });
});

Then(
    "the agent should be told scene deletion is disabled",
    async ({ page }) => {
        expect(lastResult(page).error).toBe("DestructiveDisabled");
    },
);

Then("the scene should still exist over REST", async ({ page }) => {
    const response = await page.request.get(
        `${API_BASE}/scenes/${scene(page).id}`,
    );
    await expectOk(response, "The scene should still exist");
});

// ---- render_scene / get_scene_render ------------------------------------------

When("an agent renders the scene over MCP", async ({ page }) => {
    const result = await callTool(page, "render_scene", {
        sceneId: scene(page).id,
        viewpoint: "iso",
    });
    // The render summary is serialized by the image-returning tool with default
    // (PascalCase) naming, unlike every other tool. Read either spelling rather
    // than depending on the serializer's mood.
    const renderId = result.renderId ?? result.RenderId;
    expect(renderId, JSON.stringify(result)).toBeGreaterThan(0);
    getScenarioState(page).setCustom(RENDER_KEY, renderId);
});

Then(
    "the MCP render should report every placed node loaded",
    async ({ page }) => {
        const renderId = getScenarioState(page).getCustom<number>(RENDER_KEY);
        expect(renderId, "No render was requested").toBeTruthy();

        // render_scene waits up to a minute, but under contention it can hand back an id
        // instead of the picture. Poll the same endpoint the tool does until it settles.
        await expect
            .poll(
                async () => {
                    const response = await page.request.get(
                        `${API_BASE}/scene-renders/${renderId}`,
                    );
                    if (!response.ok()) {
                        return `http ${response.status()}`;
                    }
                    return (await response.json()).status;
                },
                {
                    message: `Waiting for scene render ${renderId}`,
                    timeout: 120000,
                    intervals: [1000, 2000],
                },
            )
            .toBe("Ready");

        const response = await page.request.get(
            `${API_BASE}/scene-renders/${renderId}`,
        );
        const view = await response.json();
        expect(view.nodesFailed).toBe(0);
        expect(view.nodesLoaded).toBeGreaterThan(0);
    },
);

Then("the scene render image should be a PNG", async ({ page }) => {
    const renderId = getScenarioState(page).getCustom<number>(RENDER_KEY);
    const response = await page.request.get(
        `${API_BASE}/scene-renders/${renderId}/file`,
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.body();
    expect(body.length).toBeGreaterThan(1000);
    expect(body.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
});

When("an agent collects the render over MCP", async ({ page }) => {
    const renderId = getScenarioState(page).getCustom<number>(RENDER_KEY);
    await callTool(page, "get_scene_render", { renderId });
});

Then(
    "the MCP render collection should report the picture",
    async ({ page }) => {
        const result = lastResult(page);
        expect(result.renderId ?? result.RenderId).toBe(
            getScenarioState(page).getCustom<number>(RENDER_KEY),
        );
        expect(result.nodesFailed ?? result.NodesFailed).toBe(0);
    },
);
