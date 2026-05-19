import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BackupApi } from "./backup-api.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS_DIR = path.resolve(HERE, "../../e2e/assets");

export interface SeedResult {
    modelIds: number[];
    textureSetIds: number[];
    packIds: number[];
    projectIds: number[];
    // Model that gets a second version, for history coverage.
    versionedModelId: number;
    // Model that gets soft-deleted before backup, for recycled-files coverage.
    recycledModelId: number;
}

/**
 * Seeds a known dataset covering every entity type that should survive a
 * backup/restore round-trip: models with multiple versions, texture sets with
 * file content, packs, projects with model associations, and a recycled
 * (soft-deleted) model.
 *
 * All asset files come from `tests/e2e/assets/`.
 */
export async function seedDataset(api: BackupApi): Promise<SeedResult> {
    const modelFiles = [
        "test-cube.glb",
        "test-cone.fbx",
        "test-cylinder.fbx",
        "test-icosphere.fbx",
        "test-torus.fbx",
    ].map((f) => path.join(ASSETS_DIR, f));

    for (const f of modelFiles) {
        if (!fs.existsSync(f)) {
            throw new Error(`Test asset missing: ${f}`);
        }
    }

    // ── Models (5 separate ones)
    const modelIds: number[] = [];
    for (const file of modelFiles) {
        const r = await api.uploadModel(file);
        if (![200, 201].includes(r.status)) {
            throw new Error(`uploadModel ${file} → ${r.status}: ${JSON.stringify(r.data)}`);
        }
        const id = r.data.id ?? r.data.modelId;
        if (!id) throw new Error(`uploadModel ${file} returned no id`);
        modelIds.push(id);
    }

    // ── A second version for the first model (history coverage).
    // The new version must reference a DIFFERENT file by content — content-
    // addressable storage rejects uploading the same hash as another version.
    // test.blend is unique to this v2 (not used by any model in the seed list).
    const versionedModelId = modelIds[0];
    const v2File = path.join(ASSETS_DIR, "test.blend");
    if (!fs.existsSync(v2File)) {
        throw new Error(`Test asset missing for model version: ${v2File}`);
    }
    const versionR = await api.createModelVersion(versionedModelId, v2File);
    if (![200, 201].includes(versionR.status)) {
        throw new Error(`createModelVersion → ${versionR.status}: ${JSON.stringify(versionR.data)}`);
    }

    // ── Texture sets (2, with files so uploads/ has content tied to them)
    const ts1 = await api.createTextureSetWithFile(
        `seed-ts-albedo`,
        path.join(ASSETS_DIR, "texture_albedo.png"),
        1, // Albedo
    );
    if (![200, 201].includes(ts1.status)) {
        throw new Error(`createTextureSetWithFile → ${ts1.status}: ${JSON.stringify(ts1.data)}`);
    }
    const ts2 = await api.createTextureSetWithFile(
        `seed-ts-orm`,
        path.join(ASSETS_DIR, "texture_orm.png"),
        4, // AO
    );
    if (![200, 201].includes(ts2.status)) {
        throw new Error(`createTextureSetWithFile → ${ts2.status}: ${JSON.stringify(ts2.data)}`);
    }
    const textureSetIds = [
        ts1.data.textureSetId ?? ts1.data.id,
        ts2.data.textureSetId ?? ts2.data.id,
    ];

    // ── Packs (2) — second one gets a couple of models
    const packA = await api.createPack("seed-pack-A", "Pack A description");
    const packB = await api.createPack("seed-pack-B", "Pack B description");
    if (![200, 201].includes(packA.status) || ![200, 201].includes(packB.status)) {
        throw new Error(`createPack failed: ${packA.status} / ${packB.status}`);
    }
    const packIds = [packA.data.id, packB.data.id];
    await api.addModelToPack(packIds[1], modelIds[1]);
    await api.addModelToPack(packIds[1], modelIds[2]);

    // ── Projects (2) — first one gets a model
    const projA = await api.createProject("seed-project-A", "Project A");
    const projB = await api.createProject("seed-project-B", "Project B");
    if (![200, 201].includes(projA.status) || ![200, 201].includes(projB.status)) {
        throw new Error(`createProject failed: ${projA.status} / ${projB.status}`);
    }
    const projectIds = [projA.data.id, projB.data.id];
    await api.addModelToProject(projectIds[0], modelIds[3]);

    // ── Recycled: soft-delete one model so it lives in the recycle bin at backup time
    const recycledModelId = modelIds[4];
    const delStatus = await api.softDeleteModel(recycledModelId);
    if (![200, 204].includes(delStatus)) {
        throw new Error(`softDeleteModel → ${delStatus}`);
    }

    return {
        modelIds,
        textureSetIds,
        packIds,
        projectIds,
        versionedModelId,
        recycledModelId,
    };
}

