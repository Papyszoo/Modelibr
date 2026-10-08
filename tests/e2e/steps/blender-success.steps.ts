import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

const MCP_KEY = "blender-success:mcp";
const MODEL_KEY = "blender-success:model";
const JOB_KEY = "blender-success:job";
const RESULT_KEY = "blender-success:result";

interface BlenderSuccessModel {
    id: number;
    name: string;
    versionCount: number;
}

interface QueuedJob {
    jobId: number;
    tool: string;
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

function state<T>(page: Page, key: string): T {
    const found = getScenarioState(page).getCustom<T>(key);
    if (!found) {
        throw new Error(`No "${key}" was captured in this scenario.`);
    }
    return found;
}

function model(page: Page): BlenderSuccessModel {
    return state<BlenderSuccessModel>(page, MODEL_KEY);
}

Given("a blender success model exists", async ({ page }) => {
    const filePath = await UniqueFileGenerator.generate("test-cube.glb");
    const uploaded = await apiHelper.uploadModel(filePath);
    const versions = await apiHelper.getModelVersions(uploaded.id);
    getScenarioState(page).setCustom<BlenderSuccessModel>(MODEL_KEY, {
        id: uploaded.id,
        name: uploaded.name,
        versionCount: versions.length,
    });
});

async function queueOperation(
    page: Page,
    tool: string,
    extra: Record<string, unknown> = {},
): Promise<void> {
    const result = await (
        await mcp(page)
    ).callTool(tool, {
        modelId: model(page).id,
        idempotencyKey: McpClient.key(tool),
        ...extra,
    });
    expect(result.error, JSON.stringify(result)).toBeUndefined();
    expect(result.status, JSON.stringify(result)).toBe("queued");
    expect(typeof result.jobId).toBe("number");
    getScenarioState(page).setCustom<QueuedJob>(JOB_KEY, {
        jobId: result.jobId,
        tool,
    });
}

When(
    "an agent calls {string} on the blender success model",
    async ({ page }, tool: string) => {
        await queueOperation(
            page,
            tool,
            tool === "convert_model" ? { format: "glb" } : {},
        );
    },
);

When(
    "an agent bakes textures on the blender success model",
    async ({ page }) => {
        // Small maps keep the slow lane bounded; the assertion is that the bake
        // produced a set, not how detailed it is.
        await queueOperation(page, "bake_textures", {
            maps: ["diffuse", "ao"],
            resolution: 256,
            samples: 8,
        });
    },
);

Then("the operation should be queued as a job", async ({ page }) => {
    const queued = state<QueuedJob>(page, JOB_KEY);
    expect(typeof queued.jobId).toBe("number");
});

When("the agent waits for the operation to finish", async ({ page }) => {
    const queued = state<QueuedJob>(page, JOB_KEY);
    // get_job_status blocks server-side for up to waitSeconds; loop only when it
    // answered before the verdict, so there is no client-side sleep.
    let job: any;
    for (let attempt = 0; attempt < 8; attempt++) {
        job = await (
            await mcp(page)
        ).callTool("get_job_status", {
            jobId: queued.jobId,
            waitSeconds: 120,
        });
        expect(job.error, JSON.stringify(job)).toBeUndefined();
        if (job.status === "Done" || job.status === "Dead") {
            break;
        }
    }
    getScenarioState(page).setCustom(RESULT_KEY, job);
});

Then("the operation should be done", async ({ page }) => {
    const job = state<any>(page, RESULT_KEY);
    expect(job.status, JSON.stringify(job)).toBe("Done");
    expect(job.errorMessage ?? null).toBeNull();
});

Then(
    "the operation should have written a new inactive version",
    async ({ page }) => {
        const job = state<any>(page, RESULT_KEY);
        const result = job.result;
        expect(result, JSON.stringify(job)).toBeTruthy();
        expect(typeof result.versionId).toBe("number");
        expect(result.setAsActive).toBe(false);

        const versions = await apiHelper.getModelVersions(model(page).id);
        expect(versions.length).toBeGreaterThan(model(page).versionCount);
        expect(versions.map((version: { id: number }) => version.id)).toContain(
            result.versionId,
        );

        const stored = await apiHelper.getModel(model(page).id);
        expect(stored.activeVersionId).not.toBe(result.versionId);
    },
);

Then(
    "the conversion should report the target format {string}",
    async ({ page }, format: string) => {
        const job = state<any>(page, RESULT_KEY);
        expect(job.result.format).toBe(format);
    },
);

Then("the analysis should report measured mesh parts", async ({ page }) => {
    const job = state<any>(page, RESULT_KEY);
    const parts = job.result.parts ?? [];
    expect(parts.length, JSON.stringify(job)).toBeGreaterThan(0);
    const part = parts[0];
    expect(typeof part.surfaceArea).toBe("number");
    expect(part.surfaceArea).toBeGreaterThan(0);
    expect(typeof part.triangleCount).toBe("number");
    expect(part.triangleCount).toBeGreaterThan(0);
});

Then(
    "the bake should have imported a texture set bound to the model",
    async ({ page }) => {
        const job = state<any>(page, RESULT_KEY);
        const result = job.result;
        expect(typeof result.textureSetId).toBe("number");
        expect(typeof result.boundToVersionId).toBe("number");

        const response = await page.request.get(
            `${API_BASE}/texture-sets/${result.textureSetId}`,
        );
        expect(
            response.ok(),
            `The baked texture set could not be read: ${response.status()}`,
        ).toBe(true);
        const textureSet = await response.json();
        expect(textureSet.textures?.length ?? 0).toBeGreaterThan(0);
        expect(
            (textureSet.associatedModels ?? []).map(
                (associated: { modelVersionId: number }) =>
                    associated.modelVersionId,
            ),
        ).toContain(result.boundToVersionId);
    },
);
