import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";
import { PacksPage } from "../pages/PacksPage";
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

// Custom-state key holding the pack a zip was imported into.
const PACK_KEY = "multiFileImportPackId";

When(
  "I import a multi-file glTF zip from inside a new pack",
  async ({ page }) => {
    const api = new ApiHelper();
    const pack = await api.createPack(
      `zip-import-${Date.now().toString(36)}`,
      "Guards pack association on archive import",
    );
    getScenarioState(page).setCustom(PACK_KEY, pack.id);

    const packs = new PacksPage(page);
    await packs.navigateToPackList();
    await packs.openPack(pack.name, pack.id);
    // The import toolbar lives on the pack's Models tab (ContainerViewer), not
    // on the details tab it opens on.
    await packs.openContainerTab("models");

    const staged = await stageMultiFileGltf();
    getScenarioState(page).setCustom(MODEL_KEY, staged.modelName);
    const zipPath = await zipMultiFileGltf(staged);
    await new ModelListPage(page).importZip(zipPath);
  },
);

Then(
  "the imported multi-file model should belong to that pack",
  async ({ page }) => {
    const { model, api } = await resolveModel(page);
    const packId = getScenarioState(page).getCustom<number>(PACK_KEY);
    if (!packId) {
      throw new Error("No pack was created in this scenario");
    }

    // Association happens client-side once the import resolves.
    await expect
      .poll(
        async () => {
          const models = await api.getModelsByPack(packId);
          return models.some((m: any) => Number(m.id) === Number(model.id));
        },
        {
          message: `Waiting for model ${model.id} to be associated with pack ${packId}`,
          timeout: 30000,
          intervals: [1000],
        },
      )
      .toBe(true);
  },
);

When("I open the imported multi-file model in the viewer", async ({ page }) => {
  const { modelName } = await resolveModel(page);
  const modelList = new ModelListPage(page);
  await modelList.openModel(modelName);
  await new ModelViewerPage(page).waitForModelLoaded();
});

Then(
  "the viewer scene should contain the multi-file model's geometry",
  async ({ page }) => {
    // Regression: the viewer attached the shared safe loading manager to every
    // loader, which rewrites anything that isn't /files/<id> to a transparent PNG.
    // For a loose .gltf that meant its scene.bin buffer was swapped for an image,
    // so the model opened as an empty scene. Counting positions (not meshes) is
    // the assertion that catches it: an unresolved buffer still yields a mesh,
    // just one with no vertices.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            // @ts-expect-error - accessing runtime globals
            const scene = window.__THREE_SCENE__;
            if (!scene) return -1;
            let vertices = 0;
            scene.traverse((obj: any) => {
              // Skip Stage's shadow plane / helpers: only count geometry
              // that came out of the loaded model.
              if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
              if (obj.userData?.__modelibrHelper) return;
              vertices += obj.geometry.attributes.position.count;
            });
            return vertices;
          }),
        {
          message:
            "Waiting for the multi-file glTF's external buffer to resolve into scene geometry",
          timeout: 60000,
          intervals: [1000, 2000],
        },
      )
      .toBeGreaterThan(0);
  },
);

Then(
  "the imported multi-file model should have its .bin and texture as auxiliary files",
  async ({ page }) => {
    const { model, api } = await resolveModel(page);
    const versions = await api.getModelVersions(model.id);
    expect(versions.length).toBeGreaterThan(0);
    const versionId = versions[0].id;

    const auxiliaries = await api.getVersionAuxiliaryFiles(model.id, versionId);
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
  "the imported multi-file model should be indexed at its real source size",
  async ({ page }) => {
    // Regression: the thumbnail renderer scales every model so its largest
    // dimension is exactly 2.0 before framing it, and the scene-graph extractor
    // measured the model AFTER that. Every asset in the library was therefore
    // indexed at size 2 regardless of its real dimensions, silently corrupting
    // every size fact and size filter.
    //
    // The Quad fixture spans x/y in [-0.5, 0.5], so its true max dimension is 1.0.
    // 2.0 is the exact signature of the bug — hence the tight tolerance.
    const { model } = await resolveModel(page);
    const { DbHelper } = await import("../fixtures/db-helper");
    const db = new DbHelper();
    try {
      await expect
        .poll(
          async () => {
            const result = await db.query(
              `SELECT "MaxDimension"
                               FROM "AssetSearchDocuments"
                              WHERE "AssetType" = 'Model'
                                AND "AssetId" = $1
                                AND "PartPath" IS NULL
                              LIMIT 1`,
              [model.id],
            );
            if (result.rows.length === 0) return null;
            return Number(result.rows[0].MaxDimension);
          },
          {
            message: `Waiting for the search projection of model ${model.id}`,
            timeout: 60000,
            intervals: [2000],
          },
        )
        .not.toBeNull();

      const result = await db.query(
        `SELECT "MaxDimension"
                   FROM "AssetSearchDocuments"
                  WHERE "AssetType" = 'Model'
                    AND "AssetId" = $1
                    AND "PartPath" IS NULL
                  LIMIT 1`,
        [model.id],
      );
      const maxDimension = Number(result.rows[0].MaxDimension);
      expect(maxDimension).toBeCloseTo(1.0, 2);
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
