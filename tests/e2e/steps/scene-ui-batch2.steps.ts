import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import crypto from "crypto";
import { ScenesPage } from "../pages/ScenesPage";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { fetchSceneByName } from "./scenes.steps";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

const MODEL_KEY = "scene-ui:model";
const TEXTURE_SET_KEY = "scene-ui:texture-set";
const RENDER_SCENE_KEY = "scene-ui:render-scene";
const RENDER_STATUS_KEY = "scene-ui:render-status";

interface UiModel {
    id: number;
    name: string;
    versionId: number;
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

function uiModel(page: Page): UiModel {
    const found = getScenarioState(page).getCustom<UiModel>(MODEL_KEY);
    if (!found) {
        throw new Error(
            'No "scene UI model" was provisioned - the Background step is missing.',
        );
    }
    return found;
}

/** Uploads a fresh model for the UI scenarios to place. */
async function uploadModel(page: Page): Promise<UiModel> {
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

// ---- Provisioning -------------------------------------------------------------

Given("a scene UI model exists", async ({ page }) => {
    getScenarioState(page).setCustom(MODEL_KEY, await uploadModel(page));
});

Given(
    "a global texture set named {string} exists",
    async ({ page }, alias: string) => {
        const name = `${alias} ${crypto.randomUUID().slice(0, 8)}`;
        // Kind 1 is a universal (global) texture set - the kind that shows up in
        // the merged material library as a GlobalMaterial.
        const created = await apiHelper.createTextureSetWithKind(name, 1);
        getScenarioState(page).setCustom(TEXTURE_SET_KEY, {
            id: created.id,
            name,
        });
    },
);

Given(
    "a ground-held scene named {string} exists",
    async ({ page }, name: string) => {
        const model = uiModel(page);
        const created = await page.request.post(`${API_BASE}/scenes`, {
            data: { name, description: "Scene UI placement-rule coverage" },
        });
        await expectOk(created, "The ground-held scene could not be created");
        const view = await created.json();
        const placed = await page.request.post(
            `${API_BASE}/scenes/${view.scene.id}/nodes`,
            {
                data: {
                    assetType: "Model",
                    assetId: model.id,
                    versionId: model.versionId,
                    position: { x: 0, y: 0, z: 0 },
                    groundSnap: true,
                },
            },
        );
        await expectOk(placed, "The ground-held node could not be placed");

        // The scene was created behind the app's back. The scenes list is cached in the
        // browser, so reload it so the list actually offers the new scene - the same
        // admission the scene-project-link scenarios make for the projects list.
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("scene-list")).toBeVisible({
            timeout: 30000,
        });
    },
);

Given(
    "a renderable scene named {string} exists",
    async ({ page }, name: string) => {
        const model = uiModel(page);
        const created = await page.request.post(`${API_BASE}/scenes`, {
            data: { name, description: "Scene render view coverage" },
        });
        await expectOk(created, "The renderable scene could not be created");
        const view = await created.json();
        const saved = await page.request.put(
            `${API_BASE}/scenes/${view.scene.id}/document`,
            {
                data: {
                    documentJson: JSON.stringify({
                        ...view.document,
                        nodes: [
                            {
                                id: "render-node",
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
        await expectOk(saved, "The renderable scene document could not be saved");
        getScenarioState(page).setCustom(RENDER_SCENE_KEY, {
            id: view.scene.id,
            name,
        });
    },
);

// ---- Hierarchy ----------------------------------------------------------------

When("I place the scene UI model in the scene", async ({ page }) => {
    const scenes = new ScenesPage(page);
    const model = uiModel(page);
    await scenes.searchLibrary(model.name);
    await scenes.placeModel(model.name);
});

Given("I have placed the scene UI model in the scene", async ({ page }) => {
    const scenes = new ScenesPage(page);
    const model = uiModel(page);
    await scenes.searchLibrary(model.name);
    await scenes.placeModel(model.name);
});

When("I select the first scene node", async ({ page }) => {
    const scenes = new ScenesPage(page);
    const id = await scenes.nodeRows().first().getAttribute("data-node-id");
    expect(id, "The scene has no node to select").toBeTruthy();
    await scenes.selectNode(id!);
});

Then("the scene properties panel should be visible", async ({ page }) => {
    await expect(page.getByTestId("scene-properties")).toBeVisible();
});

When(
    "I rename the selected scene node to {string}",
    async ({ page }, name: string) => {
        // The Name field is the only wrapping label in the panel; scoping to it
        // avoids the InputNumber vector fields, which share the input[type=text]
        // tag but are not this control.
        const input = page.locator(
            '[data-testid="scene-properties"] label.scene-properties-field input',
        );
        await expect(input).toBeVisible();
        await input.fill(name);
        await input.blur();
    },
);

When("I remove the first scene node from the hierarchy", async ({ page }) => {
    await page
        .locator('[data-testid="scene-node-row"] button[aria-label="Remove node"]')
        .first()
        .click();
});

When("I hide the first scene node", async ({ page }) => {
    await page
        .locator('[data-testid="scene-node-row"] button[aria-label="Hide node"]')
        .first()
        .click();
});

Then(
    "the scene hierarchy should name a node {string}",
    async ({ page }, name: string) => {
        await expect(
            page.locator('[data-testid="scene-node-row"]').filter({
                hasText: name,
            }),
        ).toHaveCount(1);
    },
);

Then("no scene node should be flagged as overlapping", async ({ page }) => {
    // The server's overlap classification as the hierarchy shows it. A node
    // dropped inside a wide neighbour is the regression: placement used to step
    // by the new node's own width only, so a blockout box landed inside the
    // model beside it and the pair was reported as an overlap nobody made.
    await expect(
        page
            .locator('[data-testid="scene-node-row"]')
            .getByText("overlapping"),
    ).toHaveCount(0);
});

Then(
    "the stored scene document named {string} should name its first node {string}",
    async ({ page }, sceneName: string, nodeName: string) => {
        const view = await fetchSceneByName(page, sceneName);
        expect(view.document.nodes[0].name).toBe(nodeName);
    },
);

Then(
    "the stored scene document named {string} should mark the first node hidden",
    async ({ page }, sceneName: string) => {
        const view = await fetchSceneByName(page, sceneName);
        expect(view.document.nodes[0].visible).toBe(false);
    },
);

// ---- Lights -------------------------------------------------------------------

When("I add a light from the scene editor", async ({ page }) => {
    await page
        .locator(".scene-editor-add-row")
        .getByRole("button", { name: "Light" })
        .click();
});

When(
    "I set the selected light's intensity to {float}",
    async ({ page }, value: number) => {
        await new ScenesPage(page).setLightIntensity(value);
    },
);

Then(
    "the stored scene document named {string} should hold a light of intensity {float}",
    async ({ page }, sceneName: string, intensity: number) => {
        const view = await fetchSceneByName(page, sceneName);
        expect(view.document.lights).toHaveLength(1);
        expect(view.document.lights[0].intensity).toBe(intensity);
    },
);

Then(
    "the scene editor should report {int} light(s)",
    async ({ page }, count: number) => {
        await expect(
            page.getByTestId("scene-editor").getByText(`${count} lights`),
        ).toBeVisible();
    },
);

Then(
    "the stored scene document named {string} should hold {int} light(s)",
    async ({ page }, sceneName: string, count: number) => {
        const view = await fetchSceneByName(page, sceneName);
        expect(view.document.lights ?? []).toHaveLength(count);
        expect(view.document.lights[0].type).toBe("directional");
    },
);

// ---- Placement rules ----------------------------------------------------------

When(
    "I open the scene named {string} from the list",
    async ({ page }, name: string) => {
        await new ScenesPage(page).openScene(name);
    },
);

Then(
    "the scene properties should report the node rests on the ground",
    async ({ page }) => {
        await expect(page.getByTestId("scene-properties-rests-on")).toHaveText(
            "the ground, held",
        );
    },
);

// ---- Dressing with a texture set ----------------------------------------------

When(
    "I dress the selected node with the texture set {string}",
    async ({ page }, alias: string) => {
        const textureSet = getScenarioState(page).getCustom<{ name: string }>(
            TEXTURE_SET_KEY,
        );
        expect(textureSet, "No global texture set was provisioned").toBeTruthy();
        await new ScenesPage(page).dressSelectedNode(textureSet!.name);
    },
);

Then(
    "the node's texture set should read {string}",
    async ({ page }) => {
        const textureSet = getScenarioState(page).getCustom<{ name: string }>(
            TEXTURE_SET_KEY,
        );
        const scenes = new ScenesPage(page);
        await expect(scenes.boundMaterialLocator("")).toHaveText(
            textureSet!.name,
        );
        await expect(
            page.locator(
                '[data-testid="scene-node-materials-row"][data-slot=""]',
            ),
        ).toContainText("Textures");
    },
);

Then(
    "the stored scene document named {string} should dress the node with the texture set {string}",
    async ({ page }, sceneName: string) => {
        const textureSet = getScenarioState(page).getCustom<{ id: number }>(
            TEXTURE_SET_KEY,
        );
        const view = await fetchSceneByName(page, sceneName);
        const node = view.document.nodes[0];
        expect(node.material?.textureSetId).toBe(textureSet!.id);
        expect(node.material?.materialId ?? null).toBeNull();
    },
);

// ---- Scene render view --------------------------------------------------------

When(
    "I open the scene render view for {string} from {string}",
    async ({ page }, _name: string, viewpoint: string) => {
        const scene = getScenarioState(page).getCustom<{ id: number }>(
            RENDER_SCENE_KEY,
        );
        expect(scene, "No renderable scene was provisioned").toBeTruthy();
        await page.goto(
            `/?render=scene&sceneId=${scene!.id}&view=${viewpoint}`,
            { waitUntil: "domcontentloaded" },
        );

        // The view publishes its own readiness; wait for the canvas to settle every
        // node rather than for a spinner. Generous because this mounts a real three.js
        // canvas under software WebGL.
        await page.waitForFunction(
            () =>
                (window as unknown as { __SCENE_RENDER__?: { ready: boolean } })
                    .__SCENE_RENDER__?.ready === true,
            undefined,
            { timeout: 90000 },
        );
        getScenarioState(page).setCustom(
            RENDER_STATUS_KEY,
            await page.evaluate(
                () =>
                    (
                        window as unknown as {
                            __SCENE_RENDER__?: unknown;
                        }
                    ).__SCENE_RENDER__,
            ),
        );
    },
);

Then(
    "the scene render view should report every visible node loaded",
    async ({ page }) => {
        await expect(page.getByTestId("scene-render-view")).toBeVisible();
        await expect(
            page.getByTestId("scene-render-view").locator("canvas"),
        ).toBeVisible();

        const status = getScenarioState(page).getCustom<{
            nodesExpected: number;
            nodesLoaded: number;
            nodesFailed: number;
        }>(RENDER_STATUS_KEY);
        expect(status, "The render view never reported readiness").toBeTruthy();
        expect(status!.nodesExpected).toBeGreaterThan(0);
        expect(status!.nodesFailed).toBe(0);
        expect(status!.nodesLoaded).toBe(status!.nodesExpected);
    },
);
