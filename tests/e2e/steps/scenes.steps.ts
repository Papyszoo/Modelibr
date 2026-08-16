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

When("I reopen the scene {string}", async ({ page }, name: string) => {
    const scenes = new ScenesPage(page);
    await scenes.backToList();
    await scenes.openScene(name);
});

/** Auxiliary-file responses seen while a multi-file model was being placed. */
const auxiliaryFetches = new WeakMap<Page, number[]>();

Given("I have imported a multi-file glTF model", async ({ page }) => {
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

    getScenarioState(page).setCustom("sceneMultiFileModelName", staged.modelName);
});

When(
    "I place the imported multi-file model into the scene",
    async ({ page }) => {
        const scenes = new ScenesPage(page);
        const modelName = getScenarioState(page).getCustom(
            "sceneMultiFileModelName",
        ) as string;

        // The .bin and .png are served from /files/<id>. Recording the statuses
        // is what makes the assertion below about loading, not about rendering -
        // software WebGL in CI cannot be asked whether geometry appeared.
        const statuses: number[] = [];
        const listener = (response: {
            url: () => string;
            status: () => number;
        }) => {
            if (/\/files\/\d+(\?|$)/.test(response.url())) {
                statuses.push(response.status());
            }
        };
        page.on("response", listener);
        auxiliaryFetches.set(page, statuses);

        await scenes.searchLibrary(modelName);
        await scenes.placeModel(modelName);
    },
);

Then(
    "the scene viewport should have fetched the model's auxiliary files",
    async ({ page }) => {
        const statuses = auxiliaryFetches.get(page) ?? [];

        // Before the resource map was wired in, the loader asked for the .bin
        // relative to the version-file route and never touched /files/<id> at
        // all - so an empty list here is the exact regression.
        await expect
            .poll(() => statuses.filter(status => status === 200).length, {
                message:
                    "the viewport never fetched an auxiliary file - the glTF's external .bin was not resolved",
                timeout: 20000,
            })
            .toBeGreaterThan(0);
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
