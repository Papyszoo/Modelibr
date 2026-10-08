import { createBdd } from "playwright-bdd";
import { expect, Locator, Page } from "@playwright/test";
import crypto from "crypto";
import fs from "fs";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { createUniqueSolidHdrPayload } from "../helpers/file-payload-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";
import { ProjectCommentsPage } from "../pages/ProjectCommentsPage";
import { ProjectStudioPage } from "../pages/ProjectStudioPage";
import { ProjectsPage } from "../pages/ProjectsPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

// ---- What a comment can be about -------------------------------------------
//
// One table, so a scenario names a target the way a person would ("texture
// set") and every step agrees on the field it is stored under, the agent's
// asset type, and where its card lives in the project.

type TargetKind =
    | "model"
    | "texture set"
    | "sprite"
    | "sound"
    | "environment map"
    | "VFX"
    | "level"
    | "character"
    | "reference image";

interface TargetSpec {
    /** The comment field that addresses it. */
    field: string;
    /** `add_to_project`'s assetType, for library assets. */
    assetType?: string;
    /** The project viewer tab holding its card, for library assets. */
    tab?: string;
    /** The workspace view holding its card, for project-owned things. */
    view?: "levels" | "cast" | "references";
}

const TARGETS: Record<TargetKind, TargetSpec> = {
    model: {
        field: "modelId",
        assetType: "model",
        tab: "container-tab-models",
    },
    "texture set": {
        field: "textureSetId",
        assetType: "textureSet",
        tab: "container-tab-multi-model-textures",
    },
    sprite: {
        field: "spriteId",
        assetType: "sprite",
        tab: "container-tab-sprites",
    },
    sound: { field: "soundId", assetType: "sound", tab: "container-tab-sounds" },
    "environment map": {
        field: "environmentMapId",
        assetType: "environmentMap",
        tab: "container-tab-environment-maps",
    },
    VFX: { field: "vfxId", assetType: "vfx", tab: "container-tab-vfx" },
    level: { field: "levelId", view: "levels" },
    character: { field: "characterId", view: "cast" },
    "reference image": { field: "referenceImageId", view: "references" },
};

const TARGET_FIELDS = Object.values(TARGETS).map((spec) => spec.field);

function spec(kind: string): TargetSpec {
    const found = TARGETS[kind as TargetKind];
    if (!found) {
        throw new Error(
            `"${kind}" is not a comment target. Use one of: ${Object.keys(TARGETS).join(", ")}.`,
        );
    }
    return found;
}

// ---- Scenario state ----------------------------------------------------------

const PROJECT_KEY = "project-comments:project";
const TARGETS_KEY = "project-comments:targets";
const LAST_ADD_KEY = "project-comments:last-add";
const LAST_RESULT_KEY = "project-comments:last-result";
const MCP_KEY = "project-comments:mcp";

interface ProvisionedTarget {
    kind: TargetKind;
    id: number;
    /** The name the app shows - library assets carry a per-run suffix. */
    name: string;
}

function project(page: Page): { id: number; name: string } {
    const found = getScenarioState(page).getCustom<{ id: number; name: string }>(
        PROJECT_KEY,
    );
    if (!found) {
        throw new Error(
            'No comments project was provisioned - the Background "a comments project exists" is missing.',
        );
    }
    return found;
}

function targets(page: Page): Record<string, ProvisionedTarget> {
    const state = getScenarioState(page);
    let all = state.getCustom<Record<string, ProvisionedTarget>>(TARGETS_KEY);
    if (!all) {
        all = {};
        state.setCustom(TARGETS_KEY, all);
    }
    return all;
}

function target(page: Page, kind: string, alias: string): ProvisionedTarget {
    const found = targets(page)[`${kind}:${alias}`];
    if (!found) {
        throw new Error(
            `No ${kind} "${alias}" was provisioned in this scenario - a Given that creates it is missing.`,
        );
    }
    return found;
}

