import { createBdd } from "playwright-bdd";
import { expect, Page, TestInfo } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { ProjectStudioPage } from "../pages/ProjectStudioPage";
import { fetchSceneByName } from "./scenes.steps";
import { ProjectsPage } from "../pages/ProjectsPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

/**
 * One project per Playwright worker. Scenarios inside a worker share it on
 * purpose - the studio is a shared surface and its chip/count assertions read
 * better against a single project - while parallel workers must not delete each
 * other's project mid-scenario.
 */
function projectNameFor(testInfo: TestInfo): string {
  return `Studio E2E Project W${testInfo.workerIndex}`;
}

function requireProject(page: Page, name: string) {
  const project = getScenarioState(page).getProject(name);
  if (!project) {
    throw new Error(`Studio project "${name}" was not provisioned`);
  }
  return project;
}

async function openStudio(page: Page, name: string) {
  const project = requireProject(page, name);
  const projectsPage = new ProjectsPage(page);
  const studio = new ProjectStudioPage(page);
  await projectsPage.navigateToProjectViewer(project.id);
  await studio.waitForStudio();
  return studio;
}

// ---- Level assets ---------------------------------------------------------
//
// A level owns no assets: what it shows is derived from the scenes filed under
// it. So the provisioning here is a scene, a level link, and a document that
// places models - the same three writes the product's own journey performs.

/** Aliases the Gherkin uses -> the real names the server derived, per worker. */
const LEVEL_ASSET_ALIASES = "level-assets:aliases";

function aliasKey(kind: "model" | "scene", alias: string): string {
  return `${kind}:${alias}`;
}

function rememberAlias(
  page: Page,
  kind: "model" | "scene",
  alias: string,
  actual: string,
): void {
  const state = getScenarioState(page);
  const aliases =
    state.getCustom<Record<string, string>>(LEVEL_ASSET_ALIASES) ?? {};
  aliases[aliasKey(kind, alias)] = actual;
  state.setCustom(LEVEL_ASSET_ALIASES, aliases);
}

function resolveAlias(
  page: Page,
  kind: "model" | "scene",
  alias: string,
): string {
  const actual =
    getScenarioState(page).getCustom<Record<string, string>>(
      LEVEL_ASSET_ALIASES,
    )?.[aliasKey(kind, alias)];
  if (!actual) {
    throw new Error(
      `No ${kind} was provisioned for the alias "${alias}" - a Given that creates it is missing.`,
    );
  }
  return actual;
}

/**
 * A unique model per alias, uploaded once per scenario and shared by every
 * scene the alias appears in - the dedup case needs the same asset in two
 * scenes, not two assets with one name.
 *
 * The GLB is written with a unique filename so two workers never collide on it,
 * and the Gherkin keeps calling it the alias rather than the generated name.
 */
async function ensureAliasedModel(
  page: Page,
  alias: string,
): Promise<{ id: number; name: string; versionId: number }> {
  const state = getScenarioState(page);
  const existing = state.getModel(alias);
  if (existing) {
    // Remembered on this path too, not only when the model is first created. A
    // model can reach shared state from an earlier scenario, and the Then steps
    // address assets by the real name they were uploaded under - without this the
    // alias resolves to nothing and the failure reads like a missing Given rather
    // than the bookkeeping it is.
    rememberAlias(page, "model", alias, existing.name);
    return {
      id: existing.id,
      name: existing.name,
      versionId: await activeModelVersionId(page, existing.id),
    };
  }

  const filePath = await UniqueFileGenerator.generate("test-cube.glb", {
    uniqueFilename: true,
  });
  const uploaded = await apiHelper.uploadModel(filePath);
  expect(
    uploaded.id,
    `Model for alias "${alias}" was not created`,
  ).toBeTruthy();

  // The upload response carries an id and a version id but NO name - the model is
  // named after the file, and the server reports that only when asked. Reading it
  // back is the only way to know what the library will call this asset, which is
  // exactly the label the derived view and the assertions address.
  const name = await modelName(page, uploaded.id);
  const versionId = await activeModelVersionId(page, uploaded.id);

  state.saveModel(alias, { id: uploaded.id, name });
  rememberAlias(page, "model", alias, name);
  return { id: uploaded.id, name, versionId };
}

