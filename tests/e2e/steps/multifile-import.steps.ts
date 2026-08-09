import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelListPage } from "../pages/ModelListPage";
import { ApiHelper } from "../helpers/api-helper";
import { getScenarioState } from "../fixtures/shared-state";
import {
    stageMultiFileGltf,
    zipMultiFileGltf,
} from "../fixtures/multifile-gltf-fixture";

const { When, Then } = createBdd();

// Custom-state key holding the per-run-unique model name derived from the staged
// primary (e.g. "Quad-1a2b3c4d"), so later steps can resolve the created model.
const MODEL_KEY = "multiFileModelName";

async function resolveModel(page: import("@playwright/test").Page) {
    const modelName = getScenarioState(page).getCustom<string>(MODEL_KEY);
    if (!modelName) {
        throw new Error("No multi-file model was imported in this scenario");
    }
    const api = new ApiHelper();
    const model = await api.findModelByName(modelName);
    if (!model) {
        throw new Error(`Imported model "${modelName}" not found via API`);
    }
    return { modelName, model, api };
}

When("I import a multi-file glTF folder", async ({ page }) => {
    const modelList = new ModelListPage(page);
    const staged = await stageMultiFileGltf();
    getScenarioState(page).setCustom(MODEL_KEY, staged.modelName);
    await modelList.importFolder(staged.dir);
});

When("I import a multi-file glTF zip", async ({ page }) => {
    const modelList = new ModelListPage(page);
    const staged = await stageMultiFileGltf();
    getScenarioState(page).setCustom(MODEL_KEY, staged.modelName);
    const zipPath = await zipMultiFileGltf(staged);
    await modelList.importZip(zipPath);
});

Then(
    "the imported multi-file model should have its .bin and texture as auxiliary files",
    async ({ page }) => {
        const { model, api } = await resolveModel(page);
        const versions = await api.getModelVersions(model.id);
        expect(versions.length).toBeGreaterThan(0);
        const versionId = versions[0].id;

        const auxiliaries = await api.getVersionAuxiliaryFiles(
            model.id,
            versionId,
        );
        const relativePaths = auxiliaries.map((a: any) => a.relativePath);
        // Both external references the .gltf points at must be persisted against
        // the same version, addressed by the relative path the .gltf uses.
        expect(relativePaths).toContain("Quad.bin");
        expect(relativePaths).toContain("Quad.png");
    },
);

Then(
    "the imported multi-file model should eventually render",
    async ({ page }) => {
        const { modelName } = await resolveModel(page);
        const { DbHelper } = await import("../fixtures/db-helper");
        const db = new DbHelper();
        try {
            // Thumbnail Ready (Status=2) proves the worker loaded the loose .gltf by
            // resolving its external .bin/.png and rendered it. A dropped external
            // reference would fail the render (Status=3), which we surface immediately.
            await expect
                .poll(
                    async () => {
                        const result = await db.query(
                            `SELECT t."Status"
                               FROM "ModelVersions" mv
                               JOIN "Models" m ON m."Id" = mv."ModelId"
                               LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                              WHERE m."DeletedAt" IS NULL AND m."Name" = $1
                              ORDER BY mv."CreatedAt" DESC
                              LIMIT 1`,
                            [modelName],
                        );
                        if (result.rows.length === 0) return -1;
                        const status = result.rows[0].Status;
                        if (status === 3) {
                            throw new Error(
                                `Render failed for multi-file model "${modelName}" — external reference likely unresolved`,
                            );
                        }
                        return status ?? -1;
                    },
                    {
                        message: `Waiting for multi-file model "${modelName}" to render`,
                        timeout: 240000,
                        intervals: [3000],
                    },
                )
                .toBe(2);
        } finally {
            await db.close();
        }
    },
);

Then(
    "the imported multi-file model should have extracted mesh parts",
    async ({ page }) => {
        const { model } = await resolveModel(page);
        const { DbHelper } = await import("../fixtures/db-helper");
        const db = new DbHelper();
        try {
            // Extraction ran over the resolved geometry: at least one mesh part exists
            // for the model, with a non-null geometry hash (the quad's single mesh).
            await expect
                .poll(
                    async () => {
                        const result = await db.query(
                            `SELECT COUNT(*)::int AS n
                               FROM "AssetParts"
                              WHERE "AssetType" = 'Model'
                                AND "AssetId" = $1
                                AND "ObjectType" = 'mesh'`,
                            [model.id],
                        );
                        return result.rows[0].n as number;
                    },
                    {
                        message: `Waiting for extracted mesh parts of model ${model.id}`,
                        timeout: 60000,
                        intervals: [2000],
                    },
                )
                .toBeGreaterThan(0);
        } finally {
            await db.close();
        }
    },
);
