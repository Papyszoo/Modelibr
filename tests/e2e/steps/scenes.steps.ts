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

/**
 * The scene the scenario is currently working on.
 *
 * Recorded so a step can say "the slot 'streetlight'" instead of repeating the
 * scene's name on every line - these scenarios read as one conversation about
 * one scene, and restating it four times reads as four separate facts.
 */
const openScene = new WeakMap<Page, string>();

function currentSceneName(page: Page): string {
    const name = openScene.get(page);
    if (!name) {
        throw new Error(
            "No scene has been opened in this scenario - open one before addressing its slots.",
        );
    }
    return name;
}

Given("a scene named {string} is open", async ({ page }, name: string) => {
    await new ScenesPage(page).createScene(name);
    openScene.set(page, name);
});

When("I create a scene named {string}", async ({ page }, name: string) => {
    await new ScenesPage(page).createScene(name);
    openScene.set(page, name);
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

/**
 * Creates a parameter material through the API, or reuses one already named
 * that way.
 *
 * Created over the API rather than through the PBR Materials page: these
 * scenarios are about dressing a scene node, and driving a second feature's
 * create dialog to get there would make them fail for that feature's reasons.
 */
Given("a PBR material named {string} exists", async ({ page }, name: string) => {
    const listed = await page.request.get(`${apiBase()}/materials`);
    expect(listed.ok()).toBeTruthy();

    const existing = (await listed.json()).materials.find(
        (material: { name: string }) => material.name === name,
    );
    if (existing) {
        return;
    }

    const created = await page.request.post(`${apiBase()}/materials`, {
        data: {
            name,
            parameters: {
                baseColorHex: "#B5892B",
                roughness: 0.4,
                metallic: 1,
            },
        },
    });
    expect(created.ok()).toBeTruthy();
});

When(
    "I dress the selected node with the material {string}",
    async ({ page }, materialName: string) => {
        await new ScenesPage(page).dressSelectedNode(materialName);
    },
);

Given(
    "I have dressed the selected node with the material {string}",
    async ({ page }, materialName: string) => {
        await new ScenesPage(page).dressSelectedNode(materialName);
    },
);

When("I clear the node's material", async ({ page }) => {
    await new ScenesPage(page).clearSlotMaterial();
});

Then(
    "the node's material should read {string}",
    async ({ page }, materialName: string) => {
        // The document stores an id. This is the panel resolving it back to a
        // name, which is the difference between a readable scene and a row of
        // opaque numbers. Asserted rather than read, because the name arrives
        // with the material's detail fetch just after the binding does.
        await expect(new ScenesPage(page).boundMaterialLocator()).toHaveText(
            materialName,
        );
    },
);

Then(
    "the stored scene document should dress the node with {string}",
    async ({ page }, materialName: string) => {
        const view = await fetchSceneByName(page, "Dressed Scene");
        const node = view.document.nodes[0];

        // Asserting on the id alone would pass against a binding pointing at
        // the wrong material, so the id is resolved back to its name.
        expect(node.material?.materialId).toBeGreaterThan(0);
        expect(node.material?.textureSetId ?? null).toBeNull();

        const material = await page.request.get(
            `${apiBase()}/materials/${node.material.materialId}`,
        );
        expect(material.ok()).toBeTruthy();
        expect((await material.json()).name).toBe(materialName);
    },
);

Then(
    "the stored scene document should dress the node with nothing",
    async ({ page }) => {
        // Cleared, not nulled: a null binding left in the document fails the
        // validator on the next save.
        const view = await fetchSceneByName(page, "Undressed Scene");

        expect(view.document.nodes[0].material ?? null).toBeNull();
    },
);

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
    openScene.set(page, name);
});

/** Successfully served `/files/<id>` URLs seen while multi-file models were placed. */
const auxiliaryFetches = new WeakMap<Page, string[]>();

interface HeldSceneFile {
    fileId: number;
    release: () => void;
}

interface HeldSceneFiles {
    primaryFileIds: Set<number>;
    interceptedFileIds: number[];
    pending: HeldSceneFile[];
}

/** Browser-side gates used by the deterministic progressive-loading scenario. */
const heldSceneFiles = new WeakMap<Page, HeldSceneFiles>();

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

