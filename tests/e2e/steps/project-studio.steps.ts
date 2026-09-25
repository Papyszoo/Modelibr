import { createBdd } from "playwright-bdd";
import { expect, Page, TestInfo } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { ProjectStudioPage } from "../pages/ProjectStudioPage";
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
  "I add the note {string} to character {string}",
  async ({ page }, noteTitle: string, character: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.addCharacterNote(character, noteTitle, `${noteTitle} body`);
  },
);

Then(
  "character {string} should use the enemy notes area",
  async ({ page }, character: string) => {
    const studio = new ProjectStudioPage(page);
    const card = await studio.openCharacterSection(character, "notes");
    await expect(
      card.getByRole("heading", { name: /enemy notes/i }),
    ).toBeVisible();
  },
);

Then(
  "character {string} should show the note {string}",
  async ({ page }, character: string, noteTitle: string) => {
    const studio = new ProjectStudioPage(page);
    const card = await studio.openCharacterSection(character, "notes");
    await expect(
      card.getByTestId("project-character-note").filter({ hasText: noteTitle }),
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
  "I add the note {string} to the reference image",
  async ({ page }, noteTitle: string) => {
    const studio = new ProjectStudioPage(page);
    await studio.addReferenceNote(
      studio.referenceCards().first(),
      noteTitle,
      `${noteTitle} body`,
    );
  },
);

Then(
  "the reference image should show the note {string}",
  async ({ page }, noteTitle: string) => {
    const studio = new ProjectStudioPage(page);
    await expect(
      studio
        .referenceCards()
        .first()
        .getByTestId("project-reference-note")
        .filter({ hasText: noteTitle }),
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