/** The single provisioned thing with this alias, whatever its kind. */
function targetByAlias(page: Page, alias: string): ProvisionedTarget {
    const matches = Object.entries(targets(page))
        .filter(([key]) => key.endsWith(`:${alias}`))
        .map(([, value]) => value);
    expect(
        matches.length,
        `Expected exactly one provisioned target named "${alias}"`,
    ).toBe(1);
    return matches[0];
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

function unique(alias: string): string {
    return `${alias} ${crypto.randomUUID().slice(0, 8)}`;
}

// ---- Provisioning --------------------------------------------------------------

async function expectOk(
    response: { ok(): boolean; status(): number; text(): Promise<string> },
    what: string,
): Promise<void> {
    expect(
        response.ok(),
        `${what}: ${response.status()} ${await response.text()}`,
    ).toBe(true);
}

/** Creates a library asset of `kind`, not yet in any project. */
async function createLibraryAsset(
    page: Page,
    kind: TargetKind,
    alias: string,
): Promise<ProvisionedTarget> {
    const name = unique(alias);
    switch (kind) {
        case "model": {
            // A model is named after its file, so the upload's own name is read
            // back rather than chosen.
            const filePath = await UniqueFileGenerator.generate(
                "test-cube.glb",
                { uniqueFilename: true },
            );
            const uploaded = await apiHelper.uploadModel(filePath);
            const model = await page.request.get(
                `${API_BASE}/models/${uploaded.id}`,
            );
            await expectOk(model, "The uploaded model could not be read");
            return {
                kind,
                id: uploaded.id,
                name: String((await model.json()).name),
            };
        }
        case "texture set": {
            // Kind 0 is a multi-model texture: the project tab it lands on.
            const created = await apiHelper.createTextureSetWithKind(name, 0);
            return { kind, id: created.id, name };
        }
        case "sprite": {
            const filePath =
                await UniqueFileGenerator.generate("red_color.png");
            const created = await apiHelper.createSprite(filePath, name);
            return { kind, id: created.id, name };
        }
        case "sound": {
            const filePath =
                await UniqueFileGenerator.generate("test-tone.wav");
            const created = await page.request.post(
                `${API_BASE}/sounds/with-file`,
                {
                    multipart: {
                        file: {
                            name: `${name}.wav`,
                            mimeType: "audio/wav",
                            buffer: fs.readFileSync(filePath),
                        },
                        name,
                    },
                },
            );
            await expectOk(created, `Sound "${name}" was not created`);
            return { kind, id: (await created.json()).soundId, name };
        }
        case "environment map": {
            // The name is a query parameter here, not a form field; a form
            // field is ignored and the map is named after its file.
            const created = await page.request.post(
                `${API_BASE}/environment-maps/with-file?name=${encodeURIComponent(name)}`,
                {
                    multipart: {
                        file: createUniqueSolidHdrPayload({
                            filenamePrefix: "comment-env",
                            width: 64,
                            height: 32,
                        }),
                    },
                },
            );
            await expectOk(
                created,
                `Environment map "${name}" was not created`,
            );
            return {
                kind,
                id: (await created.json()).environmentMapId,
                name,
            };
        }
        case "VFX": {
            const created = await page.request.post(`${API_BASE}/vfx`, {
                data: {
                    name,
                    definition: {
                        version: 1,
                        duration: 2,
                        loop: false,
                        components: [],
                    },
                },
            });
            await expectOk(created, `VFX "${name}" was not created`);
            return { kind, id: (await created.json()).id, name };
        }
        default:
            throw new Error(`A ${kind} is not a library asset.`);
    }
}

/** Creates a level, character or reference image inside the project. */
async function createProjectOwned(
    page: Page,
    kind: TargetKind,
    name: string,
): Promise<ProvisionedTarget> {
    const projectId = project(page).id;
    switch (kind) {
        case "level": {
            const created = await page.request.post(
                `${API_BASE}/projects/${projectId}/levels`,
                { data: { name, description: `${name} description` } },
            );
            await expectOk(created, `Level "${name}" was not created`);
            return { kind, id: (await created.json()).id, name };
        }
        case "character": {
            const created = await apiHelper.createProjectCharacter(
                projectId,
                name,
                `${name} description`,
                ["npc"],
            );
            return { kind, id: created.id, name };
        }
        case "reference image": {
            const filePath =
                await UniqueFileGenerator.generate("blue_color.png");
            const { fileId } = await apiHelper.uploadFile(filePath);
            const attached = await page.request.post(
                `${API_BASE}/projects/${projectId}/concept-images`,
                { data: { fileId } },
            );
            await expectOk(attached, "The reference image was not attached");
            const references = await apiHelper.getProjectReferences(projectId);
            const reference = references.find((r) => r.fileId === fileId);
            expect(reference, "The attached image is not on the board").toBeTruthy();
            // Titled, so the thread's labels name it rather than the file.
            const titled = await page.request.put(
                `${API_BASE}/projects/${projectId}/references/${reference!.id}`,
                { data: { title: name } },
            );
            await expectOk(titled, "The reference image was not titled");
            return { kind, id: reference!.id, name };
        }
        default:
            throw new Error(`A ${kind} is not owned by a project.`);
    }
}

const REST_FAMILY: Record<string, string> = {
    model: "models",
    "texture set": "texture-sets",
    sprite: "sprites",
    sound: "sounds",
    "environment map": "environment-maps",
    VFX: "vfx",
};

async function addToProjectOverRest(
    page: Page,
    provisioned: ProvisionedTarget,
): Promise<void> {
    const added = await page.request.post(
        `${API_BASE}/projects/${project(page).id}/${REST_FAMILY[provisioned.kind]}/${provisioned.id}`,
    );
    await expectOk(
        added,
        `The ${provisioned.kind} "${provisioned.name}" was not added to the project`,
    );
}

/** Whether the project holds the asset, read from the endpoint its tab reads. */
async function projectHolds(
    page: Page,
    provisioned: ProvisionedTarget,
): Promise<boolean> {
    const projectId = project(page).id;
    const list = async (path: string, key?: string) => {
        const response = await page.request.get(`${API_BASE}${path}`);
        await expectOk(response, `${path} could not be read`);
        const body = await response.json();
        return (key ? body[key] : body) as Array<{ id: number }>;
    };
    const members =
        provisioned.kind === "model"
            ? await list(`/models?projectIds=${projectId}`)
            : provisioned.kind === "texture set"
              ? await list(`/texture-sets?projectIds=${projectId}`, "textureSets")
              : provisioned.kind === "sprite"
                ? await list(`/sprites?projectIds=${projectId}`, "sprites")
                : provisioned.kind === "sound"
                  ? await list(`/sounds?projectIds=${projectId}`, "sounds")
                  : provisioned.kind === "environment map"
                    ? await list(
                          `/environment-maps?projectIds=${projectId}`,
                          "environmentMaps",
                      )
                    : await list(`/projects/${projectId}`, "vfx");
    return members.some((member) => member.id === provisioned.id);
}

async function provision(
    page: Page,
    kind: string,
    alias: string,
    inProject: boolean,
): Promise<ProvisionedTarget> {
    const targetKind = kind as TargetKind;
    const provisioned = spec(kind).assetType
        ? await createLibraryAsset(page, targetKind, alias)
        : await createProjectOwned(page, targetKind, alias);
    if (inProject && spec(kind).assetType) {
        await addToProjectOverRest(page, provisioned);
    }
    targets(page)[`${kind}:${alias}`] = provisioned;
    return provisioned;
}

// ---- Comments over the API ----------------------------------------------------

interface CommentDto {
    id: number;
    title: string;
    body: string;
    isPinned: boolean;
    status: string;
    resolution: string | null;
    [field: string]: unknown;
}

async function listComments(page: Page): Promise<CommentDto[]> {
    const response = await page.request.get(
        `${API_BASE}/projects/${project(page).id}/comments`,
    );
    await expectOk(response, "The project's comments could not be read");
    return response.json();
}

async function storedComment(page: Page, title: string): Promise<CommentDto> {
    const comment = (await listComments(page)).find((c) => c.title === title);
    expect(comment, `No comment titled "${title}" is stored`).toBeTruthy();
    return comment!;
}

async function createCommentOverRest(
    page: Page,
    title: string,
    targetField?: string,
    targetId?: number,
): Promise<CommentDto> {
    const created = await page.request.post(
        `${API_BASE}/projects/${project(page).id}/comments`,
        {
            data: {
                title,
                body: `${title} body`,
                isPinned: false,
                ...(targetField ? { [targetField]: targetId } : {}),
            },
        },
    );
    await expectOk(created, `The comment "${title}" was not created`);
    return created.json();
}

/** The update route replaces the comment, so its own fields are resent. */
async function putComment(
    page: Page,
    comment: CommentDto,
    changes: Record<string, unknown>,
) {
    const targetFields = Object.fromEntries(
        TARGET_FIELDS.map((field) => [field, comment[field] ?? null]),
    );
    return page.request.put(
        `${API_BASE}/projects/${project(page).id}/comments/${comment.id}`,
        {
            data: {
                ...targetFields,
                title: comment.title,
                body: comment.body,
                isPinned: comment.isPinned,
                ...changes,
            },
        },
    );
}

function expectNoTarget(comment: CommentDto): void {
    for (const field of TARGET_FIELDS) {
        expect(
            comment[field] ?? null,
            `"${comment.title}" should be project-wide but its ${field} is set`,
        ).toBeNull();
    }
}

// ---- Where things are shown ----------------------------------------------------

function overviewThread(page: Page): Locator {
    return page.getByRole("region", {
        name: "Comments & decisions on the project",
    });
}

async function showOverview(page: Page): Promise<Locator> {
    await new ProjectStudioPage(page).showWorkspaceView("overview");
    const thread = overviewThread(page);
    await expect(thread).toBeVisible({ timeout: 15000 });
    return thread;
}

/** Brings the card of a provisioned target into view, wherever it lives. */
async function showTarget(page: Page, provisioned: ProvisionedTarget) {
    const where = spec(provisioned.kind);
    if (where.tab) {
        await page.getByTestId(where.tab).click();
    } else if (where.view) {
        await page.getByTestId("container-tab-details").click();
        await new ProjectStudioPage(page).showWorkspaceView(where.view);
    }
}

function referenceThread(page: Page, name: string): Locator {
    return page
        .getByTestId("project-reference-card")
        .getByRole("region", { name: `Comments on ${name}` });
}

// ---- Background ------------------------------------------------------------------

/**
 * One project per Playwright worker, recreated by every scenario. Workers must
 * not delete each other's project mid-scenario, and a scenario must not read a
 * previous one's comments.
 */
Given("a comments project exists", async ({ page, $testInfo }) => {
    const name = `Comments E2E Project W${$testInfo.workerIndex}`;
    const listed = await page.request.get(`${API_BASE}/projects`);
    await expectOk(listed, "Projects could not be listed");
    for (const stale of ((await listed.json()).projects || []).filter(
        (p: { name: string }) => p.name === name,
    )) {
        await page.request.delete(`${API_BASE}/projects/${stale.id}`);
    }
    const created = await apiHelper.createProject(
        name,
        "Project comments end-to-end coverage",
    );
    getScenarioState(page).setCustom(PROJECT_KEY, {
        id: created.id,
        name,
    });
});

When("I open the comments project", async ({ page }) => {
    await new ProjectsPage(page).navigateToProjectViewer(project(page).id);
    await new ProjectStudioPage(page).waitForStudio();
});

// ---- Provisioning steps -----------------------------------------------------------

Given(
    "the project has a {string} named {string}",
    async ({ page }, kind: string, alias: string) => {
        await provision(page, kind, alias, true);
    },
);

Given(
    "a library {string} named {string} exists",
    async ({ page }, kind: string, alias: string) => {
        await provision(page, kind, alias, false);
    },
);

Given(
    "the {string} {string} has the comment {string}",
    async ({ page }, kind: string, alias: string, title: string) => {
        await createCommentOverRest(
            page,
            title,
            spec(kind).field,
            target(page, kind, alias).id,
        );
    },
);

Given("the project comment {string} exists", async ({ page }, title: string) => {
    await createCommentOverRest(page, title);
});

Given(
    "the project comment {string} exists resolved with {string}",
    async ({ page }, title: string, resolution: string) => {
        const comment = await createCommentOverRest(page, title);
        await expectOk(
            await putComment(page, comment, { status: "resolved", resolution }),
            `The comment "${title}" was not resolved`,
        );
    },
);

// ---- The overview: project-wide comments ---------------------------------------

When("I add the project comment {string}", async ({ page }, title: string) => {
    const thread = await showOverview(page);
    await new ProjectCommentsPage(page).addComment(
        thread,
        "the project",
        title,
        `${title} body`,
        "toggle",
    );
});

When(
    "I edit the overview comment {string} to {string} saying {string}",
    async ({ page }, title: string, newTitle: string, newBody: string) => {
        const thread = await showOverview(page);
        await new ProjectCommentsPage(page).edit(
            thread,
            title,
            newTitle,
            newBody,
        );
    },
);

When(
    "I pin the overview comment {string} as a decision",
    async ({ page }, title: string) => {
        const thread = await showOverview(page);
        await new ProjectCommentsPage(page).togglePin(thread, title, true);
    },
);

When(
    "I unpin the overview comment {string}",
    async ({ page }, title: string) => {
        const thread = await showOverview(page);
        await new ProjectCommentsPage(page).togglePin(thread, title, false);
    },
);

When(
    "I resolve the overview comment {string} with {string}",
    async ({ page }, title: string, resolution: string) => {
        const thread = await showOverview(page);
        await new ProjectCommentsPage(page).resolve(thread, title, resolution);
    },
);

When(
    "I resolve the overview comment {string} without a resolution",
    async ({ page }, title: string) => {
        const thread = await showOverview(page);
        await new ProjectCommentsPage(page).resolve(thread, title);
    },
);

When(
    "I reopen the overview comment {string}",
    async ({ page }, title: string) => {
        const thread = await showOverview(page);
        await new ProjectCommentsPage(page).reopen(thread, title);
    },
);

Then(
    "the overview should list the comment {string} about {string}",
    async ({ page }, title: string, about: string) => {
        const thread = await showOverview(page);
        const item = new ProjectCommentsPage(page).comment(thread, title);
        await expect(item).toBeVisible({ timeout: 15000 });
        await expect(item.getByText(about, { exact: true })).toBeVisible({
            timeout: 15000,
        });
    },
);

Then(
    "the overview comment {string} should be marked as a decision",
    async ({ page }, title: string) => {
        const item = new ProjectCommentsPage(page).comment(
            overviewThread(page),
            title,
        );
        await expect(item.getByText("Decision", { exact: true })).toBeVisible({
            timeout: 15000,
        });
        await expect(
            item.getByRole("button", { name: `Unpin ${title}` }),
        ).toBeVisible();
    },
);

Then(
    "the overview comment {string} should not be marked as a decision",
    async ({ page }, title: string) => {
        const item = new ProjectCommentsPage(page).comment(
            overviewThread(page),
            title,
        );
        await expect(item.getByText("Decision", { exact: true })).toHaveCount(
            0,
            { timeout: 15000 },
        );
        await expect(
            item.getByRole("button", { name: `Pin ${title} as a decision` }),
        ).toBeVisible();
    },
);

Then(
    "the overview comment {string} should be resolved with {string}",
    async ({ page }, title: string, resolution: string) => {
        const comments = new ProjectCommentsPage(page);
        const thread = overviewThread(page);
        const item = comments.comment(thread, title);
        await expect(item).toHaveAttribute("data-status", "resolved");
        await expect(item.getByText("Resolved", { exact: true })).toBeVisible();
        await expect(comments.resolution(thread, title)).toHaveText(resolution);
    },
);

Then(
    "the overview comment {string} should be resolved without a resolution",
    async ({ page }, title: string) => {
        const comments = new ProjectCommentsPage(page);
        const thread = overviewThread(page);
        const item = comments.comment(thread, title);
        await expect(item).toHaveAttribute("data-status", "resolved");
        await expect(item.getByText("Resolved", { exact: true })).toBeVisible();
        await expect(comments.resolution(thread, title)).toHaveCount(0);
    },
);

Then(
    "the overview comment {string} should be open without a resolution",
    async ({ page }, title: string) => {
        const comments = new ProjectCommentsPage(page);
        const thread = overviewThread(page);
        const item = comments.comment(thread, title);
        await expect(item).toHaveAttribute("data-status", "open");
        await expect(item.getByText("Resolved", { exact: true })).toHaveCount(0);
        await expect(comments.resolution(thread, title)).toHaveCount(0);
    },
);

Then(
    "the overview comment {string} should be de-emphasised",
    async ({ page }, title: string) => {
        await new ProjectCommentsPage(page).expectDeEmphasised(
            overviewThread(page),
            title,
        );
    },
);

Then(
    "the resolved comment {string} should be listed after the open comment {string}",
    async ({ page }, resolved: string, open: string) => {
        const titles = await overviewThread(page)
            .locator("[data-comment-title]")
            .evaluateAll((items) =>
                items.map((item) => item.getAttribute("data-comment-title")),
            );
        expect(titles.indexOf(open)).toBeGreaterThanOrEqual(0);
        expect(titles.indexOf(resolved)).toBeGreaterThan(titles.indexOf(open));
    },
);

// ---- A target's own card --------------------------------------------------------

When(
    "I comment {string} on the {string} {string} from its badge",
    async ({ page }, title: string, kind: string, alias: string) => {
        const provisioned = target(page, kind, alias);
        await showTarget(page, provisioned);
        const comments = new ProjectCommentsPage(page);
        const panel = await comments.openPanel(provisioned.name);
        await comments.addComment(
            panel,
            provisioned.name,
            title,
            `${title} body`,
            "always",
        );
        await comments.closePanel(provisioned.name);
    },
);

When(
    "I resolve {string} in the comments panel of {string}",
    async ({ page }, title: string, alias: string) => {
        const provisioned = targetByAlias(page, alias);
        const comments = new ProjectCommentsPage(page);
        const panel = await comments.openPanel(provisioned.name);
        await comments.resolve(panel, title, `${title} handled`);
        await comments.closePanel(provisioned.name);
    },
);

When(
    "I reopen {string} in the comments panel of {string}",
    async ({ page }, title: string, alias: string) => {
        const provisioned = targetByAlias(page, alias);
        const comments = new ProjectCommentsPage(page);
        const panel = await comments.openPanel(provisioned.name);
        await comments.reopen(panel, title);
        await comments.closePanel(provisioned.name);
    },
);

Then(
    "the comments badge of {string} should count {int} open comment(s)",
    async ({ page }, alias: string, count: number) => {
        await new ProjectCommentsPage(page).expectBadgeOpenCount(
            targetByAlias(page, alias).name,
            count,
        );
    },
);

When(
    "I comment {string} on the reference image {string}",
    async ({ page }, title: string, alias: string) => {
        const provisioned = target(page, "reference image", alias);
        await showTarget(page, provisioned);
        const thread = referenceThread(page, provisioned.name);
        await expect(thread).toBeVisible({ timeout: 15000 });
        await new ProjectCommentsPage(page).addComment(
            thread,
            provisioned.name,
            title,
            `${title} body`,
            "toggle",
        );
    },
);

When(
    "I resolve {string} on the reference image {string}",
    async ({ page }, title: string, alias: string) => {
        const provisioned = target(page, "reference image", alias);
        await new ProjectCommentsPage(page).resolve(
            referenceThread(page, provisioned.name),
            title,
            `${title} handled`,
        );
    },
);

When(
    "I reopen {string} on the reference image {string}",
    async ({ page }, title: string, alias: string) => {
        const provisioned = target(page, "reference image", alias);
        await new ProjectCommentsPage(page).reopen(
            referenceThread(page, provisioned.name),
            title,
        );
    },
);

Then(
    "the reference image {string} should count {int} open comment(s)",
    async ({ page }, alias: string, count: number) => {
        const provisioned = target(page, "reference image", alias);
        await expect(
            referenceThread(page, provisioned.name).getByTestId(
                "project-comment-open-count",
            ),
        ).toHaveText(`${count} open`, { timeout: 15000 });
    },
);

Then(
    "the API should store {string} as a comment on the {string} {string}",
    async ({ page }, title: string, kind: string, alias: string) => {
        const comment = await storedComment(page, title);
        const field = spec(kind).field;
        expect(comment[field]).toBe(target(page, kind, alias).id);
        for (const other of TARGET_FIELDS.filter((f) => f !== field)) {
            expect(
                comment[other] ?? null,
                `"${title}" names a second target: ${other}`,
            ).toBeNull();
        }
    },
);

// ---- Comments in the API --------------------------------------------------------

Then(
    "the API should store {string} as an open project-wide comment",
    async ({ page }, title: string) => {
        const comment = await storedComment(page, title);
        expectNoTarget(comment);
        expect(comment.status).toBe("open");
        expect(comment.resolution).toBeNull();
    },
);

Then(
    "the API should store {string} as a project-wide comment",
    async ({ page }, title: string) => {
        expectNoTarget(await storedComment(page, title));
    },
);

Then(
    "the API should store the comment {string} with the body {string}",
    async ({ page }, title: string, body: string) => {
        expect((await storedComment(page, title)).body).toBe(body);
    },
);

Then(
    "the API should store the comment {string} as pinned",
    async ({ page }, title: string) => {
        expect((await storedComment(page, title)).isPinned).toBe(true);
    },
);

Then(
    "the API should store the comment {string} as not pinned",
    async ({ page }, title: string) => {
        expect((await storedComment(page, title)).isPinned).toBe(false);
    },
);

Then(
    "the API should store the comment {string} as resolved with {string}",
    async ({ page }, title: string, resolution: string) => {
        const comment = await storedComment(page, title);
        expect(comment.status).toBe("resolved");
        expect(comment.resolution).toBe(resolution);
    },
);

Then(
    "the API should store the comment {string} as resolved without a resolution",
    async ({ page }, title: string) => {
        const comment = await storedComment(page, title);
        expect(comment.status).toBe("resolved");
        expect(comment.resolution).toBeNull();
    },
);

Then(
    "the API should store the comment {string} as open without a resolution",
    async ({ page }, title: string) => {
        const comment = await storedComment(page, title);
        expect(comment.status).toBe("open");
        expect(comment.resolution).toBeNull();
    },
);

When(
    "a REST update recording the resolution {string} on the open comment {string} is refused",
    async ({ page }, resolution: string, title: string) => {
        const comment = await storedComment(page, title);
        const response = await putComment(page, comment, {
            status: "open",
            resolution,
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).error).toBe("InvalidProjectComment");
    },
);

When(
    "a REST comment on both the {string} {string} and the {string} {string} is refused",
    async (
        { page },
        firstKind: string,
        firstAlias: string,
        secondKind: string,
        secondAlias: string,
    ) => {
        const response = await page.request.post(
            `${API_BASE}/projects/${project(page).id}/comments`,
            {
                data: {
                    title: "Two targets",
                    body: "Two targets body",
                    isPinned: false,
                    [spec(firstKind).field]: target(page, firstKind, firstAlias)
                        .id,
                    [spec(secondKind).field]: target(
                        page,
                        secondKind,
                        secondAlias,
                    ).id,
                },
            },
        );
        expect(response.status()).toBe(400);
        expect((await response.json()).error).toBe(
            "ProjectCommentTargetConflict",
        );
    },
);

Then("the project should have no comments", async ({ page }) => {
    expect(await listComments(page)).toEqual([]);
});

// ---- The project's VFX tab ------------------------------------------------------

function vfxTab(page: Page): Locator {
    return page.getByTestId("container-tab-vfx");
}

function vfxTile(page: Page, vfxId: number): Locator {
    return page.locator(`[data-vfx-id="${vfxId}"]`);
}

When(
    "I add the VFX {string} from the project's VFX tab",
    async ({ page }, alias: string) => {
        const effect = target(page, "VFX", alias);
        await vfxTab(page).click();
        await page.getByRole("button", { name: "Add effects" }).click();
        const dialog = page.getByRole("dialog", {
            name: "Add Effects to Project",
        });
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await dialog
            .getByRole("button", { name: effect.name })
            .click();
        const added = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname ===
                    `/projects/${project(page).id}/vfx/${effect.id}` &&
                response.request().method() === "POST",
            { timeout: 15000 },
        );
        await dialog
            .getByRole("button", { name: "Add Selected (1)" })
            .click();
        expect((await added).ok()).toBeTruthy();
        await expect(dialog).toBeHidden({ timeout: 15000 });
    },
);

