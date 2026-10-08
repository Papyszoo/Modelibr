import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

// ---- Scenario state -----------------------------------------------------------

const PROJECT_KEY = "mcp-project:project";
const MCP_KEY = "mcp-project:mcp";
const LAST_RESULT_KEY = "mcp-project:last-result";
const LAST_WRITE_KEY = "mcp-project:last-write";
const REFERENCE_FILE_KEY = "mcp-project:reference-file";
const SCENE_KEY = "mcp-project:scene";

interface McpProject {
    id: number;
    name: string;
}

function project(page: Page): McpProject {
    const found = getScenarioState(page).getCustom<McpProject>(PROJECT_KEY);
    if (!found) {
        throw new Error(
            'No MCP project was provisioned - the Background "an MCP project exists" is missing.',
        );
    }
    return found;
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
        throw new Error(
            "No MCP result was captured - a When step that calls a tool is missing.",
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

/** A profile option id from the shared vocabulary, by dimension and name. */
async function profileOptionId(
    page: Page,
    dimension: string,
    name: string,
): Promise<number> {
    const response = await page.request.get(
        `${API_BASE}/projects/profile-options`,
    );
    await expectOk(response, "The profile options could not be read");
    const option = (await response.json()).options.find(
        (candidate: { dimension: string; name: string }) =>
            candidate.dimension === dimension && candidate.name === name,
    );
    expect(
        option,
        `The ${dimension} vocabulary has no "${name}"`,
    ).toBeTruthy();
    return option.id;
}

// ---- Background -----------------------------------------------------------------

Given("an MCP project exists", async ({ page, $testInfo }) => {
    const name = `MCP E2E Project W${$testInfo.workerIndex}`;
    const listed = await page.request.get(`${API_BASE}/projects`);
    await expectOk(listed, "Projects could not be listed");
    for (const stale of ((await listed.json()).projects || []).filter(
        (candidate: { name: string }) => candidate.name === name,
    )) {
        await page.request.delete(`${API_BASE}/projects/${stale.id}`);
    }
    const created = await apiHelper.createProject(
        name,
        "Project MCP tool coverage",
    );
    getScenarioState(page).setCustom(PROJECT_KEY, { id: created.id, name });
});

Given(
    "the MCP project profile is style {string} and platform {string}",
    async ({ page }, style: string, platform: string) => {
        const response = await page.request.put(
            `${API_BASE}/projects/${project(page).id}/profile`,
            {
                data: {
                    dimensions: {
                        style: [
                            {
                                optionId: await profileOptionId(
                                    page,
                                    "style",
                                    style,
                                ),
                            },
                        ],
                        platform: [
                            {
                                optionId: await profileOptionId(
                                    page,
                                    "platform",
                                    platform,
                                ),
                            },
                        ],
                    },
                },
            },
        );
        await expectOk(response, "The project profile could not be set");
    },
);

// ---- Provisioning ---------------------------------------------------------------

Given(
    "the MCP project has a level {string}",
    async ({ page }, name: string) => {
        const created = await page.request.post(
            `${API_BASE}/projects/${project(page).id}/levels`,
            { data: { name, description: `${name} description` } },
        );
        await expectOk(created, `The level "${name}" could not be created`);
    },
);

Given(
    "the MCP project has a character {string}",
    async ({ page }, name: string) => {
        await apiHelper.createProjectCharacter(
            project(page).id,
            name,
            `${name} description`,
            ["npc"],
        );
    },
);

When("an uploaded reference image exists", async ({ page }) => {
    const filePath = await UniqueFileGenerator.generate("blue_color.png");
    const { fileId } = await apiHelper.uploadFile(filePath);
    getScenarioState(page).setCustom(REFERENCE_FILE_KEY, fileId);
});

When("a standalone scene exists", async ({ page, $testInfo }) => {
    const name = `MCP Standalone W${$testInfo.workerIndex}`;
    const created = await page.request.post(`${API_BASE}/scenes`, {
        data: { name, description: "Project MCP tool coverage" },
    });
    await expectOk(created, "The scene could not be created");
    const view = await created.json();
    getScenarioState(page).setCustom(SCENE_KEY, {
        id: view.scene.id,
        name: view.scene.name,
    });
});

// ---- Read tools -----------------------------------------------------------------

When("an agent lists projects over MCP", async ({ page }) => {
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (await mcp(page)).callTool("list_projects", {}),
    );
});

Then(
    "the MCP project list should include this project",
    async ({ page }) => {
        const listed = lastResult(page);
        const summary = (listed.projects ?? []).find(
            (candidate: { id: number }) => candidate.id === project(page).id,
        );
        expect(summary, JSON.stringify(listed)).toBeTruthy();
        expect(summary.name).toBe(project(page).name);
        expect(typeof summary.modelCount).toBe("number");
        expect(typeof summary.sceneCount).toBe("number");
    },
);

Then(
    "the MCP project summary should list the style {string} and the platform {string}",
    async ({ page }, style: string, platform: string) => {
        const summary = (lastResult(page).projects ?? []).find(
            (candidate: { id: number }) => candidate.id === project(page).id,
        );
        expect(summary.styles).toContain(style);
        expect(summary.platforms).toContain(platform);
    },
);

When("an agent reads the project brief over MCP", async ({ page }) => {
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (
            await mcp(page)
        ).callTool("get_project", { projectId: project(page).id }),
    );
});

