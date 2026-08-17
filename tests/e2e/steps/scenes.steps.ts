import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import { ScenesPage } from "../pages/ScenesPage";
import { getScenarioState } from "../fixtures/shared-state";

const { Given, When, Then } = createBdd();

const apiBase = () => process.env.API_BASE_URL || "http://localhost:8090";

/** The model seeded by the scenes setup phase. */
function testModel(page: Page) {
    const model = getScenarioState(page).getModel("scene-test-model");
    if (!model) {
        throw new Error(
            'No "scene-test-model" in shared state - the scenes setup phase did not run.',
        );
    }
    return model;
}

/** Reads a scene back through the API, by the name it was created with. */
async function fetchSceneByName(page: Page, name: string) {
    const listed = await page.request.get(`${apiBase()}/scenes`);
    expect(listed.ok()).toBeTruthy();

    const { scenes } = await listed.json();
    const summary = scenes.find((scene: { name: string }) => scene.name === name);
    if (!summary) {
        throw new Error(`No scene named "${name}" was returned by /scenes.`);
    }

    const detail = await page.request.get(`${apiBase()}/scenes/${summary.id}`);
    expect(detail.ok()).toBeTruthy();
    return detail.json();
}

Given("I am on the scenes page", async ({ page }) => {
    await new ScenesPage(page).goto();
});

Given("a scene named {string} is open", async ({ page }, name: string) => {
    await new ScenesPage(page).createScene(name);
});

When("I create a scene named {string}", async ({ page }, name: string) => {
    await new ScenesPage(page).createScene(name);
});

Then("the scene editor should be visible", async ({ page }) => {
    await expect(new ScenesPage(page).editorLocator()).toBeVisible();
});

Then("the scene should hold no nodes", async ({ page }) => {
    await expect(new ScenesPage(page).nodeRows()).toHaveCount(0);
});

Then("the scene should hold {int} node(s)", async ({ page }, count: number) => {
    await expect(new ScenesPage(page).nodeRows()).toHaveCount(count);
});

async function placeTestModel(page: Page) {
    const scenes = new ScenesPage(page);
    const model = testModel(page);

    await scenes.searchLibrary(model.name);
    await scenes.placeModel(model.name);
}

When("I place the test model into the scene", async ({ page }) => {
    await placeTestModel(page);
});

Given("I have placed the test model into the scene", async ({ page }) => {
    await placeTestModel(page);
});

Then(
    "the placed node should reference the test model's active version",
    async ({ page }) => {
        const model = testModel(page);

        // The version pin is the whole point of the reference: a node that
        // dropped it would silently re-point when the model gets a new version.
        // The row prints "Model <id> · v<versionId>", so this asserts both.
        const versions = await page.request.get(
            `${apiBase()}/models/${model.id}/versions`,
        );
        expect(versions.ok()).toBeTruthy();
        const activeVersionId = (await versions.json())[0].id;

        await expect(new ScenesPage(page).nodeRows().first()).toContainText(
            `Model ${model.id} · v${activeVersionId}`,
        );
    },
);

When("I save the scene", async ({ page }) => {
    await new ScenesPage(page).save();
});

When("I add a blockout box", async ({ page }) => {
    await new ScenesPage(page).addBlockoutBox();
});

When("I undo the last edit", async ({ page }) => {
    await new ScenesPage(page).undo();
});

When(
    "I set the selected node's position x to {float}",
    async ({ page }, value: number) => {
        await new ScenesPage(page).setTransformAxis("Position", "x", value);
    },
);

When("I switch to the models tab and back to scenes", async ({ page }) => {
    await new ScenesPage(page).switchAwayAndBack("modelList");
});

Then("the scene should have unsaved changes", async ({ page }) => {
    expect(await new ScenesPage(page).hasUnsavedChanges()).toBe(true);
});

When("I reopen the scene {string}", async ({ page }, name: string) => {
    const scenes = new ScenesPage(page);
    await scenes.backToList();
    await scenes.openScene(name);
});

/** Successfully served `/files/<id>` URLs seen while multi-file models were placed. */
const auxiliaryFetches = new WeakMap<Page, string[]>();

