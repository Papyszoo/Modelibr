import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import { ApiHelper } from "../helpers/api-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import { getScenarioState } from "../fixtures/shared-state";

const { Given, When, Then } = createBdd();

const apiHelper = new ApiHelper();

// Run-unique suffix so texture set names never collide across runs.
const runId = Date.now().toString(36).slice(-4);

// Texture set kind numbers as understood by the API.
const KIND = { multiModel: 0, universal: 1, singleModel: 2 } as const;
const KIND_BY_NAME: Record<string, number> = {
    "Multi-Model": KIND.multiModel,
    Universal: KIND.universal,
    "Single Model": KIND.singleModel,
};

// Texture sets created within this scenario, keyed by feature-file alias.
const createdSets: Record<string, { id: number; name: string }> = {};

function uniqueName(alias: string): string {
    return `${alias}_${runId}`;
}

function trackedSet(alias: string): { id: number; name: string } {
    const set = createdSets[alias];
    if (!set) {
        throw new Error(
            `Texture set "${alias}" was not created in this scenario.`,
        );
    }
    return set;
}

function resolveModel(page: Page, modelAlias: string): { id: number } {
    const model = getScenarioState(page).getModel(modelAlias);
    if (!model) {
        throw new Error(`Model "${modelAlias}" is not in shared state.`);
    }
    return model;
}

async function firstVersionId(modelId: number): Promise<number> {
    const versions = await apiHelper.getModelVersions(modelId);
    const versionId = versions[0]?.id;
    if (!versionId) {
        throw new Error(`Model ${modelId} has no versions to link against.`);
    }
    return versionId;
}

async function createAndLink(
    page: Page,
    alias: string,
    kind: number,
    modelAlias: string,
): Promise<void> {
    const name = uniqueName(alias);
    const file = await UniqueFileGenerator.generate("blue_color.png");
    const result = await apiHelper.createTextureSetWithFileAndKind(
        name,
        file,
        1, // Albedo
        kind,
    );
    createdSets[alias] = { id: result.textureSetId, name };

    const model = resolveModel(page, modelAlias);
    const versionId = await firstVersionId(model.id);
    await apiHelper.linkTextureSetToModel(
        result.textureSetId,
        model.id,
        versionId,
    );
    console.log(
        `[API] Created texture set "${name}" (kind ${kind}) and linked to "${modelAlias}"`,
    );
}

// ── Data provisioning ─────────────────────────────────────────────────

Given(
    "a Multi-Model texture set {string} linked to {string}",
    async ({ page }, alias: string, modelAlias: string) => {
        await createAndLink(page, alias, KIND.multiModel, modelAlias);
    },
);

Given(
    "a Single Model texture set {string} linked to {string}",
    async ({ page }, alias: string, modelAlias: string) => {
        await createAndLink(page, alias, KIND.singleModel, modelAlias);
    },
);

Given(
    "texture set {string} is also linked to {string}",
    async ({ page }, alias: string, modelAlias: string) => {
        const set = trackedSet(alias);
        const model = resolveModel(page, modelAlias);
        const versionId = await firstVersionId(model.id);
        await apiHelper.linkTextureSetToModel(set.id, model.id, versionId);
        console.log(
            `[API] Texture set "${set.name}" also linked to "${modelAlias}"`,
        );
    },
);

// ── Materials panel interactions ──────────────────────────────────────

When(
    "I right-click the material item for texture set {string}",
    async ({ page }, alias: string) => {
        const set = trackedSet(alias);

        const viewer = new ModelViewerPage(page);
        await viewer.openTab("Materials", '[data-testid="materials-panel"]');

        const item = page
            .locator(`.materials-item[data-texture-set="${set.name}"]`)
            .first();
        await expect(item).toBeVisible({ timeout: 15000 });
        await item.scrollIntoViewIfNeeded();
        await item.click({ button: "right" });

        await page.waitForSelector(".p-contextmenu", { timeout: 5000 });
        console.log(`[Action] Right-clicked material item "${set.name}"`);
    },
);

// ── Conversion warning dialog ─────────────────────────────────────────

Then(
    "a conversion warning dialog should appear mentioning {string}",
    async ({ page }, modelAlias: string) => {
        const model = resolveModel(page, modelAlias);
        const realName = (await apiHelper.getModel(model.id)).name;

        const dialog = page.locator(".p-confirm-dialog");
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog).toContainText(realName, { timeout: 5000 });
        console.log(
            `[Assert] Conversion warning dialog lists model "${realName}"`,
        );
    },
);

When("I accept the conversion warning dialog", async ({ page }) => {
    const dialog = page.locator(".p-confirm-dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("button", { name: "Convert & Unlink" }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });
    console.log(`[Action] Accepted conversion warning dialog`);
});

// ── API verification ──────────────────────────────────────────────────

Then(
    "texture set {string} should have kind {string} via API",
    async ({}, alias: string, kindName: string) => {
        const set = trackedSet(alias);
        const expectedKind = KIND_BY_NAME[kindName];
        if (expectedKind === undefined) {
            throw new Error(`Unknown texture set kind "${kindName}".`);
        }

        // The conversion is async (kind update + query invalidation), so poll.
        let actualKind = -1;
        for (let attempt = 0; attempt < 20; attempt++) {
            const dto = await apiHelper.getTextureSetById(set.id);
            actualKind = dto.kind;
            if (actualKind === expectedKind) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        expect(actualKind).toBe(expectedKind);
        console.log(
            `[API] Texture set "${set.name}" has kind ${kindName} (${expectedKind})`,
        );
    },
);

Then(
    "texture set {string} should not be linked to {string} via API",
    async ({ page }, alias: string, modelAlias: string) => {
        const set = trackedSet(alias);
        const model = resolveModel(page, modelAlias);

        let stillLinked = true;
        for (let attempt = 0; attempt < 20; attempt++) {
            const dto = await apiHelper.getTextureSetById(set.id);
            const associated: Array<{ id: number }> =
                dto.associatedModels ?? [];
            stillLinked = associated.some((m) => m.id === model.id);
            if (!stillLinked) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        expect(stillLinked).toBe(false);
        console.log(
            `[API] Texture set "${set.name}" is no longer linked to "${modelAlias}"`,
        );
    },
);
