import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { connectMcp, McpClient } from "../helpers/mcp-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

const MCP_KEY = "blender-mcp:mcp";
const MODEL_KEY = "blender-mcp:model";
const LAST_RESULT_KEY = "blender-mcp:last-result";

interface BlenderModel {
    id: number;
    name: string;
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

function model(page: Page): BlenderModel {
    const found = getScenarioState(page).getCustom<BlenderModel>(MODEL_KEY);
    if (!found) {
        throw new Error('No "batch3 blender model" was provisioned.');
    }
    return found;
}

function lastResult(page: Page): any {
    const found = getScenarioState(page).getCustom<any>(LAST_RESULT_KEY);
    if (!found) {
        throw new Error("No MCP result was captured in this scenario.");
    }
    return found;
}

Given("a batch3 blender model exists", async ({ page }) => {
    const filePath = await UniqueFileGenerator.generate("test-cube.glb");
    const uploaded = await apiHelper.uploadModel(filePath);
    getScenarioState(page).setCustom(MODEL_KEY, {
        id: uploaded.id,
        name: uploaded.name,
    });
});

When(
    "an agent calls {string} on the batch3 blender model",
    async ({ page }, tool: string) => {
        const args: Record<string, unknown> = {
            modelId: model(page).id,
            idempotencyKey: McpClient.key(tool),
        };
        if (tool === "convert_model") {
            args.format = "glb";
        }
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await (await mcp(page)).callTool(tool, args),
        );
    },
);

Then(
    "the agent should be told Blender is not available",
    async ({ page }) => {
        const result = lastResult(page);
        expect(result.error, JSON.stringify(result)).toBe(
            "Blender.NotAvailable",
        );
        expect(result.message).toContain("not installed");
    },
);

When("an agent asks for the status of a missing job", async ({ page }) => {
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await (await mcp(page)).callTool("get_job_status", {
            jobId: 2147483000,
        }),
    );
});

Then("the job status should report the job was not found", async ({ page }) => {
    expect(lastResult(page).error, JSON.stringify(lastResult(page))).toBe(
        "Job.NotFound",
    );
});