Then(
    "the MCP brief should list the style {string}",
    async ({ page }, style: string) => {
        const brief = lastResult(page);
        expect(
            (brief.styles ?? []).map(
                (value: { name: string }) => value.name,
            ),
            JSON.stringify(brief),
        ).toContain(style);
    },
);

Then(
    "the MCP brief should suggest the {string} budget",
    async ({ page }, platform: string) => {
        const suggestion = lastResult(page).budgetSuggestion;
        expect(suggestion, JSON.stringify(lastResult(page))).toBeTruthy();
        expect(suggestion.platform).toBe(platform);
        expect(suggestion.maxTrianglesPerAsset).toBeGreaterThan(0);
    },
);

Then(
    "the MCP brief guidance should mention the style {string}",
    async ({ page }, style: string) => {
        const guidance: string[] = lastResult(page).guidance ?? [];
        expect(
            guidance.some((line) => line.includes(`Style: ${style}`)),
            JSON.stringify(guidance),
        ).toBe(true);
    },
);

Then(
    "the MCP brief style signals should boost {string}",
    async ({ page }, token: string) => {
        const signals = lastResult(page).styleSignals;
        expect(signals, JSON.stringify(lastResult(page))).toBeTruthy();
        expect(signals.boostTokens).toContain(token);
    },
);

When(
    "an agent lists the project levels over MCP",
    async ({ page }) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("list_project_levels", { projectId: project(page).id }),
        );
    },
);

Then("the MCP levels should include {string}", async ({ page }, name: string) => {
    const levels = lastResult(page).levels ?? [];
    expect(
        levels.map((level: { name: string }) => level.name),
        JSON.stringify(levels),
    ).toContain(name);
});

Then(
    "the MCP levels should show {string} with status {string}",
    async ({ page }, name: string, status: string) => {
        const level = (lastResult(page).levels ?? []).find(
            (candidate: { name: string }) => candidate.name === name,
        );
        expect(level, JSON.stringify(lastResult(page))).toBeTruthy();
        expect(level.productionStatus).toBe(status);
    },
);

When(
    "an agent lists the project characters over MCP",
    async ({ page }) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("list_project_characters", {
                projectId: project(page).id,
            }),
        );
    },
);

Then(
    "the MCP characters should include {string}",
    async ({ page }, name: string) => {
        const characters = lastResult(page).characters ?? [];
        expect(
            characters.map((character: { name: string }) => character.name),
            JSON.stringify(characters),
        ).toContain(name);
    },
);

Then(
    "the MCP characters should show {string} tagged {string}",
    async ({ page }, name: string, tag: string) => {
        const character = (lastResult(page).characters ?? []).find(
            (candidate: { name: string }) => candidate.name === name,
        );
        expect(character, JSON.stringify(lastResult(page))).toBeTruthy();
        expect(character.tags).toContain(tag);
    },
);

When(
    "an agent lists the project profile options for {string}",
    async ({ page }, dimension: string) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("list_project_profile_options", { dimension }),
        );
    },
);

Then(
    "the MCP profile options should include the built-in {string} {string}",
    async ({ page }, dimension: string, name: string) => {
        const option = (lastResult(page).options ?? []).find(
            (candidate: { dimension: string; name: string }) =>
                candidate.dimension === dimension && candidate.name === name,
        );
        expect(option, JSON.stringify(lastResult(page))).toBeTruthy();
        expect(option.isBuiltIn).toBe(true);
    },
);

// ---- Write tools ------------------------------------------------------------------

