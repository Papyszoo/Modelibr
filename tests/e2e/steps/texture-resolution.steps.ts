/**
 * Step definitions for the texture-set resolution filter E2E.
 *
 * Resolution is extracted by the worker during texture-set processing, so the
 * "resolution is set to" step waits for the worker's dimension write to land
 * (bounded DB poll) and then overrides it to a deterministic value — the worker
 * writes dimensions once per job, early (right after download), so overriding
 * afterwards is race-free.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { DbHelper } from "../fixtures/db-helper";
import { ApiHelper } from "../helpers/api-helper";
import { TextureSetsPage } from "../pages/TextureSetsPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const db = new DbHelper();
const apiHelper = new ApiHelper();

// Universal (Global Material) sets get per-texture dimensions from the worker as a
// side effect of their thumbnail job (the only kind the backend enqueues a job for),
// so this path needs the worker poll below. ModelSpecific (Multi-Model) sets never
// get a worker pass — the backend extracts their dimensions synchronously at upload
// instead (TextureImageMetadataReader), so that path needs no poll (see the
// Multi-Model scenario in 22-modelspecific-resolution.feature).
Given(
    "I create a Global Material texture set {string}",
    async ({ page }, name: string) => {
        const uniqueName = `${name}-${Date.now()}`;
        const textureSet = await apiHelper.createTextureSetWithKind(uniqueName, 1);
        getScenarioState(page).saveTextureSet(name, {
            id: textureSet.id,
            name: uniqueName,
        });
    },
);

Given(
    "I create a Multi-Model texture set {string}",
    async ({ page }, name: string) => {
        const uniqueName = `${name}-${Date.now()}`;
        const textureSet = await apiHelper.createTextureSetWithKind(uniqueName, 0);
        getScenarioState(page).saveTextureSet(name, {
            id: textureSet.id,
            name: uniqueName,
        });
    },
);

Given(
    "the texture set {string} resolution is set to {int}",
    async ({ page }, setName: string, resolution: number) => {
        const textureSet = getScenarioState(page).getTextureSet(setName);
        if (!textureSet) {
            throw new Error(`Texture set "${setName}" not found in shared state`);
        }

        // Wait for the worker to write the texture's real dimensions, then we are
        // guaranteed to be the last writer when we override below.
        let textureId = 0;
        await expect
            .poll(
                async () => {
                    const result = await db.query(
                        `SELECT "Id", "Width" FROM "Textures"
                         WHERE "TextureSetId" = $1 AND "IsDeleted" = false
                         ORDER BY "Id" LIMIT 1`,
                        [textureSet.id],
                    );
                    const row = result.rows[0];
                    if (row?.Width != null) {
                        textureId = row.Id;
                        return true;
                    }
                    return false;
                },
                {
                    // Kept under the 90s per-test timeout so the poll fails with
                    // this message (worker never wrote dimensions) rather than the
                    // test timing out opaquely.
                    message: `Waiting for worker to write dimensions for texture set ${textureSet.id}`,
                    timeout: 60000,
                    intervals: [1000, 2000, 5000],
                },
            )
            .toBe(true);

        const response = await page.request.put(
            `${API_BASE}/texture-sets/${textureSet.id}/texture-metadata`,
            {
                data: {
                    textures: [
                        {
                            textureId,
                            width: resolution,
                            height: resolution,
                            format: "png",
                        },
                    ],
                },
            },
        );
        expect(response.ok()).toBeTruthy();
        console.log(
            `[Precondition] Texture set "${setName}" resolution set to ${resolution}px`,
        );
    },
);

When("I view the Global Materials texture sets", async ({ page }) => {
    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.selectKindTab("Global Materials");
    console.log("[Action] Viewing Global Materials texture sets");
});

When("I view the Multi-Model texture sets", async ({ page }) => {
    const textureSetsPage = new TextureSetsPage(page);
    await textureSetsPage.selectKindTab("Multi-Model");
    console.log("[Action] Viewing Multi-Model texture sets");
});

// Asserts the backend captured the source-image resolution at upload time (no
// worker pass for Multi-Model sets) — verifies the DB layer directly so a UI-only
// pass can't mask a missing extraction.
Then(
    "the texture set {string} should have extracted resolution {int}",
    async ({ page }, setName: string, resolution: number) => {
        const textureSet = getScenarioState(page).getTextureSet(setName);
        if (!textureSet) {
            throw new Error(`Texture set "${setName}" not found in shared state`);
        }
        const result = await db.query(
            `SELECT "Width", "Height" FROM "Textures"
             WHERE "TextureSetId" = $1 AND "IsDeleted" = false
             ORDER BY "Id" LIMIT 1`,
            [textureSet.id],
        );
        const row = result.rows[0];
        expect(row?.Width).toBe(resolution);
        expect(row?.Height).toBe(resolution);
        console.log(
            `[DB] Texture set "${setName}" extracted resolution ${row?.Width}x${row?.Height} ✓`,
        );
    },
);

When(
    "I search texture sets for {string}",
    async ({ page }, query: string) => {
        const textureSetsPage = new TextureSetsPage(page);
        await textureSetsPage.search(query);
        console.log(`[Action] Searched texture sets for "${query}"`);
    },
);

When(
    "I filter texture sets by minimum resolution {string}",
    async ({ page }, optionLabel: string) => {
        const textureSetsPage = new TextureSetsPage(page);
        await textureSetsPage.filterByMinResolution(optionLabel);
        console.log(`[Action] Filtered texture sets by resolution "${optionLabel}"`);
    },
);

Then(
    "the texture set {string} should be listed",
    async ({ page }, setName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(setName);
        if (!textureSet) {
            throw new Error(`Texture set "${setName}" not found in shared state`);
        }
        const textureSetsPage = new TextureSetsPage(page);
        await expect(
            textureSetsPage.getCardByName(textureSet.name).first(),
        ).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Texture set "${textureSet.name}" is listed ✓`);
    },
);

Then(
    "the texture set {string} should not be listed",
    async ({ page }, setName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(setName);
        if (!textureSet) {
            throw new Error(`Texture set "${setName}" not found in shared state`);
        }
        const textureSetsPage = new TextureSetsPage(page);
        await expect(
            textureSetsPage.getCardByName(textureSet.name).first(),
        ).not.toBeVisible({ timeout: 10000 });
        console.log(`[UI] Texture set "${textureSet.name}" is not listed ✓`);
    },
);