/** The name the library gave a model, which is its uploaded file's name. */
async function modelName(page: Page, modelId: number): Promise<string> {
  const response = await page.request.get(`${API_BASE}/models/${modelId}`);
  expect(response.ok(), `Model ${modelId} could not be read back`).toBe(true);
  const model = await response.json();
  expect(model.name, `Model ${modelId} has no name`).toBeTruthy();
  return String(model.name);
}

/**
 * The model's current version, which a scene node has to pin.
 *
 * Read through the versions endpoint rather than taken from the upload response:
 * the same model can be reached again through shared state, by which time it may
 * have gained a version, and a node pinned to a version the model no longer has is
 * a document the server rejects.
 */
async function activeModelVersionId(
  page: Page,
  modelId: number,
): Promise<number> {
  const response = await page.request.get(
    `${API_BASE}/models/${modelId}/versions`,
  );
  expect(response.ok(), `Versions of model ${modelId} could not be read`).toBe(
    true,
  );
  const versions = await response.json();
  expect(
    versions.length,
    `Model ${modelId} has no version for a scene node to pin`,
  ).toBeGreaterThan(0);
  return Number(versions[0].id);
}

function sceneNode(
  id: string,
  name: string,
  assetId: number,
  versionId: number,
) {
  return {
    id,
    name,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    // versionId is REQUIRED, not optional: the server refuses an unpinned Model node
    // (Scene.DocumentInvalid) because it would silently re-point when the asset gets
    // a new version. Fetching the active version is what a real placement does.
    asset: { assetType: "Model", assetId, versionId },
    visible: true,
  };
}

/** The one level of a project by name, or a clear failure rather than undefined. */
async function requireLevel(page: Page, projectId: number, name: string) {
  const response = await page.request.get(
    `${API_BASE}/projects/${projectId}/levels`,
  );
  expect(response.ok()).toBeTruthy();
  const levels = await response.json();
  const level = levels.find((candidate: any) => candidate.name === name);
  expect(
    level,
    `Level "${name}" is missing from project ${projectId}`,
  ).toBeTruthy();
  return level;
}

/**
 * A scene for this worker, created on first use.
 *
 * Scene names are global, so the worker's index is part of the real name: two
 * workers running the same scenario would otherwise find each other's scene and
 * re-link it to the wrong project.
 */
async function ensureWorkerScene(
  page: Page,
  testInfo: TestInfo,
  alias: string,
): Promise<number> {
  const name = `${alias} W${testInfo.workerIndex}`;
  const listed = await page.request.get(`${API_BASE}/scenes`);
  expect(listed.ok()).toBeTruthy();
  const { scenes } = await listed.json();
  const existing = scenes.find(
    (scene: any) => scene.name === name && scene.projectId === null,
  );
  if (existing) {
    rememberAlias(page, "scene", alias, existing.name);
    return existing.id;
  }

  const created = await page.request.post(`${API_BASE}/scenes`, {
    data: { name, description: `${alias} for level assets coverage` },
  });
  expect(created.ok()).toBeTruthy();
  // POST /scenes answers with a SceneView - `{ scene: SceneSummary, document, ... }` -
  // not the summary itself. Reading `scene.id` off the view left the id undefined and
  // the next write went to /scenes/undefined/project, which the {id:int} route rejects
  // with an empty 404. The list read below returns bare summaries; this create does not.
  const view = await created.json();
  const scene = view.scene;
  rememberAlias(page, "scene", alias, scene.name);
  return scene.id;
}

