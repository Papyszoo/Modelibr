/**
 * Shared state fixture for managing test data across scenarios within a single test run.
 * Uses file-based persistence to survive module reloads between test files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, '..', '.shared-state.json');

interface ModelData {
    id: number;
    name: string;
    versionId?: number;
    versions?: Array<{ id: number; name: string }>;
}

interface TextureSetData {
    id: number;
    name: string;
    modelId?: number;
    versionId?: number;
}

interface VersionState {
    thumbnailDetails: any;
    thumbnailSrc: string | null;
}

interface StateData {
    models: Record<string, ModelData>;
    textureSets: Record<string, TextureSetData>;
    versionStates: Record<string, VersionState>;
}

class SharedState {
    private loadState(): StateData {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, 'utf-8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Error loading shared state:', e);
        }
        return { models: {}, textureSets: {}, versionStates: {} };
    }

    private saveState(state: StateData): void {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    }

    // Model management
    saveModel(name: string, data: ModelData): void {
        const state = this.loadState();
        state.models[name] = data;
        this.saveState(state);
    }

    getModel(name: string): ModelData | undefined {
        const state = this.loadState();
        return state.models[name];
    }

    hasModel(name: string): boolean {
        const state = this.loadState();
        return name in state.models;
    }

    // Texture set management
    saveTextureSet(name: string, data: TextureSetData): void {
        const state = this.loadState();
        state.textureSets[name] = data;
        this.saveState(state);
    }

    getTextureSet(name: string): TextureSetData | undefined {
        const state = this.loadState();
        return state.textureSets[name];
    }

    hasTextureSet(name: string): boolean {
        const state = this.loadState();
        return name in state.textureSets;
    }

    // Version state management
    saveVersionState(versionId: number, state: VersionState): void {
        const stateData = this.loadState();
        stateData.versionStates[versionId.toString()] = state;
        this.saveState(stateData);
    }

    getVersionState(versionId: number): VersionState | undefined {
        const state = this.loadState();
        return state.versionStates[versionId.toString()];
    }

    // Clear all state (called at start of test run)
    clear(): void {
        this.saveState({ models: {}, textureSets: {}, versionStates: {} });
    }

    // Debug info
    getDebugInfo(): string {
        const state = this.loadState();
        return JSON.stringify(
            {
                models: Object.keys(state.models),
                textureSets: Object.keys(state.textureSets),
                versionStates: Object.keys(state.versionStates),
            },
            null,
            2
        );
    }
}

// Global singleton instance
export const sharedState = new SharedState();