/** Imports one staged multi-file glTF and returns the model name it lands under. */
async function importMultiFileGltf(page: Page): Promise<string> {
    const { stageMultiFileGltf } = await import(
        "../fixtures/multifile-gltf-fixture"
    );
    const { ModelListPage } = await import("../pages/ModelListPage");
    const { ApiHelper } = await import("../helpers/api-helper");

    const staged = await stageMultiFileGltf();
    const modelList = new ModelListPage(page);
    await modelList.goto();
    await modelList.importFolder(staged.dir);

    const api = new ApiHelper();
    const model = await api.findModelByName(staged.modelName);
    if (!model) {
        throw new Error(
            `Imported multi-file model "${staged.modelName}" not found via API`,
        );
    }

    return staged.modelName;
}

function importedMultiFileModels(page: Page): string[] {
    const names = getScenarioState(page).getCustom(
        "sceneMultiFileModelNames",
    ) as string[] | undefined;

    if (!names?.length) {
        throw new Error(
            "No multi-file glTF models were imported by this scenario.",
        );
    }
    return names;
}

Given("I have imported a multi-file glTF model", async ({ page }) => {
    getScenarioState(page).setCustom("sceneMultiFileModelNames", [
        await importMultiFileGltf(page),
    ]);
});

Given(
    "I have imported {int} multi-file glTF models",
    async ({ page }, count: number) => {
        // Each staging call gives the primary a unique name and content, so these
        // are distinct assets rather than one asset placed twice - which is the
        // whole point: the load gate is per-asset, so one asset cannot expose it.
        const names: string[] = [];
        for (let i = 0; i < count; i++) {
            names.push(await importMultiFileGltf(page));
        }
        getScenarioState(page).setCustom("sceneMultiFileModelNames", names);
    },
);

When(
    "I place every imported multi-file model into the scene",
    async ({ page }) => {
        const scenes = new ScenesPage(page);

        // The .gltf, its .bin and its .png are all served from /files/<id>.
        // Recording the URLs is what makes the assertions below about loading,
        // not about rendering - software WebGL in CI cannot be asked whether
        // geometry appeared.
        const served: string[] = [];
        page.on("response", response => {
            if (/\/files\/\d+(\?|$)/.test(response.url()) && response.status() === 200) {
                served.push(response.url());
            }
        });
        auxiliaryFetches.set(page, served);

        for (const modelName of importedMultiFileModels(page)) {
            await scenes.searchLibrary(modelName);
            await scenes.placeModel(modelName);
        }
    },
);

Then(
    "the scene viewport should have fetched the model's auxiliary files",
    async ({ page }) => {
        const served = auxiliaryFetches.get(page) ?? [];

        // Before the resource map was wired in, the loader asked for the .bin
        // relative to the version-file route and never touched /files/<id> at
        // all - so an empty list here is the exact regression.
        await expect
            .poll(() => served.length, {
                message:
                    "the viewport never fetched an auxiliary file - the glTF's external .bin was not resolved",
                timeout: 20000,
            })
            .toBeGreaterThan(0);
    },
);

Then(
    "the scene viewport should have fetched a file for every placed model",
    async ({ page }) => {
        const expected = importedMultiFileModels(page).length;

        // One distinct file id per model at minimum - each primary .gltf is its
        // own file, while the .bin and .png dedupe to one id across copies. This
        // is the wait: it establishes that every node actually started loading,
        // so the failed-node assertion that follows is measuring something.
        await expect
            .poll(
                () => new Set(auxiliaryFetches.get(page) ?? []).size,
                {
                    message:
                        "not every placed model fetched its file - some node never started loading",
                    timeout: 30000,
                },
            )
            .toBeGreaterThanOrEqual(expected);
    },
);

Then("no node should be flagged as failed to load", async ({ page }) => {
    await expect(
        page.locator('[data-testid="scene-node-row"]', {
            hasText: "failed to load",
        }),
    ).toHaveCount(0);
});