Given(
  "a studio project exists for the production workspace",
  async ({ page, $testInfo }) => {
    const name = projectNameFor($testInfo);
    const listResponse = await page.request.get(`${API_BASE}/projects`);
    expect(listResponse.ok()).toBeTruthy();
    const listData = await listResponse.json();
    const existing = (listData.projects || []).find(
      (p: any) => p.name === name,
    );
    if (existing) {
      // A previous run's leftovers would make counts and link chips
      // ambiguous, so start from a project we own.
      await page.request.delete(`${API_BASE}/projects/${existing.id}`);
    }
    const created = await page.request.post(`${API_BASE}/projects`, {
      data: {
        name,
        description: "Project studio end-to-end coverage",
      },
    });
    expect(created.ok()).toBeTruthy();
    const data = await created.json();
    getScenarioState(page).saveProject(name, { id: data.id, name });
  },
);

Given("I am on the studio project", async ({ page, $testInfo }) => {
  await openStudio(page, projectNameFor($testInfo));
});

When(
  "I create the level {string} described as {string}",
  async ({ page }, name: string, description: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.createLevel(name, description, "Planned");
  },
);

Then(
  "the level {string} should show its description",
  async ({ page }, name: string) => {
    const studio = new ProjectStudioPage(page);
    const row = studio.levelRow(name);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(name);
  },
);

Given(
  "a level named {string} exists",
  async ({ page, $testInfo }, name: string) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const response = await page.request.get(
      `${API_BASE}/projects/${project.id}/levels`,
    );
    expect(response.ok()).toBeTruthy();
    const levels = await response.json();
    if (!levels.some((level: any) => level.name === name)) {
      const created = await page.request.post(
        `${API_BASE}/projects/${project.id}/levels`,
        { data: { name, description: `${name} description` } },
      );
      expect(created.ok()).toBeTruthy();
    }
  },
);

Given(
  "a character named {string} exists",
  async ({ page, $testInfo }, name: string) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const characters = await apiHelper.getProjectCharacters(project.id);
    if (!characters.some((character) => character.name === name)) {
      await apiHelper.createProjectCharacter(
        project.id,
        name,
        `${name} production description`,
        ["enemy", "boss"],
      );
    }
  },
);

When(
  "I create the character {string} tagged {string}",
  async ({ page }, name: string, tags: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.createCharacter(
      name,
      `${name} production description`,
      tags.split(",").map((tag) => tag.trim()),
    );
  },
);

Then(
  "the character {string} should show the {string} tag",
  async ({ page }, name: string, tag: string) => {
    const studio = new ProjectStudioPage(page);
    const card = studio.characterCard(name);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(
      card.getByTestId("project-character-tag").filter({ hasText: tag }),
    ).toBeVisible();
  },
);

Then(
  "the character {string} should be stored with its tags",
  async ({ page, $testInfo }, name: string) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const characters = await apiHelper.getProjectCharacters(project.id);
    const character = characters.find((c) => c.name === name);
    expect(character, `Character "${name}" missing from the API`).toBeTruthy();
    expect(character!.tags).toEqual(expect.arrayContaining(["enemy", "boss"]));
  },
);

When(
  "I add the ability {string} to character {string}",
  async ({ page }, ability: string, character: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.addAbility(character, ability, `${ability} description`);
  },
);

Then(
  "character {string} should list the ability {string}",
  async ({ page }, character: string, ability: string) => {
    const studio = new ProjectStudioPage(page);
    const card = await studio.openCharacterSection(character, "abilities");
    await expect(
      card.locator(
        `[data-testid="project-character-ability"][data-name="${ability}"]`,
      ),
    ).toBeVisible({ timeout: 15000 });
  },
);

Then(
  "the API should record the ability {string} on character {string}",
  async ({ page, $testInfo }, ability: string, characterName: string) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const characters = await apiHelper.getProjectCharacters(project.id);
    const character = characters.find((c) => c.name === characterName);
    expect(
      character?.abilities.map((a) => a.name),
      `Ability "${ability}" missing from the API`,
    ).toContain(ability);
  },
);

When(
  "I add the variant {string} to character {string} for level {string}",
  async ({ page }, variant: string, character: string, level: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.addVariant(
      character,
      variant,
      `${variant} description`,
      level,
    );
  },
);

Then(
  "character {string} should list variant {string} scoped to level {string}",
  async ({ page }, character: string, variant: string, level: string) => {
    const studio = new ProjectStudioPage(page);
    const card = await studio.openCharacterSection(character, "variants");
    const row = card.locator(
      `[data-testid="project-character-variant"][data-name="${variant}"]`,
    );
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(level);
  },
);

