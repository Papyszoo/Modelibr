import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { ProjectStudioPage } from "../pages/ProjectStudioPage";
import { ProjectsPage } from "../pages/ProjectsPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

const PROJECT_KEY = "profile:project";
const MODELS_KEY = "profile:member-models";
const CHARACTERS_KEY = "profile:characters";

interface ProfileProject {
    id: number;
    name: string;
}

function project(page: Page): ProfileProject {
    const found = getScenarioState(page).getCustom<ProfileProject>(PROJECT_KEY);
    if (!found) {
        throw new Error(
            'No profile project was provisioned - the Background "a profile project exists" is missing.',
        );
    }
    return found;
}

function memberModels(page: Page): Record<string, { id: number; name: string }> {
    const state = getScenarioState(page);
    let models = state.getCustom<Record<string, { id: number; name: string }>>(
        MODELS_KEY,
    );
    if (!models) {
        models = {};
        state.setCustom(MODELS_KEY, models);
    }
    return models;
}

function character(page: Page, alias: string): { id: number; name: string } {
    const found = getScenarioState(page).getCustom<
        Record<string, { id: number; name: string }>
    >(CHARACTERS_KEY)?.[alias];
    if (!found) {
        throw new Error(
            `No character "${alias}" was provisioned in this scenario.`,
        );
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

/** Opens the project viewer on its Details surface, where the shell and profile live. */
async function openProjectDetails(page: Page, projectId: number): Promise<void> {
    await new ProjectsPage(page).navigateToProjectViewer(projectId);
    await new ProjectStudioPage(page).waitForStudio();
    await page.getByTestId("container-tab-details").click();
}

function profileRow(page: Page, dimension: string) {
    return page
        .locator(".project-profile-row")
        .filter({ has: page.getByTestId(`profile-${dimension}`) });
}

async function addProfileValue(
    page: Page,
    dimension: string,
    value: string,
): Promise<void> {
    const input = page.getByTestId(`profile-${dimension}`);
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill(value);
    await expect(input).toHaveValue(value);
    await input.press("Enter");
}

// ---- Background -----------------------------------------------------------------

Given("a profile project exists", async ({ page, $testInfo }) => {
    const name = `Profile E2E Project W${$testInfo.workerIndex}`;
    const listed = await page.request.get(`${API_BASE}/projects`);
    await expectOk(listed, "Projects could not be listed");
    for (const stale of ((await listed.json()).projects || []).filter(
        (candidate: { name: string }) => candidate.name === name,
    )) {
        await page.request.delete(`${API_BASE}/projects/${stale.id}`);
    }
    const created = await apiHelper.createProject(
        name,
        "Project profile end-to-end coverage",
    );
    getScenarioState(page).setCustom(PROJECT_KEY, { id: created.id, name });
});

// ---- Profile section --------------------------------------------------------------

When("I open the details of the profile project", async ({ page }) => {
    await openProjectDetails(page, project(page).id);
});

When("I expand the project profile section", async ({ page }) => {
    await page
        .locator("details.project-profile-disclosure")
        .locator("summary")
        .click();
    await expect(page.getByTestId("project-profile")).toBeVisible({
        timeout: 15000,
    });
});

When("I add the profile style {string}", async ({ page }, value: string) => {
    await addProfileValue(page, "style", value);
});

When("I add the profile platform {string}", async ({ page }, value: string) => {
    await addProfileValue(page, "platform", value);
});

When("I save the project profile", async ({ page }) => {
    const saved = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname ===
                `/projects/${project(page).id}/profile` &&
            response.request().method() === "PUT",
        { timeout: 15000 },
    );
    await page.getByTestId("project-profile-save").click();
    expect((await saved).ok()).toBeTruthy();
});

Then(
    "the project profile should suggest the {string} budget",
    async ({ page }, platform: string) => {
        await expect(
            page.getByTestId("project-profile-suggestion"),
        ).toContainText(platform, { timeout: 15000 });
    },
);

Then(
    "the project brief should state the style {string}",
    async ({ page }, style: string) => {
        const toggle = page.getByTestId("project-profile-brief-toggle");
        if ((await toggle.getAttribute("aria-expanded")) !== "true") {
            await toggle.click();
        }
        await expect(page.getByTestId("project-profile-brief")).toContainText(
            `Style: ${style}`,
            { timeout: 15000 },
        );
    },
);

Then(
    "the stored project profile should include the style {string} and the platform {string}",
    async ({ page }, style: string, platform: string) => {
        const response = await page.request.get(
            `${API_BASE}/projects/${project(page).id}/profile`,
        );
        await expectOk(response, "The project profile could not be read");
        const brief = await response.json();
        expect(
            brief.styles.map((value: { name: string }) => value.name),
            JSON.stringify(brief),
        ).toContain(style);
        expect(
            brief.platforms.map((value: { name: string }) => value.name),
            JSON.stringify(brief),
        ).toContain(platform);
    },
);

Then(
    "the profile style options should include {string}",
    async ({ page }, option: string) => {
        const row = profileRow(page, "style");
        await row
            .getByRole("button", { name: "Show Available styles" })
            .click();
        await expect(
            row
                .locator(".tag-input-suggestions-list")
                .getByRole("button", { name: option, exact: true }),
        ).toBeVisible({ timeout: 15000 });
    },
);

// ---- The project shell ------------------------------------------------------------

Then("the project workspace should offer its four views", async ({ page }) => {
    const studio = new ProjectStudioPage(page);
    await expect(studio.projectWorkspaceSurfaces).toBeVisible({
        timeout: 15000,
    });
    await expect(studio.projectWorkspaceSurfaces.getByRole("tab")).toHaveCount(4);
});

When(
    "I switch the project workspace to the {string} view",
    async ({ page }, view: string) => {
        await new ProjectStudioPage(page).showWorkspaceView(
            view as "overview" | "levels" | "cast" | "references",
        );
    },
);

Then(
    "the project workspace should show the cast surface",
    async ({ page }) => {
        await expect(new ProjectStudioPage(page).characters).toBeVisible({
            timeout: 15000,
        });
    },
);

Then(
    "the project workspace should show the references surface",
    async ({ page }) => {
        await expect(new ProjectStudioPage(page).referenceBoard).toBeVisible({
            timeout: 15000,
        });
    },
);

Then(
    "the project workspace should show the levels surface",
    async ({ page }) => {
        await expect(
            page.getByRole("heading", { name: "Levels", exact: true }),
        ).toBeVisible({ timeout: 15000 });
    },
);

// ---- Cast: linking a model to a character ------------------------------------------

Given(
    "the profile project has a member model {string}",
    async ({ page }, alias: string) => {
        const existing = memberModels(page)[alias];
        if (existing) {
            return;
        }
        const filePath = await UniqueFileGenerator.generate("test-cube.glb", {
            uniqueFilename: true,
        });
        const uploaded = await apiHelper.uploadModel(filePath);
        expect(uploaded.id, `Model "${alias}" was not uploaded`).toBeTruthy();

        const added = await page.request.post(
            `${API_BASE}/projects/${project(page).id}/models/${uploaded.id}`,
        );
        await expectOk(added, `The model "${alias}" was not added to the project`);

        const detail = await page.request.get(
            `${API_BASE}/models/${uploaded.id}`,
        );
        await expectOk(detail, `The model "${alias}" could not be read back`);
        memberModels(page)[alias] = {
            id: uploaded.id,
            name: String((await detail.json()).name),
        };
    },
);

Given(
    "the profile project has a character {string}",
    async ({ page }, alias: string) => {
        const created = await apiHelper.createProjectCharacter(
            project(page).id,
            alias,
            `${alias} description`,
            ["npc"],
        );
        const state = getScenarioState(page);
        const characters =
            state.getCustom<Record<string, { id: number; name: string }>>(
                CHARACTERS_KEY,
            ) ?? {};
        characters[alias] = { id: created.id, name: created.name };
        state.setCustom(CHARACTERS_KEY, characters);
    },
);

When(
    "I link the model {string} to the character {string} in the cast",
    async ({ page }, modelAlias: string, characterAlias: string) => {
        const model = memberModels(page)[modelAlias];
        expect(model, `No member model "${modelAlias}" was provisioned`).toBeTruthy();
        const target = character(page, characterAlias);

        const studio = new ProjectStudioPage(page);
        const card = await studio.openCharacterSection(target.name, "media");
        await card
            .getByLabel(`Link a model to ${target.name}`)
            .selectOption({ label: model.name });
        const linked = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname ===
                    `/projects/${project(page).id}/characters/${target.id}/models` &&
                response.request().method() === "POST",
            { timeout: 15000 },
        );
        await card.getByRole("button", { name: "Link model" }).click();
        expect((await linked).ok()).toBeTruthy();
    },
);

Then(
    "the character {string} should list the linked model {string}",
    async ({ page }, characterAlias: string, modelAlias: string) => {
        const model = memberModels(page)[modelAlias];
        const card = await new ProjectStudioPage(page).openCharacterSection(
            character(page, characterAlias).name,
            "media",
        );
        await expect(
            card
                .getByTestId("project-character-model")
                .filter({ hasText: model.name }),
        ).toBeVisible({ timeout: 15000 });
    },
);

Then(
    "the API should link model {string} to character {string}",
    async ({ page }, modelAlias: string, characterAlias: string) => {
        const model = memberModels(page)[modelAlias];
        const characters = await apiHelper.getProjectCharacters(
            project(page).id,
        );
        const stored = characters.find(
            (candidate) => candidate.id === character(page, characterAlias).id,
        ) as unknown as { models: Array<{ modelId: number }> } | undefined;
        expect(stored, `Character "${characterAlias}" is missing`).toBeTruthy();
        expect(stored!.models.map((entry) => entry.modelId)).toContain(
            model.id,
        );
    },
);
