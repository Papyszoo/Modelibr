/**
 * Shared state fixture for managing test data across scenarios within a single test run.
 * This enables dependent scenarios while maintaining isolation between full test runs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '..', 'data', 'shared-state.json');

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

class SharedState {
    private models: Map<string, ModelData> = new Map();
    private textureSets: Map<string, TextureSetData> = new Map();
    private versionStates: Map<number, VersionState> = new Map();

    constructor() {
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
                this.models = new Map(data.models);
                this.textureSets = new Map(data.textureSets);
                // VersionState keys are numbers, JSON keys are strings
                this.versionStates = new Map();
                if (data.versionStates) {
                    for (const [k, v] of data.versionStates) {
                        this.versionStates.set(Number(k), v as VersionState);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load shared state:', e);
        }
    }

    private save() {
        try {
            const data = {
                models: Array.from(this.models.entries()),
                textureSets: Array.from(this.textureSets.entries()),
                versionStates: Array.from(this.versionStates.entries())
            };
            // Ensure dir exists
            const dir = path.dirname(STATE_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save shared state:', e);
        }
    }

    // Model management
    saveModel(name: string, data: ModelData): void {
        this.load();
        this.models.set(name, data);
        this.save();
    }

    getModel(name: string): ModelData | undefined {
        this.load();
        return this.models.get(name);
    }

    hasModel(name: string): boolean {
        this.load();
        return this.models.has(name);
    }

    // Texture set management
    saveTextureSet(name: string, data: TextureSetData): void {
        this.load();
        this.textureSets.set(name, data);
        this.save();
    }

    getTextureSet(name: string): TextureSetData | undefined {
        this.load();
        return this.textureSets.get(name);
    }

    hasTextureSet(name: string): boolean {
        this.load();
        return this.textureSets.has(name);
    }

    // Version state management (for independence validation)
    saveVersionState(versionId: number, state: VersionState): void {
        this.load();
        this.versionStates.set(versionId, state);
        this.save();
    }

    getVersionState(versionId: number): VersionState | undefined {
        this.load();
        return this.versionStates.get(versionId);
    }

    hasVersionState(versionId: number): boolean {
        this.load();
        return this.versionStates.has(versionId);
    }

    // Clear all state (called between test runs, not between scenarios)
    clear(): void {
        this.models.clear();
        this.textureSets.clear();
        this.versionStates.clear();
        if (fs.existsSync(STATE_FILE)) {
            try {
                fs.unlinkSync(STATE_FILE);
            } catch (e) {
                // ignore
            }
        }
    }

    // Debug helper
    getDebugInfo(): string {
        this.load();
        return JSON.stringify(
            {
                models: Array.from(this.models.keys()),
                textureSets: Array.from(this.textureSets.keys()),
                versionStates: Array.from(this.versionStates.keys()),
            },
            null,
            2
        );
    }
}

// Global singleton instance - persists across scenarios within the same test run
export const sharedState = new SharedState();