Then(
  "the API should scope variant {string} on character {string} to level {string}",
  async (
    { page, $testInfo },
    variant: string,
    characterName: string,
    level: string,
  ) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const characters = await apiHelper.getProjectCharacters(project.id);
    const character = characters.find((c) => c.name === characterName);
    const stored = character?.variants.find((v) => v.name === variant);
    expect(stored, `Variant "${variant}" missing from the API`).toBeTruthy();
    expect(stored!.projectLevelName).toBe(level);
  },
);

When(
  "I add the comment {string} to character {string}",
  async ({ page }, commentTitle: string, character: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.addCharacterComment(
      character,
      commentTitle,
      `${commentTitle} body`,
    );
  },
);

Then(
  "character {string} should use the enemy weaknesses area",
  async ({ page }, character: string) => {
    const studio = new ProjectStudioPage(page);
    const card = await studio.openCharacterSection(character, "comments");
    await expect(
      card.getByRole("heading", { name: /enemy weaknesses/i }),
    ).toBeVisible();
  },
);

Then(
  "character {string} should show the comment {string}",
  async ({ page }, character: string, commentTitle: string) => {
    const studio = new ProjectStudioPage(page);
    const card = await studio.openCharacterSection(character, "comments");
    await expect(
      card
        .getByTestId("project-character-comment")
        .filter({ hasText: commentTitle }),
    ).toBeVisible({ timeout: 15000 });
  },
);

When("I add a reference image to the board", async ({ page, $testInfo }) => {
  const studio = new ProjectStudioPage(page);
  const filePath = await UniqueFileGenerator.generate("red_color.png");
  await studio.uploadReferenceImage(filePath);

  // Capture the stored file id so the removal scenario can prove the library
  // file outlives the project association.
  const project = requireProject(page, projectNameFor($testInfo));
  const references = await apiHelper.getProjectReferences(project.id);
  expect(references).toHaveLength(1);
  getScenarioState(page).setCustom(
    "studio:referenceFileId",
    references[0].fileId,
  );
  getScenarioState(page).setCustom("studio:referenceId", references[0].id);
});

When(
  "I title the reference image {string}",
  async ({ page }, title: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.titleFirstReference(title);
  },
);

Then(
  "the reference image should be titled {string}",
  async ({ page }, title: string) => {
    const studio = new ProjectStudioPage(page);
    await expect(
      studio.referenceCards().first().getByTestId("project-reference-title"),
    ).toHaveValue(title, { timeout: 15000 });
  },
);

When(
  "I link the reference image to level {string}",
  async ({ page }, level: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.linkReference(studio.referenceCards().first(), "level", level);
  },
);

When(
  "I link the reference image to character {string}",
  async ({ page }, character: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.linkReference(
      studio.referenceCards().first(),
      "character",
      character,
    );
  },
);

Then(
  "the reference image should be linked to {string}",
  async ({ page }, target: string) => {
    const studio = new ProjectStudioPage(page);
    await expect(
      studio
        .referenceCards()
        .first()
        .getByTestId("project-reference-chip")
        .filter({ hasText: target }),
    ).toBeVisible({ timeout: 15000 });
  },
);

Then(
  "the API should link the reference image to {string}",
  async ({ page, $testInfo }, target: string) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const references = await apiHelper.getProjectReferences(project.id);
    const linked = references.some((reference) =>
      reference.links.some(
        (link) =>
          link.projectLevelName === target ||
          link.projectCharacterName === target,
      ),
    );
    expect(linked, `Reference link to "${target}" missing from the API`).toBe(
      true,
    );
  },
);

When(
  "I unlink level {string} from the reference image",
  async ({ page }, level: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.unlinkReference(studio.referenceCards().first(), level);
  },
);

Then(
  "the reference image should not be linked to {string}",
  async ({ page }, target: string) => {
    const studio = new ProjectStudioPage(page);
    await expect(
      studio
        .referenceCards()
        .first()
        .getByTestId("project-reference-chip")
        .filter({ hasText: target }),
    ).toHaveCount(0, { timeout: 15000 });
  },
);