When(
    "I remove the VFX {string} from the project's VFX tab",
    async ({ page }, alias: string) => {
        const effect = target(page, "VFX", alias);
        await vfxTab(page).click();
        const tile = vfxTile(page, effect.id);
        await expect(tile).toBeVisible({ timeout: 15000 });
        await tile.click({ button: "right" });
        const removed = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname ===
                    `/projects/${project(page).id}/vfx/${effect.id}` &&
                response.request().method() === "DELETE",
            { timeout: 15000 },
        );
        await page
            .getByRole("menuitem", { name: "Remove from project" })
            .click();
        expect((await removed).ok()).toBeTruthy();
        await expect(tile).toHaveCount(0, { timeout: 15000 });
    },
);

Then(
    "the project's VFX tab should list {string}",
    async ({ page }, alias: string) => {
        const effect = target(page, "VFX", alias);
        const tile = vfxTile(page, effect.id);
        await expect(tile).toBeVisible({ timeout: 15000 });
        await expect(tile).toContainText(effect.name);
    },
);

Then(
    "the project's VFX tab should count {int} effect(s)",
    async ({ page }, count: number) => {
        await expect(vfxTab(page)).toHaveAttribute(
            "aria-label",
            `VFX (${count})`,
            { timeout: 15000 },
        );
    },
);