Then(
    "the stored scene document should place the node at x {float}",
    async ({ page }, expected: number) => {
        // Asserted against the server's own copy, not the editor's inputs: the
        // scenario is about the move surviving a save, and reading it back from
        // the UI would pass even if the document never left the browser.
        const view = await fetchSceneByName(page, "Moved Scene");

        expect(view.document.nodes).toHaveLength(1);
        expect(view.document.nodes[0].transform.position.x).toBeCloseTo(
            expected,
            3,
        );
    },
);

// --- Render-back -----------------------------------------------------------

/**
 * The render request and its result, carried between steps.
 *
 * Keyed off the page rather than a module-level variable because the render
 * scenarios run alongside everything else, and a shared slot would let two
 * workers overwrite each other's renderId.
 */
const renderState = new WeakMap<
    Page,
    { renderId?: number; status?: number; body?: any; bodyText?: string }
>();

function renderSlot(page: Page) {
    let slot = renderState.get(page);
    if (!slot) {
        slot = {};
        renderState.set(page, slot);
    }
    return slot;
}

async function requestRender(page: Page, sceneName: string, viewpoint?: string) {
    // `view.scene.id`, not `view.id` - GET /scenes/{id} answers with a SceneView
    // that nests the summary. Reading the wrong one posts to
    // /scenes/undefined/render, which 404s and looks exactly like a render that
    // never started.
    const view = await fetchSceneByName(page, sceneName);
    const sceneId = view.scene.id;
    expect(sceneId).toBeGreaterThan(0);

    const response = await page.request.post(
        `${apiBase()}/scenes/${sceneId}/render`,
        { data: viewpoint ? { viewpoint } : {} },
    );

    const slot = renderSlot(page);
    slot.status = response.status();
    // Kept as text as well: a request that fails has to say why here, or the
    // only symptom downstream is an undefined renderId.
    slot.bodyText = await response.text();
    slot.body = response.ok() ? JSON.parse(slot.bodyText) : null;
    slot.renderId = slot.body?.renderId;
}

When(
    "I request a render of the scene {string}",
    async ({ page }, sceneName: string) => {
        await requestRender(page, sceneName);
    },
);

When(
    "I request a render of the scene {string} from {string}",
    async ({ page }, sceneName: string, viewpoint: string) => {
        await requestRender(page, sceneName, viewpoint);
    },
);

When("I collect the render with id {int}", async ({ page }, id: number) => {
    const response = await page.request.get(`${apiBase()}/scene-renders/${id}`);
    const slot = renderSlot(page);
    slot.status = response.status();
    slot.body = response.ok() ? await response.json() : null;
});

Then("the render request should be rejected", async ({ page }) => {
    const slot = renderSlot(page);
    expect(slot.status).toBeGreaterThanOrEqual(400);
    expect(slot.status).toBeLessThan(500);
});

Then("the render lookup should report it does not exist", async ({ page }) => {
    expect(renderSlot(page).status).toBe(404);
});

Then("the render should complete", async ({ page }) => {
    const slot = renderSlot(page);

    // Asserted on the request first, with its body in the message. Without this
    // a rejected request reports "undefined is not a number" from the poll
    // below, which says nothing about why the render never started.
    expect(
        slot.status,
        `Render request failed: HTTP ${slot.status} ${slot.bodyText}`,
    ).toBeLessThan(300);
    expect(slot.renderId).toBeGreaterThan(0);

    // Polled rather than waited on a fixed delay: the render drives a real
    // browser against the real frontend, so how long it takes depends on what
    // else the worker is doing. The budget matches the tool's own wait.
    await expect
        .poll(
            async () => {
                const response = await page.request.get(
                    `${apiBase()}/scene-renders/${slot.renderId}`,
                );
                if (!response.ok()) {
                    return `http ${response.status()}`;
                }
                slot.body = await response.json();
                return slot.body.status;
            },
            {
                message: `Waiting for scene render ${slot.renderId} to be drawn`,
                timeout: 90000,
                intervals: [1000, 2000],
            },
        )
        .toBe("Ready");
});