When(
  "I add the comment {string} to the reference image",
  async ({ page }, commentTitle: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.addReferenceComment(
      studio.referenceCards().first(),
      commentTitle,
      `${commentTitle} body`,
    );
  },
);

Then(
  "the reference image should show the comment {string}",
  async ({ page }, commentTitle: string) => {
    const studio = new ProjectStudioPage(page);
    await expect(
      studio
        .referenceCards()
        .first()
        .getByTestId("project-reference-comment")
        .filter({ hasText: commentTitle }),
    ).toBeVisible({ timeout: 15000 });
  },
);

When("I remove the reference image from the project", async ({ page }) => {
  const studio = new ProjectStudioPage(page);
  await studio.removeReference(studio.referenceCards().first());
});

Then(
  "the reference board should be empty and the file should still exist",
  async ({ page, $testInfo }) => {
    const studio = new ProjectStudioPage(page);
    await expect(studio.referenceCards()).toHaveCount(0, { timeout: 15000 });

    const project = requireProject(page, projectNameFor($testInfo));
    const references = await apiHelper.getProjectReferences(project.id);
    expect(references).toHaveLength(0);

    // The project no longer holds the image; the library file is untouched,
    // so its preview endpoint must still answer.
    const fileId = getScenarioState(page).getCustom<number>(
      "studio:referenceFileId",
    );
    expect(fileId, "No reference file id captured for the upload").toBeTruthy();
    const preview = await apiHelper.getFilePreview(fileId!);
    expect(preview.status).toBe(200);
  },
);

/**
 * Files a scene under a level and places models in it.
 *
 * Three writes in the order the domain requires them: a scene must belong to a
 * project before it can belong to one of that project's levels, the document
 * says what the scene places, and the level link is what makes those placements
 * this level's. `modelAliases` is a comma-separated list so one Given can place
 * the same alias in two scenes - the case the derived view has to deduplicate.
 */
Given(
  "a scene {string} is linked to level {string} placing {string}",
  async (
    { page, $testInfo },
    sceneAlias: string,
    levelName: string,
    modelAliases: string,
  ) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const level = await requireLevel(page, project.id, levelName);
    const sceneId = await ensureWorkerScene(page, $testInfo, sceneAlias);

    const linked = await page.request.put(
      `${API_BASE}/scenes/${sceneId}/project`,
      { data: { projectId: project.id } },
    );
    // The body, not just the status: "could not be linked" with nothing else is
    // the one failure here that says nothing about why.
    expect(
      linked.ok(),
      `The scene could not be linked to the project: ${linked.status()} ${await linked.text()}`,
    ).toBe(true);

    const detail = await page.request.get(`${API_BASE}/scenes/${sceneId}`);
    expect(detail.ok()).toBeTruthy();
    const view = await detail.json();

    // The document is REPLACED with the placements this step declares rather
    // than appended to. A scene survives a project's deletion (only its links
    // are cleared) and this worker reuses it, so appending would accumulate a
    // previous scenario's placements - and the assertions would then be about
    // leftovers. One Given, one known state.
    const nodes = [];
    for (const alias of modelAliases
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)) {
      const model = await ensureAliasedModel(page, alias);
      // The node carries the model's real name: it is what the view falls back
      // to for an asset the project's member list cannot name.
      //
      // The id is a slug off the alias, not the alias itself. Node ids allow
      // letters, digits, '-', '_', ':' and '.', and these aliases are human names
      // with spaces - which the server rejects, naming the offending character. The
      // id only has to be unique inside the scene, so a slug is enough.
      const nodeId = alias
        .toLowerCase()
        .replace(/[^a-z0-9._:-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      nodes.push(
        sceneNode(`${nodeId}-node`, model.name, model.id, model.versionId),
      );
    }

    const saved = await page.request.put(
      `${API_BASE}/scenes/${sceneId}/document`,
      { data: { documentJson: JSON.stringify({ ...view.document, nodes }) } },
    );
    // The server's own message, not a bare "not ok": a rejected document names the
    // field it refused, which is the only way to tell a wrong node shape from a
    // lost revision race.
    expect(
      saved.ok(),
      `The scene document was not saved: ${await saved.text()}`,
    ).toBe(true);

    // At most one primary per level: the first scene filed under this level
    // claims it, and a later one must not steal it.
    const listed = await page.request.get(`${API_BASE}/scenes`);
    const { scenes } = await listed.json();
    const alreadyPrimary = scenes.some(
      (scene: any) =>
        scene.projectLevelId === level.id && scene.isPrimaryLevelScene,
    );
    const leveled = await page.request.put(
      `${API_BASE}/scenes/${sceneId}/level`,
      {
        data: {
          projectLevelId: level.id,
          // The endpoint's request record names this `isPrimary` (JSON for
          // IsPrimary). Sending `isPrimaryLevelScene` - the response's name -
          // silently bound nothing and defaulted it to false, so the first
          // scene filed never claimed primary.
          isPrimary: !alreadyPrimary,
        },
      },
    );
    expect(leveled.ok(), "The scene could not be linked to the level").toBe(
      true,
    );
  },
);