Given("the imported scene model files are held", async ({ page }) => {
    const { ApiHelper } = await import("../helpers/api-helper");
    const api = new ApiHelper();
    const primaryFileIds = new Set<number>();

    for (const modelName of importedMultiFileModels(page)) {
        const model = await api.findModelByName(modelName);
        expect(model, `Imported model ${modelName} was not found`).toBeTruthy();

        const versionsResponse = await page.request.get(
            `${apiBase()}/models/${model.id}/versions`,
        );
        expect(versionsResponse.ok()).toBeTruthy();
        const versions = await versionsResponse.json();
        const primary = versions[0]?.files?.find(
            (file: { isRenderable: boolean }) => file.isRenderable,
        );
        expect(primary?.id, `${modelName} has no renderable primary file`).toBeGreaterThan(0);
        primaryFileIds.add(primary.id);
    }

    const state: HeldSceneFiles = {
        primaryFileIds,
        interceptedFileIds: [],
        pending: [],
    };
    heldSceneFiles.set(page, state);

    await page.route(/\/files\/\d+(?:\?|$)/, async route => {
        const fileId = Number(new URL(route.request().url()).pathname.split("/").pop());
        if (!state.primaryFileIds.has(fileId)) {
            await route.continue();
            return;
        }

        let release = () => {};
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const held = { fileId, release };
        state.interceptedFileIds.push(fileId);
        state.pending.push(held);

        await gate;
        state.pending = state.pending.filter(candidate => candidate !== held);
        await route.continue();
    });
});

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

