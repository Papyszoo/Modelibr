/**
 * Step definitions for Script CRUD, in-app authoring, and pack association.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { getScenarioState } from "../fixtures/shared-state";
import { ScriptListPage } from "../pages/ScriptListPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function waitForScriptsUiReady(page: any): Promise<void> {
    await page
        .waitForSelector(
            ".script-list, .script-grid, .script-list-empty, button:has-text('Add Category'), input[type='file']",
            { timeout: 15000 },
        )
        .catch(() => {});
}

async function cleanupScriptByName(page: any, name: string): Promise<void> {
    const res = await page.request.get(`${API_BASE}/scripts`);
    if (!res.ok()) return;
    const data = await res.json();
    const matches = (data.scripts || []).filter((s: any) => s.name === name);
    for (const script of matches) {
        await page.request
            .delete(`${API_BASE}/scripts/${script.id}`)
            .catch(() => {});
    }
}

/** Create a script via API and store it in shared state under `name`. */
async function provisionScript(page: any, name: string): Promise<any> {
    await cleanupScriptByName(page, name);
    const res = await page.request.post(`${API_BASE}/scripts`, {
        data: { name, language: "lua", content: "-- provisioned\n" },
    });
    if (!res.ok()) {
        throw new Error(
            `Failed to provision script "${name}": ${res.status()} ${await res.text()}`,
        );
    }
    const created = await res.json();
    const script = { id: created.scriptId, name };
    getScenarioState(page).setCustom(`script:${name}`, script);
    return script;
}

/** Looks up a script by name via the API and stores its id in shared state. */
async function recordScriptId(page: any, scriptName: string): Promise<void> {
    const data = await (await page.request.get(`${API_BASE}/scripts`)).json();
    const created = (data.scripts || []).find(
        (s: any) => s.name === scriptName,
    );
    if (created) {
        getScenarioState(page).setCustom(`script:${scriptName}`, {
            id: created.id,
            name: scriptName,
        });
    }
}

// ============= Navigation =============

Given("I am on the scripts page", async ({ page }) => {
    const scriptsPage = new ScriptListPage(page);
    await scriptsPage.goto();
    await waitForScriptsUiReady(page);
});

// ============= Upload =============

When(
    "I upload a script named {string} from {string}",
    async ({ page }, scriptName: string, filename: string) => {
        await cleanupScriptByName(page, scriptName);
        const filePath = path.resolve(__dirname, "..", "assets", filename);

        const before = await (
            await page.request.get(`${API_BASE}/scripts`)
        ).json();
        const existingIds = new Set(
            (before.scripts || []).map((s: any) => s.id),
        );

        const scriptsPage = new ScriptListPage(page);
        await waitForScriptsUiReady(page);
        const uploadResponse = page.waitForResponse(
            (resp: any) =>
                resp.url().includes("/scripts/with-file") &&
                resp.request().method() === "POST" &&
                resp.status() >= 200 &&
                resp.status() < 300,
        );
        await scriptsPage.uploadScript(filePath);
        await uploadResponse;
        await page.waitForLoadState("domcontentloaded");

        const after = await (
            await page.request.get(`${API_BASE}/scripts`)
        ).json();
        let script = (after.scripts || []).find(
            (s: any) => !existingIds.has(s.id),
        );
        if (script && script.name !== scriptName) {
            await page.request.put(`${API_BASE}/scripts/${script.id}`, {
                data: { name: scriptName },
            });
            script.name = scriptName;
        }
        if (script) {
            getScenarioState(page).setCustom(`script:${scriptName}`, {
                id: script.id,
                name: scriptName,
            });
        }

        await scriptsPage.goto();
        await waitForScriptsUiReady(page);
    },
);

// ============= In-app authoring =============

When(
    "I create a new script named {string} in language {string}",
    async ({ page }, scriptName: string, languageLabel: string) => {
        await cleanupScriptByName(page, scriptName);
        const scriptsPage = new ScriptListPage(page);
        await scriptsPage.openCreateDialog();
        await scriptsPage.createScript(scriptName, languageLabel);
        await recordScriptId(page, scriptName);
    },
);

When(
    "I create a new script named {string} in language {string} with description {string}",
    async (
        { page },
        scriptName: string,
        languageLabel: string,
        description: string,
    ) => {
        await cleanupScriptByName(page, scriptName);
        const scriptsPage = new ScriptListPage(page);
        await scriptsPage.openCreateDialog();
        await scriptsPage.createScript(scriptName, languageLabel, description);
        await recordScriptId(page, scriptName);
    },
);