When(
    "an agent adds a project level {string} described {string}",
    async ({ page }, name: string, description: string) => {
        const idempotencyKey = McpClient.key("mcp-add-level");
        const result = await (
            await mcp(page)
        ).callTool("add_project_level", {
            projectId: project(page).id,
            name,
            description,
            idempotencyKey,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
    },
);

When(
    "an agent updates the project level {string} to status {string}",
    async ({ page }, name: string, status: string) => {
        const levels = (
            await (
                await page.request.get(
                    `${API_BASE}/projects/${project(page).id}/levels`,
                )
            ).json()
        ).find((candidate: { name: string }) => candidate.name === name);
        expect(levels, `No level "${name}" to update`).toBeTruthy();
        const result = await (
            await mcp(page)
        ).callTool("update_project_level", {
            projectId: project(page).id,
            levelId: levels.id,
            status,
            idempotencyKey: McpClient.key("mcp-update-level"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

When(
    "an agent adds a project character {string} tagged {string}",
    async ({ page }, name: string, tag: string) => {
        const idempotencyKey = McpClient.key("mcp-add-character");
        const result = await (
            await mcp(page)
        ).callTool("add_project_character", {
            projectId: project(page).id,
            name,
            description: `${name} description`,
            tags: [tag],
            idempotencyKey,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
    },
);

When(
    "an agent updates the project character {string} to tag {string}",
    async ({ page }, name: string, tag: string) => {
        const characters = await apiHelper.getProjectCharacters(
            project(page).id,
        );
        const character = characters.find(
            (candidate: { name: string }) => candidate.name === name,
        );
        expect(character, `No character "${name}" to update`).toBeTruthy();
        const result = await (
            await mcp(page)
        ).callTool("update_project_character", {
            projectId: project(page).id,
            characterId: character!.id,
            tags: [tag],
            idempotencyKey: McpClient.key("mcp-update-character"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

When(
    "an agent adds a project reference titled {string} with the comment {string}",
    async ({ page }, title: string, comment: string) => {
        const fileId = getScenarioState(page).getCustom<number>(
            REFERENCE_FILE_KEY,
        );
        expect(fileId, "No uploaded reference file was captured").toBeTruthy();
        const result = await (
            await mcp(page)
        ).callTool("add_project_reference", {
            projectId: project(page).id,
            title,
            comment,
            fileId,
            idempotencyKey: McpClient.key("mcp-add-reference"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        expect(result.referenceId).toBeGreaterThan(0);
    },
);

Then(
    "the project references should include the title {string}",
    async ({ page }, title: string) => {
        const references = await apiHelper.getProjectReferences(
            project(page).id,
        );
        expect(
            references.map((reference) => reference.title),
            JSON.stringify(references),
        ).toContain(title);
    },
);

Then(
    "the MCP brief should list the reference image for that file",
    async ({ page }) => {
        const fileId = getScenarioState(page).getCustom<number>(
            REFERENCE_FILE_KEY,
        );
        // The brief's concept images carry the file, not the board title.
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("get_project", { projectId: project(page).id }),
        );
        const images = lastResult(page).conceptImages ?? [];
        expect(
            images.map((image: { fileId: number }) => image.fileId),
            JSON.stringify(images),
        ).toContain(fileId);
    },
);

When("an agent links the standalone scene to the MCP project", async ({ page }) => {
    const scene = getScenarioState(page).getCustom<{ id: number; name: string }>(
        SCENE_KEY,
    );
    expect(scene, "No standalone scene was provisioned").toBeTruthy();
    const idempotencyKey = McpClient.key("mcp-link-scene");
    const result = await (
        await mcp(page)
    ).callTool("set_scene_project", {
        sceneId: scene!.id,
        projectId: project(page).id,
        idempotencyKey,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
});

Then(
    "the standalone scene should belong to the MCP project",
    async ({ page }) => {
        const scene = getScenarioState(page).getCustom<{ id: number; name: string }>(
            SCENE_KEY,
        );
        const response = await page.request.get(
            `${API_BASE}/scenes/${scene!.id}`,
        );
        await expectOk(response, "The scene could not be read");
        const view = await response.json();
        expect(view.scene.projectId).toBe(project(page).id);
    },
);

When("an agent unlinks the standalone scene from its project", async ({ page }) => {
    const scene = getScenarioState(page).getCustom<{ id: number; name: string }>(
        SCENE_KEY,
    );
    const idempotencyKey = McpClient.key("mcp-unlink-scene");
    const result = await (
        await mcp(page)
    ).callTool("set_scene_project", {
        sceneId: scene!.id,
        idempotencyKey,
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    getScenarioState(page).setCustom(LAST_WRITE_KEY, { idempotencyKey });
});

Then(
    "the standalone scene should belong to no project",
    async ({ page }) => {
        const scene = getScenarioState(page).getCustom<{ id: number; name: string }>(
            SCENE_KEY,
        );
        const response = await page.request.get(
            `${API_BASE}/scenes/${scene!.id}`,
        );
        await expectOk(response, "The scene could not be read");
        const view = await response.json();
        expect(view.scene.projectId ?? null).toBeNull();
    },
);

When("an agent reverses the last MCP write", async ({ page }) => {
    const write = getScenarioState(page).getCustom<{ idempotencyKey: string }>(
        LAST_WRITE_KEY,
    );
    expect(write, "No MCP write was captured to reverse").toBeTruthy();
    const result = await (
        await mcp(page)
    ).callTool("reverse_operation", {
        idempotencyKey: write!.idempotencyKey,
        dryRun: false,
    });
    expect(result.status, JSON.stringify(result)).toBe("reversed");
});