Given(
  "the model {string} is an explicit project member",
  async ({ page, $testInfo }, modelAlias: string) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const model = await ensureAliasedModel(page, modelAlias);
    const response = await page.request.post(
      `${API_BASE}/projects/${project.id}/models/${model.id}`,
    );
    expect(response.ok(), "The model could not be added to the project").toBe(
      true,
    );
  },
);

When(
  "the level {string} is deleted",
  async ({ page, $testInfo }, name: string) => {
    const project = requireProject(page, projectNameFor($testInfo));
    const levels = await page.request.get(
      `${API_BASE}/projects/${project.id}/levels`,
    );
    expect(levels.ok()).toBeTruthy();
    const level = (await levels.json()).find(
      (candidate: { name: string }) => candidate.name === name,
    );
    expect(level, `no level named ${name}`).toBeTruthy();
    const deleted = await page.request.delete(
      `${API_BASE}/projects/${project.id}/levels/${level.id}`,
    );
    expect(deleted.ok()).toBeTruthy();
  },
);

When("I open the level {string}", async ({ page }, levelName: string) => {
  const studio = new ProjectStudioPage(page);
  await studio.openLevelWorkspace(levelName);
});

When("I go back to the project from the level", async ({ page }) => {
  await new ProjectStudioPage(page).leaveLevelWorkspace();
});

When("I show the scenes of the level", async ({ page }) => {
  await new ProjectStudioPage(page).showLevelSurface("scenes");
});

When("I show the assets of the level", async ({ page }) => {
  await new ProjectStudioPage(page).showLevelSurface("assets");
});

Then(
  "the level workspace should be showing {string}",
  async ({ page }, name: string) => {
    await expect(
      new ProjectStudioPage(page).page.getByTestId("project-level-crumb-level"),
    ).toHaveText(name, { timeout: 15000 });
  },
);

Then(
  "the level workspace should offer its own four surfaces",
  async ({ page }) => {
    const studio = new ProjectStudioPage(page);
    await expect(studio.levelWorkspaceSurfaces).toBeVisible();
    await expect(studio.levelWorkspaceSurfaces.getByRole("tab")).toHaveCount(4);
    // The project's Cast has no meaning inside one level, so its absence is part
    // of the claim that the level has its own vocabulary.
    await expect(
      studio.levelWorkspaceSurfaces.getByRole("tab", { name: /Assets/ }),
    ).toBeVisible();
    await expect(
      studio.levelWorkspaceSurfaces.getByRole("tab", { name: /Scenes/ }),
    ).toBeVisible();
    await expect(
      studio.levelWorkspaceSurfaces.getByRole("tab", { name: /Cast/ }),
    ).toHaveCount(0);
  },
);

