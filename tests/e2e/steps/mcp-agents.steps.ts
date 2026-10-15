import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { connectMcp } from "../helpers/mcp-client";
import {
    connectRawMcp,
    RawMcpClient,
} from "../helpers/mcp-agent-client";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

const AGENTS_KEY = "mcp-agents:agents";
const TOOLS_KEY = "mcp-agents:tools";
const MODELIBR_KEY = "mcp-agents:modelibr";
const SESSION_KEY = "mcp-agents:session";
const SESSION_AGENT_KEY = "mcp-agents:session-agent";
const LAST_RESULT_KEY = "mcp-agents:last-result";

function lastResult(page: Page): any {
    const found = getScenarioState(page).getCustom<any>(LAST_RESULT_KEY);
    if (!found) {
        throw new Error("No MCP result was captured in this scenario.");
    }
    return found;
}

function session(page: Page): RawMcpClient {
    const found = getScenarioState(page).getCustom<RawMcpClient>(SESSION_KEY);
    if (!found) {
        throw new Error("No agent-scoped session was opened.");
    }
    return found;
}

function sessionAgent(page: Page): any {
    return getScenarioState(page).getCustom<any>(SESSION_AGENT_KEY);
}

/** Fetches the agent registry once per scenario and caches it in state. */
async function fetchAgents(page: Page): Promise<any[]> {
    const state = getScenarioState(page);
    const cached = state.getCustom<any[]>(AGENTS_KEY);
    if (cached) {
        return cached;
    }
    const agents = await page.request.get(`${API_BASE}/mcp-agents`);
    expect(agents.ok(), `GET /mcp-agents: ${agents.status()}`).toBe(true);
    const body = await agents.json();
    state.setCustom(AGENTS_KEY, body);
    return body;
}

// ---- The settings explorer -------------------------------------------------------

When(
    "I open the {string} settings section",
    async ({ page }, label: string) => {
        await page
            .locator(`.settings-nav-item:has-text("${label}")`)
            .first()
            .click();
        await expect(
            page.locator(`.section-detail-title:has-text("${label}")`),
        ).toBeVisible({ timeout: 15000 });
    },
);

Then(
    "the MCP explorer should list the {string} agent",
    async ({ page }, name: string) => {
        await expect(
            page.locator(".mcp-agent-card .mcp-agent-name", { hasText: name }),
        ).toBeVisible({ timeout: 15000 });
    },
);

Then(
    "the MCP explorer should list the registered tool {string}",
    async ({ page }, name: string) => {
        await page.fill("#mcp-tools-search", name);
        await expect(
            page.locator(".mcp-tool-row .mcp-tool-name", { hasText: name }),
        ).toBeVisible({ timeout: 15000 });
    },
);

// ---- The registry API -----------------------------------------------------------

When("an HTTP client lists the MCP agents", async ({ page }) => {
    await fetchAgents(page);
    const tools = await page.request.get(`${API_BASE}/mcp-tools`);
    expect(tools.ok(), `GET /mcp-tools: ${tools.status()}`).toBe(true);
    getScenarioState(page).setCustom(TOOLS_KEY, await tools.json());
});

Then(
    "the MCP agents should include {string}",
    async ({ page }, name: string) => {
        const agents = getScenarioState(page).getCustom<any[]>(AGENTS_KEY);
        const agent = agents.find((candidate) => candidate.name === name);
        expect(agent, JSON.stringify(agents)).toBeTruthy();
        expect(agent.tools.length).toBeGreaterThan(0);
    },
);

Then(
    "every configured agent's tools should be registered",
    async ({ page }) => {
        const agents = getScenarioState(page).getCustom<any[]>(AGENTS_KEY);
        const tools = getScenarioState(page).getCustom<any[]>(TOOLS_KEY);
        const registered = new Set(tools.map((tool) => tool.name));
        for (const agent of agents) {
            for (const tool of agent.tools) {
                expect(
                    registered.has(tool.name),
                    `Agent ${agent.name} names the unregistered tool ${tool.name}`,
                ).toBe(true);
            }
        }
    },
);

// ---- Agent-scoped sessions ------------------------------------------------------

When(
    "an agent-scoped MCP client connects to {string}",
    async ({ page }, agent: string) => {
        const agents = await fetchAgents(page);
        const definition = agents.find(
            (candidate) => candidate.name === agent,
        );
        expect(definition, `No agent "${agent}" is configured`).toBeTruthy();
        getScenarioState(page).setCustom(SESSION_AGENT_KEY, definition);
        const client = await connectRawMcp(
            page.request,
            `${API_BASE}/mcp/agents/${agent}`,
        );
        getScenarioState(page).setCustom(SESSION_KEY, client);
    },
);

Then(
    "the session should expose exactly the {string} tools",
    async ({ page }, agent: string) => {
        const declared = sessionAgent(page).tools.map(
            (tool: { name: string }) => tool.name,
        );
        const exposed = (await session(page).listTools()).map(
            (tool) => tool.name,
        );
        expect(
            [...exposed].sort(),
            `Agent ${agent} exposed ${JSON.stringify(exposed)}`,
        ).toEqual([...declared].sort());
    },
);

When(
    "that session calls {string}",
    async ({ page }, tool: string) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await session(page).callToolRaw(tool, {
                idempotencyKey: "batch3-unknown-tool",
            }),
        );
    },
);

Then(
    "the session should refuse the tool as unknown",
    async ({ page }) => {
        const result = lastResult(page);
        expect(result.error, JSON.stringify(result)).toBeTruthy();
        expect(result.error.code).toBe(-32602);
        expect(String(result.error.message)).toContain("Unknown tool");
    },
);

When(
    "that session reads a {string} asset",
    async ({ page }, assetType: string) => {
        getScenarioState(page).setCustom(
            LAST_RESULT_KEY,
            await session(page).callToolRaw("get_asset", {
                assetType,
                assetId: 1,
            }),
        );
    },
);

Then("the session should refuse the asset family", async ({ page }) => {
    const result = lastResult(page);
    expect(result.value?.error, JSON.stringify(result)).toBe(
        "AssetFamilyNotAllowed",
    );
});

// ---- get_agent_setup ------------------------------------------------------------

When("the main MCP client asks for the agent setup", async ({ page }) => {
    const client = await connectMcp(page.request);
    getScenarioState(page).setCustom(MODELIBR_KEY, client);
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await client.callTool("get_agent_setup", {}),
    );
});

Then(
    "the agent setup should describe the main agent {string}",
    async ({ page }, name: string) => {
        const result = lastResult(page);
        expect(result.mainAgent?.name, JSON.stringify(result)).toBe(name);
        expect(result.mainAgent.tools.length).toBeGreaterThan(0);
        expect(result.mainAgent.instructions).toBeTruthy();
    },
);

Then(
    "the agent setup should list the subagent {string} with its path",
    async ({ page }, name: string) => {
        const result = lastResult(page);
        const subagent = (result.subagents ?? []).find(
            (candidate: { name: string }) => candidate.name === name,
        );
        expect(subagent, JSON.stringify(result)).toBeTruthy();
        expect(subagent.mcpPath).toBe(`/agents/${name}`);
        expect(subagent.tools.length).toBeGreaterThan(0);
    },
);

When("that session asks for the agent setup", async ({ page }) => {
    getScenarioState(page).setCustom(
        LAST_RESULT_KEY,
        await session(page).callToolRaw("get_agent_setup", {}),
    );
});