// ── Snapshot ────────────────────────────────────────────────────────────

export interface Snapshot {
    modelIds: number[];                            // active (non-deleted) model IDs
    modelHashesById: Record<number, string[]>;    // model id → sorted list of file SHA-256s
    versionCountById: Record<number, number>;     // model id → version count
    textureSetIds: number[];
    textureSetNameById: Record<number, string>;
    textureCountById: Record<number, number>;     // texture set → texture count
    packIds: number[];
    packNameById: Record<number, string>;
    packModelCountById: Record<number, number>;
    projectIds: number[];
    projectNameById: Record<number, string>;
    projectModelCountById: Record<number, number>;
    recycledEntries: Array<{ entityType: string; entityId: number; name?: string }>;
}

/**
 * Takes a structural snapshot of the live state. Returned objects are sorted
 * so the snapshot is order-independent and safe to deep-compare.
 */
export async function takeSnapshot(api: BackupApi): Promise<Snapshot> {
    const models = await api.listModels();
    const modelIds = models.map((m: any) => m.id).sort((a: number, b: number) => a - b);

    const modelHashesById: Record<number, string[]> = {};
    const versionCountById: Record<number, number> = {};
    for (const id of modelIds) {
        const versions = await api.getModelVersions(id);
        versionCountById[id] = versions.length;
        const hashes: string[] = [];
        for (const v of versions) {
            const files = v.files ?? [];
            for (const f of files) {
                if (f.sha256 || f.hash) hashes.push((f.sha256 || f.hash) as string);
            }
        }
        modelHashesById[id] = hashes.sort();
    }

    const textureSets = await api.listTextureSets();
    const textureSetIds = textureSets
        .map((t: any) => t.id)
        .sort((a: number, b: number) => a - b);
    const textureSetNameById: Record<number, string> = {};
    const textureCountById: Record<number, number> = {};
    for (const ts of textureSets) {
        textureSetNameById[ts.id] = ts.name;
        // Some list responses include textures, others need a per-id fetch.
        const details = Array.isArray(ts.textures) ? ts : await api.getTextureSet(ts.id);
        textureCountById[ts.id] = (details?.textures ?? []).length;
    }

    const packs = await api.listPacks();
    const packIds = packs.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const packNameById: Record<number, string> = {};
    const packModelCountById: Record<number, number> = {};
    for (const p of packs) {
        packNameById[p.id] = p.name;
        const detail = (await api.getPack(p.id)) ?? p;
        const ids = detail?.modelIds ?? detail?.models?.map((m: any) => m.id) ?? [];
        packModelCountById[p.id] = ids.length;
    }

    const projects = await api.listProjects();
    const projectIds = projects.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const projectNameById: Record<number, string> = {};
    const projectModelCountById: Record<number, number> = {};
    for (const p of projects) {
        projectNameById[p.id] = p.name;
        const detail = (await api.getProject(p.id)) ?? p;
        const ids = detail?.modelIds ?? detail?.models?.map((m: any) => m.id) ?? [];
        projectModelCountById[p.id] = ids.length;
    }

    const recycledEntries = (await api.listRecycled()).sort((a, b) => {
        if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType);
        return a.entityId - b.entityId;
    });

    return {
        modelIds,
        modelHashesById,
        versionCountById,
        textureSetIds,
        textureSetNameById,
        textureCountById,
        packIds,
        packNameById,
        packModelCountById,
        projectIds,
        projectNameById,
        projectModelCountById,
        recycledEntries,
    };
}