Then(
  "the project workspace should be showing its own four surfaces",
  async ({ page }) => {
    const studio = new ProjectStudioPage(page);
    await expect(studio.projectWorkspaceSurfaces).toBeVisible();
    await expect(studio.projectWorkspaceSurfaces.getByRole("tab")).toHaveCount(
      4,
    );
    await expect(
      studio.projectWorkspaceSurfaces.getByRole("tab", { name: /Cast/ }),
    ).toBeVisible();
  },
);

Then(
  "the level row {string} should show its description",
  async ({ page }, name: string) => {
    // A level card is a summary, so its description belongs on the row rather
    // than behind a click.
    const row = new ProjectStudioPage(page).page.locator(
      `[data-testid="project-level-row"][data-level-name="${name}"]`,
    );
    // The provisioning step gives the level "<name> description"; asserting the
    // row carries a description at all would pass on a name, so the text matters.
    await expect(row).toContainText(`${name} description`);
  },
);

Then(
  "the level row {string} should offer to open a workspace",
  async ({ page }, name: string) => {
    const row = new ProjectStudioPage(page).page.locator(
      `[data-testid="project-level-row"][data-level-name="${name}"]`,
    );
    await expect(row.getByTestId("project-level-open")).toBeVisible();
  },
);

Then(
  "the level should list {int} scene(s)",
  async ({ page }, count: number) => {
    await expect(
      new ProjectStudioPage(page).page.getByTestId("project-level-scene-row"),
    ).toHaveCount(count, { timeout: 15000 });
  },
);

Then(
  "the level scene {string} should be marked primary",
  async ({ page }, sceneName: string) => {
    await expect(
      new ProjectStudioPage(page).levelSceneRow(sceneName),
    ).toHaveAttribute("data-primary", "true");
  },
);

Then(
  "the level scene {string} should not be marked primary",
  async ({ page }, sceneName: string) => {
    await expect(
      new ProjectStudioPage(page).levelSceneRow(sceneName),
    ).toHaveAttribute("data-primary", "false");
  },
);

Then(
  "the level should place {string}",
  async ({ page }, modelAlias: string) => {
    const studio = new ProjectStudioPage(page);
    // Resolve the alias to the name the library gave the upload, as the other
    // asset assertions do - the derived row is labelled with that real name,
    // not the Gherkin alias.
    await expect(
      studio.levelAssetRow(resolveAlias(page, "model", modelAlias)),
    ).toBeVisible({ timeout: 20000 });
  },
);

Then("the level assets should offer no level picker", async ({ page }) => {
  // The level's Assets view *is* the filter. A picker there would let the user
  // navigate out of the level they opened.
  await expect(
    new ProjectStudioPage(page).page.getByTestId("level-assets-level"),
  ).toHaveCount(0);
});

Then("the missing-level notice should be shown", async ({ page }) => {
  await expect(
    new ProjectStudioPage(page).page.getByText("This level no longer exists"),
  ).toBeVisible({ timeout: 15000 });
});

When("I leave the missing level", async ({ page }) => {
  // The notice's own way out. The breadcrumb the other scenarios use lives in
  // the workspace shell, which is exactly what a missing level no longer renders.
  await page.getByRole("button", { name: "Back to levels" }).click();
});
Given(
  "a variant {string} of character {string} is scoped to level {string}",
  async ({ page, $testInfo }, variant, characterName, levelName) => {
    // Provisioned rather than clicked: this scenario is about the level reading
    // the variant, and driving the character editor to get there would be a
    // different scenario that already exists.
    const project = requireProject(page, projectNameFor($testInfo));
    const level = await requireLevel(page, project.id, levelName);
    const characters = await apiHelper.getProjectCharacters(project.id);
    const character = characters.find(
      (candidate: { name: string }) => candidate.name === characterName,
    );
    if (!character) {
      throw new Error(`no character named ${characterName}`);
    }
    const created = await page.request.post(
      `${API_BASE}/projects/${project.id}/characters/${character.id}/variants`,
      {
        data: {
          name: variant,
          description: `${variant} description`,
          projectLevelId: level.id,
        },
      },
    );
    expect(
      created.ok(),
      `The variant could not be created: ${created.status()} ${await created.text()}`,
    ).toBe(true);
  },
);