Then("the render should be a PNG image", async ({ page }) => {
    const slot = renderSlot(page);
    const response = await page.request.get(
        `${apiBase()}/scene-renders/${slot.renderId}/file`,
    );

    expect(response.ok()).toBeTruthy();

    // The magic bytes, not the content-type header: the header is whatever the
    // endpoint claims, and a zero-byte or truncated file would still carry it.
    const body = await response.body();
    expect(body.length).toBeGreaterThan(1000);
    expect(body.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
});

Then(
    "the render should report every placed node as loaded",
    async ({ page }) => {
        // The counts, not the pixels. A render is taken even when a node never
        // resolves, so "an image came back" is not evidence the scene drew -
        // this is the assertion that catches a node silently failing.
        const slot = renderSlot(page);
        expect(slot.body.nodesFailed).toBe(0);
        expect(slot.body.nodesLoaded).toBeGreaterThan(0);
    },
);

// --- Validation ------------------------------------------------------------

/**
 * The last validation response, and the last write response that carried
 * findings. Same WeakMap-per-page reasoning as the render slot above.
 */
const validationState = new WeakMap<
    Page,
    { status?: number; body?: any; writeBody?: any }
>();

function validationSlot(page: Page) {
    let slot = validationState.get(page);
    if (!slot) {
        slot = {};
        validationState.set(page, slot);
    }
    return slot;
}

/** Every finding code in a validation or write response. */
function findingCodes(body: any): string[] {
    return (body?.findings ?? []).map((finding: { code: string }) => finding.code);
}

When(
    "I lift the first node of the scene {string} {int} m into the air",
    async ({ page }, sceneName: string, metres: number) => {
        const view = await fetchSceneByName(page, sceneName);
        const node = view.document.nodes[0];
        expect(node).toBeTruthy();

        const response = await page.request.put(
            `${apiBase()}/scenes/${view.scene.id}/nodes/${node.id}`,
            {
                data: {
                    position: { x: 0, y: metres, z: 0 },
                    // Explicitly off: the node was placed on the floor, and a sticky
                    // groundSnap would put it straight back there.
                    groundSnap: false,
                },
            },
        );

        expect(response.ok()).toBeTruthy();
        validationSlot(page).writeBody = await response.json();
    },
);

When("I validate the scene {string}", async ({ page }, sceneName: string) => {
    const view = await fetchSceneByName(page, sceneName);
    const response = await page.request.get(
        `${apiBase()}/scenes/${view.scene.id}/validate`,
    );

    const slot = validationSlot(page);
    slot.status = response.status();
    slot.body = response.ok() ? await response.json() : null;
});

When("I validate the scene with id {int}", async ({ page }, id: number) => {
    const response = await page.request.get(`${apiBase()}/scenes/${id}/validate`);
    const slot = validationSlot(page);
    slot.status = response.status();
    slot.body = response.ok() ? await response.json() : null;
});

Then("the validation should report a verdict", async ({ page }) => {
    const slot = validationSlot(page);
    expect(slot.status).toBe(200);
    expect(["ok", "warnings", "errors"]).toContain(slot.body.verdict);
});

Then("the validation should name its blind spots", async ({ page }) => {
    // The whole point of the tool: a clean verdict must not read as "the scene
    // is right". An axis-aligned box cannot see a wall facing the wrong way, and
    // the response has to say so.
    const limitations: string[] = validationSlot(page).body.coverage.limitations;
    expect(limitations.length).toBeGreaterThan(0);
    expect(limitations.join(" ")).toContain("axis-aligned");
});

Then(
    "the validation should report {string}",
    async ({ page }, code: string) => {
        expect(findingCodes(validationSlot(page).body)).toContain(code);
    },
);

Then(
    "the move response should report {string}",
    async ({ page }, code: string) => {
        // The same check, delivered without being asked for. An agent that has to
        // make a second call to find out its last write was wrong mostly does not.
        expect(findingCodes(validationSlot(page).writeBody)).toContain(code);
    },
);

Then(
    "the validation lookup should report it does not exist",
    async ({ page }) => {
        expect(validationSlot(page).status).toBe(404);
    },
);
