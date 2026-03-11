/**
 * Setup State Bridge
 *
 * Persists model/texture-set state created during the setup phase to a JSON file
 * so that chromium-phase tests can recover exact IDs without guessing via DB queries.
 *
 * Flow:
 *   1. global-setup.ts clears the file before any tests run
 *   2. Setup steps call persistModel / persistTextureSet after saving to ScenarioState
 *   3. Chromium auto-provisioning calls loadPersistedModel / loadPersistedTextureSet
 *      before falling back to DB queries
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(__dirname, "..", ".setup-state.json");

interface PersistedModel {
    id: number;
    name: string;
    versionId?: number;
}

interface PersistedTextureSet {
    id: number;
    name: string;
}

interface PersistedState {
    models: Record<string, PersistedModel>;
    textureSets: Record<string, PersistedTextureSet>;
}

function readState(): PersistedState {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
        }
    } catch {
        // Corrupted file — start fresh
    }
    return { models: {}, textureSets: {} };
}

function writeState(state: PersistedState): void {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/** Remove the persisted state file (call from global-setup.ts) */
export function clearPersistedState(): void {
    try {
        if (fs.existsSync(STATE_FILE)) {
            fs.unlinkSync(STATE_FILE);
            console.log("[SetupBridge] Cleared persisted state file");
        }
    } catch {
        // Ignore errors
    }
}

/** Persist a model mapping written during setup phase */
export function persistModel(stateKey: string, model: PersistedModel): void {
    const state = readState();
    state.models[stateKey] = model;
    writeState(state);
    console.log(
        `[SetupBridge] Persisted model "${stateKey}" → id=${model.id}, name="${model.name}"`,
    );
}

/** Persist a texture-set mapping written during setup phase */
export function persistTextureSet(
    stateKey: string,
    textureSet: PersistedTextureSet,
): void {
    const state = readState();
    state.textureSets[stateKey] = textureSet;
    writeState(state);
    console.log(
        `[SetupBridge] Persisted textureSet "${stateKey}" → id=${textureSet.id}, name="${textureSet.name}"`,
    );
}

/** Load a persisted model (returns undefined if not found) */
export function loadPersistedModel(
    stateKey: string,
): PersistedModel | undefined {
    const state = readState();
    return state.models[stateKey];
}

/** Load a persisted texture-set (returns undefined if not found) */
export function loadPersistedTextureSet(
    stateKey: string,
): PersistedTextureSet | undefined {
    const state = readState();
    return state.textureSets[stateKey];
}

/** Load ALL persisted model IDs as a Set (for cleanup protection) */
export function loadAllPersistedModelIds(): Set<number> {
    const state = readState();
    const ids = new Set<number>();
    for (const model of Object.values(state.models)) {
        if (model.id) ids.add(model.id);
    }
    return ids;
}