When(
    "I write {string} in the script editor and save",
    async ({ page }, content: string) => {
        const scriptsPage = new ScriptListPage(page);
        await scriptsPage.typeInEditor(content);
        await scriptsPage.saveEditor();
        // The editor is its own tab now; click back to the Scripts list tab
        // (without resetting the app) so list assertions can run.
        await scriptsPage.returnToList();
        await page.waitForLoadState("domcontentloaded");
    },
);

Then(
    "the script editor preview pane should be visible",
    async ({ page }) => {
        const scriptsPage = new ScriptListPage(page);
        expect(await scriptsPage.previewVisible()).toBeTruthy();
    },
);

Then(
    "the script {string} card should show description {string}",
    async ({ page }, scriptName: string, expected: string) => {
        const scriptsPage = new ScriptListPage(page);
        await expect(scriptsPage.getCardDescription(scriptName)).toHaveText(
            new RegExp(expected),
            { timeout: 10000 },
        );
    },
);

Then(
    "the script {string} content should contain {string}",
    async ({ page }, scriptName: string, expected: string) => {
        const script = getScenarioState(page).getCustom<any>(
            `script:${scriptName}`,
        );
        expect(script, `script "${scriptName}" not in state`).toBeTruthy();
        await expect
            .poll(
                async () => {
                    const res = await page.request.get(
                        `${API_BASE}/scripts/${script.id}/file`,
                    );
                    return res.ok() ? await res.text() : "";
                },
                { timeout: 15000, intervals: [500, 1000, 2000] },
            )
            .toContain(expected);
    },
);

// ============= Preconditions =============

Given("a script named {string} exists", async ({ page }, name: string) => {
    await provisionScript(page, name);
    const scriptsPage = new ScriptListPage(page);
    await scriptsPage.goto();
    await waitForScriptsUiReady(page);
});

Given("a pack named {string} exists", async ({ page }, name: string) => {
    const existing = await (
        await page.request.get(`${API_BASE}/packs`)
    ).json();
    let pack = (existing.packs || []).find((p: any) => p.name === name);
    if (!pack) {
        const res = await page.request.post(`${API_BASE}/packs`, {
            data: { name },
        });
        pack = await res.json();
    }
    getScenarioState(page).setCustom(`pack:${name}`, {
        id: pack.id ?? pack.packId,
        name,
    });
});

// ============= Pack association =============

When(
    "I add the script {string} to the pack {string} via API",
    async ({ page }, scriptName: string, packName: string) => {
        const script = getScenarioState(page).getCustom<any>(
            `script:${scriptName}`,
        );
        const pack = getScenarioState(page).getCustom<any>(`pack:${packName}`);
        const res = await page.request.post(
            `${API_BASE}/packs/${pack.id}/scripts/${script.id}`,
        );
        expect(res.ok()).toBeTruthy();
    },
);

Then(
    "the pack {string} should contain the script {string}",
    async ({ page }, packName: string, scriptName: string) => {
        const pack = getScenarioState(page).getCustom<any>(`pack:${packName}`);
        const script = getScenarioState(page).getCustom<any>(
            `script:${scriptName}`,
        );
        const res = await page.request.get(
            `${API_BASE}/scripts?packIds=${pack.id}`,
        );
        const data = await res.json();
        const ids = (data.scripts || []).map((s: any) => s.id);
        expect(ids).toContain(script.id);
    },
);

// ============= Recycle =============

When("I recycle the script {string}", async ({ page }, name: string) => {
    const scriptsPage = new ScriptListPage(page);
    await scriptsPage.goto();
    await waitForScriptsUiReady(page);
    await scriptsPage.rightClickScriptByName(name);
    await scriptsPage.clickRecycleMenuItem();
    await page.waitForLoadState("domcontentloaded");
});

// ============= Visibility =============

Then(
    "the script {string} should be visible in the script list",
    async ({ page }, scriptName: string) => {
        const scriptsPage = new ScriptListPage(page);
        await expect(async () => {
            const card = scriptsPage.getScriptCardByName(scriptName);
            const visible = await card
                .first()
                .isVisible()
                .catch(() => false);
            if (!visible) {
                await page.reload();
                await page.waitForLoadState("domcontentloaded");
            }
            await expect(card.first()).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 30000, intervals: [2000, 3000, 5000] });
    },
);

Then(
    "the script {string} should not be visible in the script list",
    async ({ page }, scriptName: string) => {
        const scriptsPage = new ScriptListPage(page);
        await expect(
            scriptsPage.getScriptCardByName(scriptName),
        ).not.toBeVisible({ timeout: 10000 });
    },
);