Then(
    "the project should hold the {string} {string}",
    async ({ page }, kind: string, alias: string) => {
        expect(
            await projectHolds(page, target(page, kind, alias)),
            `The project does not hold the ${kind} "${alias}"`,
        ).toBe(true);
    },
);

Then(
    "the project should not hold the {string} {string}",
    async ({ page }, kind: string, alias: string) => {
        expect(
            await projectHolds(page, target(page, kind, alias)),
            `The project still holds the ${kind} "${alias}"`,
        ).toBe(false);
    },
);

// ---- Deleting what a comment is about --------------------------------------------

When(
    "I delete the character {string}",
    async ({ page }, alias: string) => {
        const character = target(page, "character", alias);
        const studio = new ProjectStudioPage(page);
        const card = await studio.openCharacter(character.name);
        await card
            .getByRole("button", { name: `Delete ${character.name}` })
            .click();
        const dialog = page.locator(".p-confirm-dialog");
        await expect(dialog).toBeVisible();
        const deleted = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname ===
                    `/projects/${project(page).id}/characters/${character.id}` &&
                response.request().method() === "DELETE",
            { timeout: 15000 },
        );
        await dialog.getByRole("button", { name: "Delete" }).click();
        expect((await deleted).ok()).toBeTruthy();
        await expect(studio.characterCard(character.name)).toHaveCount(0, {
            timeout: 15000,
        });
    },
);