Then(
    "the scene should remain interactive and load the held resources serially",
    async ({ page }) => {
        const state = heldSceneFiles.get(page);
        if (!state) {
            throw new Error("The scene file gate was not installed.");
        }

        const progress = page.getByTestId("scene-resource-progress");
        await expect(progress).toContainText("0/2 resources");
        await expect(progress).toContainText("1 loading");

        // The second primary must not even be requested while the first is held. This is
        // stronger than watching a spinner: it proves the loader branch was not mounted.
        await expect
            .poll(() => new Set(state.interceptedFileIds).size, {
                message: "waiting for the first admitted scene file request",
            })
            .toBe(1);

        // Selection is the interaction the bounds-first state exists to preserve.
        const scenes = new ScenesPage(page);
        const secondNodeId = await scenes.nodeRows().nth(1).getAttribute("data-node-id");
        expect(secondNodeId).toBeTruthy();
        await scenes.selectNode(secondNodeId!);

        state.pending[0]?.release();
        await expect
            .poll(() => new Set(state.interceptedFileIds).size, {
                message:
                    "the second scene resource did not start after the first settled",
                timeout: 30000,
            })
            .toBe(2);

        for (const held of [...state.pending]) {
            held.release();
        }

        await expect(progress).toBeHidden({ timeout: 30000 });
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

Then(
    "the validation should report {string} as {string}",
    async ({ page }, code: string, severity: string) => {
        const finding = (validationSlot(page).body?.findings ?? []).find(
            (candidate: { code: string }) => candidate.code === code,
        );
        expect(finding, `no ${code} finding in the validation`).toBeTruthy();
        expect(finding.severity).toBe(severity);
    },
);

// --- Stages ----------------------------------------------------------------

/** The last stage change's status and body - refusals included, which is the point. */
const stageState = new WeakMap<Page, { status?: number; body?: any }>();

When(
    "I move the scene {string} to the {string} stage",
    async ({ page }, sceneName: string, stage: string) => {
        const view = await fetchSceneByName(page, sceneName);
        const response = await page.request.put(
            `${apiBase()}/scenes/${view.scene.id}/stage`,
            { data: { stage } },
        );

        stageState.set(page, {
            status: response.status(),
            body: await response.json(),
        });
    },
);

When(
    "I declare the first node of the scene {string} as hanging",
    async ({ page }, sceneName: string) => {
        const view = await fetchSceneByName(page, sceneName);
        const node = view.document.nodes[0];
        expect(node).toBeTruthy();

        const response = await page.request.put(
            `${apiBase()}/scenes/${view.scene.id}/nodes/${node.id}`,
            { data: { suspended: true } },
        );

        expect(response.ok()).toBeTruthy();
    },
);

Then(
    "the scene {string} should report the {string} stage",
    async ({ page }, sceneName: string, stage: string) => {
        // Read back through /scenes rather than trusting the write response:
        // the stage lives in the document, and a stage the list cannot see is a
        // stage the editor's header cannot show either.
        const view = await fetchSceneByName(page, sceneName);
        expect(view.scene.stage).toBe(stage);
        expect(view.document.stage).toBe(stage);
    },
);

Then(
    "the scene {string} should report no stage",
    async ({ page }, sceneName: string) => {
        const view = await fetchSceneByName(page, sceneName);
        expect(view.scene.stage ?? null).toBeNull();
    },
);

Then(
    "the stage change should be refused for {string}",
    async ({ page }, code: string) => {
        const slot = stageState.get(page);
        expect(slot?.status).toBe(400);
        expect(slot?.body?.error).toBe("Scene.StageBlocked");
        // The refusal has to name the finding and the way out of it, or the
        // caller is left guessing which of twenty nodes is the problem.
        expect(slot?.body?.message).toContain(code);
        expect(slot?.body?.message).toContain("suspended=true");
    },
);

Then(
    "the validation of {string} should judge it against the {string} stage",
    async ({ page }, sceneName: string, stage: string) => {
        const view = await fetchSceneByName(page, sceneName);
        const response = await page.request.get(
            `${apiBase()}/scenes/${view.scene.id}/validate`,
        );
        expect(response.ok()).toBeTruthy();

        const body = await response.json();
        expect(body.coverage.stage).toBe(stage);
        // Said out loud in the limitations too: a quieter answer must never be
        // mistakable for a better scene.
        expect(body.coverage.limitations.join(" ")).toContain(`'${stage}' stage`);
    },
);

// --- Choices ----------------------------------------------------------------

/** One slot as the server projects it - the same view the choices panel reads. */
async function fetchSlot(page: Page, slotId: string) {
    const view = await fetchSceneByName(page, currentSceneName(page));
    const response = await page.request.get(
        `${apiBase()}/scenes/${view.scene.id}/slots`,
    );
    expect(response.ok()).toBeTruthy();

    const { slots } = await response.json();
    const slot = slots.find(
        (entry: { slotId: string }) => entry.slotId === slotId,
    );
    if (!slot) {
        throw new Error(
            `Scene "${currentSceneName(page)}" has no slot "${slotId}".`,
        );
    }
    return slot;
}

/** The active version of the model the scenes setup phase seeded. */
async function testModelVersionId(page: Page): Promise<number> {
    const model = testModel(page);
    const versions = await page.request.get(
        `${apiBase()}/models/${model.id}/versions`,
    );
    expect(versions.ok()).toBeTruthy();
    return (await versions.json())[0].id;
}

/**
 * Places the seeded model as the node that fills a slot, over the API.
 *
 * Written through the document endpoint rather than the picker because these
 * scenarios are about resolving a decision, not about placing: the slot's node
 * has to carry a `slotId`, and the picker has no reason to offer one.
 */
Given(
    "the test model is placed in the scene for the slot {string}",
    async ({ page }, slotId: string) => {
        const model = testModel(page);
        const versionId = await testModelVersionId(page);
        const view = await fetchSceneByName(page, currentSceneName(page));

        const document = {
            ...view.document,
            nodes: [
                {
                    id: `${slotId}-node`,
                    name: "street lamp",
                    slotId,
                    transform: {
                        position: { x: 0, y: 0, z: 0 },
                        rotationEuler: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 },
                    },
                    asset: {
                        assetType: "Model",
                        assetId: Number(model.id),
                        versionId,
                    },
                    visible: true,
                },
            ],
        };

        const saved = await page.request.put(
            `${apiBase()}/scenes/${view.scene.id}/document`,
            { data: { documentJson: JSON.stringify(document) } },
        );
        expect(saved.ok()).toBeTruthy();
    },
);

/**
 * Proposes a round, the way an agent would.
 *
 * Both proposals reference the same seeded model, because what these scenarios
 * assert is the choice machinery - stable ids, a rejection that is kept, an
 * attribution that survives - and none of it depends on the proposals being
 * different assets. The node's own asset is captured as candidate A by the
 * server, so this leaves the slot offering A, B and C.
 */
Given(
    "a store candidate has been proposed for the slot {string}",
    async ({ page }, slotId: string) => {
        // No store is needed for this: a store candidate is data the scene
        // carries - the title, price and picture are copied in when it is
        // proposed, precisely so the card still reads with the store down.
        const view = await fetchSceneByName(page, currentSceneName(page));

        const response = await page.request.post(
            `${apiBase()}/scenes/${view.scene.id}/slots/${slotId}/candidates`,
            {
                data: {
                    brief: "low-poly, reads as rundown",
                    candidates: [
                        {
                            rationale: "nothing in the library is low-poly",
                            storeUrl: "https://store.modelibr.com",
                            storeAssetId: "47f60614-522f-4ced-941c-318ac5c7bd34",
                            storeTitle: "Quaternius: Ultimate Furniture Pack",
                            storePrice: 0,
                            storeCurrency: "USD",
                        },
                    ],
                },
            },
        );
        expect(response.ok()).toBeTruthy();
    },
);

Given(
    "two candidates have been proposed for the slot {string}",
    async ({ page }, slotId: string) => {
        const model = testModel(page);
        const versionId = await testModelVersionId(page);
        const view = await fetchSceneByName(page, currentSceneName(page));

        const proposal = (rationale: string) => ({
            assetType: "Model",
            assetId: Number(model.id),
            versionId,
            rationale,
        });

        const response = await page.request.post(
            `${apiBase()}/scenes/${view.scene.id}/slots/${slotId}/candidates`,
            {
                data: {
                    brief: "low-poly, reads as rundown",
                    candidates: [
                        proposal("closest to the brief"),
                        proposal("cleaner, in case the brief is wrong"),
                    ],
                },
            },
        );
        expect(response.ok()).toBeTruthy();
    },
);

Then(
    "the choices panel should offer {string}",
    async ({ page }, candidateRef: string) => {
        const scenes = new ScenesPage(page);
        await expect(scenes.choicesLocator()).toBeVisible();
        await expect(scenes.candidateCard(candidateRef)).toBeVisible();
    },
);

Then(
    "the candidate {string} should be marked as not in the library",
    async ({ page }, candidateRef: string) => {
        const scenes = new ScenesPage(page);
        await expect(
            scenes.candidateCard(candidateRef).getByText("Not in your library"),
        ).toBeVisible();
    },
);

Then(
    "the candidate {string} cannot be chosen",
    async ({ page }, candidateRef: string) => {
        // Disabled rather than absent: the user should see that this option
        // exists and what settling on it would cost, not wonder where it went.
        await expect(
            page.locator(`[data-testid="scene-choices-choose-${candidateRef}"]`),
        ).toBeDisabled();
    },
);

Then(
    "the choices panel should still offer {string}",
    async ({ page }, candidateRef: string) => {
        // "Still" is the assertion: a rejected card stays on screen, greyed,
        // rather than disappearing. A deletion would lose the reason with it.
        await expect(
            new ScenesPage(page).candidateCard(candidateRef),
        ).toBeVisible();
    },
);

When(
    "I choose the candidate {string}",
    async ({ page }, candidateRef: string) => {
        await new ScenesPage(page).chooseCandidate(candidateRef);
    },
);

When(
    "I reject the whole round for the slot {string} saying {string}",
    async ({ page }, slotId: string, reason: string) => {
        await new ScenesPage(page).rejectWholeRound(slotId, reason);
    },
);

Then(
    "the slot {string} should be chosen as {string} by {string}",
    async ({ page }, slotId: string, candidateId: string, resolver: string) => {
        const slot = await fetchSlot(page, slotId);
        expect(slot.chosenCandidateId).toBe(candidateId);
        // The guardrail, checked end to end: a choice made by clicking is
        // recorded as the user's, whatever any request body might have claimed.
        expect(slot.resolvedBy).toBe(resolver);
        expect(slot.status).toBe("chosen");
    },
);

Then(
    "the slot {string} should record {string} against every candidate",
    async ({ page }, slotId: string, reason: string) => {
        const slot = await fetchSlot(page, slotId);
        expect(slot.candidates.length).toBeGreaterThan(0);
        for (const candidate of slot.candidates) {
            expect(candidate.rejected).toBe(true);
            expect(candidate.rejectedReason).toBe(reason);
        }
        expect(slot.reopenedReason).toBe(reason);
    },
);
