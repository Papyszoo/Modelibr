import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import crypto from "crypto";
import { VfxPage } from "../pages/VfxPage";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

const MCP_KEY = "vfx-b2:mcp";
const VFX_KEY = "vfx-b2:vfx";
const LAST_RESULT_KEY = "vfx-b2:last-result";
const MODEL_KEY = "vfx-b2:model";

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
        throw new Error("No MCP result was captured in this scenario.");
    }
    return found;
}

function agentVfxId(page: Page): number {
    const found = getScenarioState(page).getCustom<number>(VFX_KEY);
    if (!found) {
        throw new Error("No VFX was created over MCP in this scenario.");
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

function definition(duration: number) {
    return { version: 1, duration, loop: false, components: [] };
}

/** The editor's effect id - the one the existing VFX steps create through the UI. */
function createdEffectId(page: Page): number {
    const id = getScenarioState(page).getCustom<number>("vfxId");
    if (!id) {
        throw new Error(
            "No VFX effect was created in this scenario - create one before addressing it.",
        );
    }
    return id;
}

async function storedVfx(page: Page, id: number): Promise<any> {
    const response = await page.request.get(`${API_BASE}/vfx/${id}`);
    await expectOk(response, "The stored VFX could not be read");
    return response.json();
}

// ---- MCP: create / get / list -------------------------------------------------

Given(
    "an agent-created VFX named {string} exists",
    async ({ page }, prefix: string) => {
        const name = `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
        const result = await (
            await mcp(page)
        ).callTool("create_vfx", {
            name,
            description: "VFX MCP tool coverage",
            definition: definition(2),
            idempotencyKey: McpClient.key("create-vfx"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(VFX_KEY, result.vfxId);
        getScenarioState(page).setCustom("vfx-b2:name", name);
    },
);

When(
    "an agent creates a VFX named {string} over MCP",
    async ({ page }, prefix: string) => {
        const name = `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
        const result = await (
            await mcp(page)
        ).callTool("create_vfx", {
            name,
            description: "VFX MCP tool coverage",
            definition: definition(2),
            idempotencyKey: McpClient.key("create-vfx"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
        getScenarioState(page).setCustom(VFX_KEY, result.vfxId);
        getScenarioState(page).setCustom("vfx-b2:name", name);
    },
);

Then(
    "the MCP VFX read should name it {string} with duration {int}",
    async ({ page }, _alias: string, duration: number) => {
        const result = await (await mcp(page)).callTool("get_vfx", {
            vfxId: agentVfxId(page),
        });
        expect(result.error, JSON.stringify(result)).toBeUndefined();
        expect(result.name).toBe(getScenarioState(page).getCustom("vfx-b2:name"));
        expect(result.definition.duration).toBe(duration);
    },
);

Then("the MCP VFX list should include it", async ({ page }) => {
    const result = await (await mcp(page)).callTool("list_vfx", {});
    const found = (result.effects ?? []).find(
        (candidate: { id: number }) => candidate.id === agentVfxId(page),
    );
    expect(found, JSON.stringify(result)).toBeTruthy();
    expect(found.duration).toBe(2);
});

// ---- MCP: update --------------------------------------------------------------

When(
    "an agent updates that VFX to duration {int}",
    async ({ page }, duration: number) => {
        const result = await (
            await mcp(page)
        ).callTool("update_vfx", {
            vfxId: agentVfxId(page),
            definition: definition(duration),
            idempotencyKey: McpClient.key("update-vfx"),
        });
        expect(result.status, JSON.stringify(result)).toBe("ok");
    },
);

Then(
    "the MCP VFX read should report duration {int}",
    async ({ page }, duration: number) => {
        const result = await (await mcp(page)).callTool("get_vfx", {
            vfxId: agentVfxId(page),
        });
        expect(result.definition.duration).toBe(duration);
    },
);

When(
    "an agent updates that VFX to the invalid duration {float}",
    async ({ page }, duration: number) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (
                await mcp(page)
            ).callTool("update_vfx", {
                vfxId: agentVfxId(page),
                definition: definition(duration),
                idempotencyKey: McpClient.key("update-vfx-invalid"),
            }),
        );
    },
);

Then(
    "the MCP VFX update should be refused with {string}",
    async ({ page }, code: string) => {
        expect(lastResult(page).error, JSON.stringify(lastResult(page))).toBe(
            code,
        );
    },
);

Then(
    "the MCP VFX problems should name the path {string}",
    async ({ page }, path: string) => {
        const paths = (lastResult(page).problems ?? []).map(
            (problem: { path: string }) => problem.path,
        );
        expect(paths, JSON.stringify(lastResult(page))).toContain(path);
    },
);

Then(
    "the stored VFX should still have duration {int}",
    async ({ page }, duration: number) => {
        const stored = await storedVfx(page, agentVfxId(page));
        expect(stored.definition.duration).toBe(duration);
    },
);

// ---- UI: mesh picker ----------------------------------------------------------

Given("a VFX mesh model exists", async ({ page }) => {
    const filePath = await UniqueFileGenerator.generate("test-cube.glb", {
        uniqueFilename: true,
    });
    const uploaded = await apiHelper.uploadModel(filePath);
    const detail = await page.request.get(`${API_BASE}/models/${uploaded.id}`);
    await expectOk(detail, "The VFX mesh model could not be read back");
    getScenarioState(page).setCustom(MODEL_KEY, {
        id: uploaded.id,
        name: String((await detail.json()).name),
    });
});

When("the user adds a mesh component from the library", async ({ page }) => {
    const model = getScenarioState(page).getCustom<{ name: string }>(MODEL_KEY);
    expect(model, "No VFX mesh model was provisioned").toBeTruthy();

    await page.getByTestId("vfx-add-mesh").click();
    const picker = page.getByTestId("vfx-picker-model");
    await expect(picker).toBeVisible({ timeout: 15000 });
    await picker.locator('input[type="text"]').fill(model!.name);

    const item = picker
        .getByTestId("vfx-picker-item")
        .filter({ hasText: model!.name })
        .first();
    await expect(item).toBeVisible({ timeout: 15000 });

    // Picking a mesh edits the effect, which autosaves 600ms later. Wait for that
    // write here so the "stored VFX" assertion below is reading it, not racing it.
    const saved = page.waitForResponse(
        (candidate) =>
            /\/vfx\/\d+$/.test(new URL(candidate.url()).pathname) &&
            candidate.request().method() === "PUT" &&
            candidate.ok(),
        { timeout: 15000 },
    );
    await item.click();
    expect((await saved).ok()).toBeTruthy();

    await expect(page.getByTestId("vfx-asset-model")).toContainText(
        model!.name,
    );
});

Then("the timeline should show a mesh track", async ({ page }) => {
    await expect(new VfxPage(page).tracksOfType("mesh")).toHaveCount(1);
});

Then(
    "the stored VFX should hold a mesh component referencing the model",
    async ({ page }) => {
        const model = getScenarioState(page).getCustom<{ id: number }>(MODEL_KEY);
        const stored = await storedVfx(page, createdEffectId(page));
        const mesh = (stored.definition.components ?? []).find(
            (component: { type: string }) => component.type === "mesh",
        );
        expect(mesh, JSON.stringify(stored.definition)).toBeTruthy();
        expect(mesh.mesh.modelId).toBe(model!.id);
    },
);

// ---- UI: live preview ---------------------------------------------------------

Then("the VFX preview should be drawing", async ({ page }) => {
    const preview = page.getByTestId("vfx-preview");
    await expect(preview).toBeVisible({ timeout: 15000 });

    const canvas = preview.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    const box = await canvas.boundingBox();
    expect(box, "The VFX preview canvas has no size").toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
});

// ---- UI: inspector edits ------------------------------------------------------

When(
    "the user sets the particles {string} to {float}",
    async ({ page }, label: string, value: number) => {
        const field = page.getByTestId("vfx-inspector").getByLabel(label);
        await expect(field).toBeVisible({ timeout: 15000 });

        await Promise.all([
            page.waitForResponse(
                (candidate) =>
                    /\/vfx\/\d+$/.test(new URL(candidate.url()).pathname) &&
                    candidate.request().method() === "PUT" &&
                    candidate.ok(),
                { timeout: 15000 },
            ),
            (async () => {
                await field.fill(String(value));
                await field.blur();
            })(),
        ]);
    },
);

Then(
    "the stored VFX particles rate should be {float}",
    async ({ page }, rate: number) => {
        const stored = await storedVfx(page, createdEffectId(page));
        const particles = (stored.definition.components ?? []).find(
            (component: { type: string }) => component.type === "particles",
        );
        expect(particles, JSON.stringify(stored.definition)).toBeTruthy();
        expect(particles.particles.rate).toBe(rate);
    },
);

Then(
    "the particles {string} should read {string}",
    async ({ page }, label: string, value: string) => {
        await expect(
            page.getByTestId("vfx-inspector").getByLabel(label),
        ).toHaveValue(value);
    },
);