When(
    "the {string} {string} is deleted from the library",
    async ({ page }, kind: string, alias: string) => {
        const asset = target(page, kind, alias);
        if (kind === "VFX") {
            await expectOk(
                await page.request.delete(`${API_BASE}/vfx/${asset.id}`),
                `VFX "${asset.name}" was not deleted`,
            );
            return;
        }
        expect(kind, "Only a VFX or a model is deleted here").toBe("model");
        // A model is recycled first; only the permanent delete removes the row
        // a comment points at.
        await apiHelper.softDeleteModel(asset.id);
        await expectOk(
            await page.request.delete(
                `${API_BASE}/recycled/model/${asset.id}/permanent`,
            ),
            `Model "${asset.name}" was not permanently deleted`,
        );
    },
);

// ---- Agent tools (MCP) --------------------------------------------------------------

When(
    "an agent adds the {string} {string} to the project",
    async ({ page }, kind: string, alias: string) => {
        const asset = target(page, kind, alias);
        const idempotencyKey = McpClient.key("add-to-project");
        const result = await (
            await mcp(page)
        ).callTool("add_to_project", {
            projectId: project(page).id,
            assetType: spec(kind).assetType,
            assetId: asset.id,
            idempotencyKey,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(LAST_ADD_KEY, {
            idempotencyKey,
            result,
        });
    },
);

Then(
    "the agent should be told it was already in the project",
    async ({ page }) => {
        const last = getScenarioState(page).getCustom<{ result: any }>(
            LAST_ADD_KEY,
        );
        expect(last?.result.alreadyInProject).toBe(true);
    },
);

When("the agent reverses that add", async ({ page }) => {
    const last = getScenarioState(page).getCustom<{ idempotencyKey: string }>(
        LAST_ADD_KEY,
    );
    expect(last, "No agent add was made in this scenario").toBeTruthy();
    const result = await (
        await mcp(page)
    ).callTool("reverse_operation", {
        idempotencyKey: last!.idempotencyKey,
        dryRun: false,
    });
    expect(result.status, JSON.stringify(result)).toBe("reversed");
});

When(
    "an agent links the model {string} to the character {string}",
    async ({ page }, modelAlias: string, characterAlias: string) => {
        const result = await (
            await mcp(page)
        ).callTool("link_character_model", {
            projectId: project(page).id,
            characterId: target(page, "character", characterAlias).id,
            modelId: target(page, "model", modelAlias).id,
            idempotencyKey: McpClient.key("link-model"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the character {string} should list the model {string}",
    async ({ page }, characterAlias: string, modelAlias: string) => {
        const characters = await apiHelper.getProjectCharacters(
            project(page).id,
        );
        const character = characters.find(
            (c) => c.id === target(page, "character", characterAlias).id,
        ) as unknown as { models: Array<{ modelId: number }> } | undefined;
        expect(character, `Character "${characterAlias}" is missing`).toBeTruthy();
        expect(character!.models.map((m) => m.modelId)).toContain(
            target(page, "model", modelAlias).id,
        );
    },
);

When("an agent reads the project", async ({ page }) => {
    const brief = await (
        await mcp(page)
    ).callTool("get_project", { projectId: project(page).id });
    expect(brief.error, JSON.stringify(brief)).toBeUndefined();
    getScenarioState(page).setCustom(LAST_RESULT_KEY, brief);
});

Then(
    "the brief should list the VFX {string}",
    async ({ page }, alias: string) => {
        const brief = getScenarioState(page).getCustom<{
            vfx: Array<{ id: number; name: string }>;
        }>(LAST_RESULT_KEY);
        const effect = target(page, "VFX", alias);
        expect(brief?.vfx, JSON.stringify(brief)).toContainEqual({
            id: effect.id,
            name: effect.name,
        });
    },
);

When(
    "an agent comments {string} on the project",
    async ({ page }, title: string) => {
        const result = await (
            await mcp(page)
        ).callTool("add_project_comment", {
            projectId: project(page).id,
            title,
            body: `${title} body`,
            idempotencyKey: McpClient.key("comment"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

When(
    "an agent comments {string} on the {string} {string}",
    async ({ page }, title: string, kind: string, alias: string) => {
        const result = await (
            await mcp(page)
        ).callTool("add_project_comment", {
            projectId: project(page).id,
            title,
            body: `${title} body`,
            idempotencyKey: McpClient.key("comment"),
            [spec(kind).field]: target(page, kind, alias).id,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        expect(result.comment.status).toBe("open");
    },
);

async function updateComment(
    page: Page,
    title: string,
    changes: Record<string, unknown>,
) {
    const comment = await storedComment(page, title);
    return (await mcp(page)).callTool("update_project_comment", {
        projectId: project(page).id,
        commentId: comment.id,
        idempotencyKey: McpClient.key("update-comment"),
        ...changes,
    });
}

When(
    "the agent resolves {string} with {string}",
    async ({ page }, title: string, resolution: string) => {
        const result = await updateComment(page, title, {
            status: "resolved",
            resolution,
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

When("the agent reopens {string}", async ({ page }, title: string) => {
    const result = await updateComment(page, title, { status: "open" });
    expect(result.status, JSON.stringify(result)).toBe("ok");
});

When(
    "an agent records the resolution {string} on the open comment {string}",
    async ({ page }, resolution: string, title: string) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await updateComment(page, title, { resolution }),
        );
    },
);

When(
    "an agent reopens {string} with the resolution {string}",
    async ({ page }, title: string, resolution: string) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await updateComment(page, title, { status: "open", resolution }),
        );
    },
);

Then(
    "the agent should be refused with {string}",
    async ({ page }, code: string) => {
        const result = getScenarioState(page).getCustom<any>(LAST_RESULT_KEY);
        expect(result?.error, JSON.stringify(result)).toBe(code);
    },
);

When(
    "an agent lists the project's {string} comments",
    async ({ page }, status: string) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("list_project_comments", {
                projectId: project(page).id,
                status,
            }),
        );
    },
);

When(
    "an agent lists the project's comments on the {string} {string}",
    async ({ page }, kind: string, alias: string) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("list_project_comments", {
                projectId: project(page).id,
                [spec(kind).field]: target(page, kind, alias).id,
            }),
        );
    },
);

Then("the agent should see only {string}", async ({ page }, title: string) => {
    const result = getScenarioState(page).getCustom<{
        comments: Array<{ title: string }>;
    }>(LAST_RESULT_KEY);
    expect(
        result?.comments?.map((comment) => comment.title),
        JSON.stringify(result),
    ).toEqual([title]);
});