Then(
  "the level workspace should list {int} character variant(s)",
  async ({ page }, count: number) => {
    await expect(
      new ProjectStudioPage(page).page.getByTestId(
        "project-level-variant-count",
      ),
    ).toHaveText(String(count), { timeout: 15000 });
  },
);

Then(
  "the level workspace should name the variant {string}",
  async ({ page }, name: string) => {
    const chips = new ProjectStudioPage(page).page.getByTestId(
      "project-level-variants",
    );
    await expect(chips).toContainText(name, { timeout: 15000 });
  },
);

When(
  "I press the scene control of the level {string}",
  async ({ page }, levelName: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.pressLevelSceneControl(levelName);
  },
);

When(
  "I show the level assets of {string}",
  async ({ page }, levelName: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.waitForLevelAssets();
    await studio.showLevelAssetsFor(levelName);
  },
);

Then(
  "the scene {string} should be filed under that level",
  async ({ page, $testInfo }, sceneName: string) => {
    // Through the API, not the derived view: the editor tab is the active one by
    // now, and "the level's assets panel says nothing yet" would be a claim about
    // an empty scene rather than about the filing. The level has to be one of
    // THIS worker's, or the assertion could pass against somebody else's.
    const project = requireProject(page, projectNameFor($testInfo));
    const levels = await page.request.get(
      `${API_BASE}/projects/${project.id}/levels`,
    );
    expect(levels.ok()).toBeTruthy();
    const level = (await levels.json()).find(
      (candidate: { name: string }) => candidate.name === sceneName,
    );
    expect(level, `no level named ${sceneName}`).toBeTruthy();

    // The detail endpoint nests the summary: the filing is a field of the scene,
    // not of the document beside it.
    const view = await fetchSceneByName(page, sceneName);
    expect(view.scene.projectLevelId).toBe(level.id);
    expect(view.scene.isPrimaryLevelScene).toBe(true);
  },
);

Then(
  "the level asset {string} should list the scene {string}",
  async ({ page }, modelAlias: string, sceneAlias: string) => {
    const studio = new ProjectStudioPage(page);
    const row = studio.levelAssetRow(resolveAlias(page, "model", modelAlias));
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(
      studio
        .levelAssetScenes(row)
        .filter({ hasText: resolveAlias(page, "scene", sceneAlias) }),
    ).toBeVisible({ timeout: 15000 });
  },
);

Then(
  "the level asset {string} should not list the scene {string}",
  async ({ page }, modelAlias: string, sceneAlias: string) => {
    const studio = new ProjectStudioPage(page);
    const row = studio.levelAssetRow(resolveAlias(page, "model", modelAlias));
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(
      studio
        .levelAssetScenes(row)
        .filter({ hasText: resolveAlias(page, "scene", sceneAlias) }),
    ).toHaveCount(0, { timeout: 15000 });
  },
);

Then(
  "the level should place {string} exactly once",
  async ({ page }, modelAlias: string) => {
    const studio = new ProjectStudioPage(page);
    const label = resolveAlias(page, "model", modelAlias);
    await expect(
      studio.levelAssetGroup.locator(
        `[data-testid="level-assets-row"][data-asset-label="${label}"]`,
      ),
    ).toHaveCount(1, { timeout: 15000 });
  },
);

/**
 * The same asset in two lists is the point: it is placed by a scene AND it is a
 * member of the project, and those are two different facts. One merged list
 * would make the second unknowable.
 */
Then(
  "the project member {string} should be listed apart from the placed assets",
  async ({ page }, modelAlias: string) => {
    const studio = new ProjectStudioPage(page);
    const label = resolveAlias(page, "model", modelAlias);

    await expect(
      studio.projectMemberGroup.locator(
        `[data-testid="level-assets-member-row"][data-asset-label="${label}"]`,
      ),
    ).toBeVisible({ timeout: 15000 });
    // Still derived from the scene as well - the two groups do not exclude
    // each other, they report two relationships.
    await expect(studio.levelAssetRow(label)).toBeVisible({ timeout: 15000 });
  },
);
