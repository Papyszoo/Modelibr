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

interface PackData {
    id: number;
    name: string;
    description?: string;
}

interface ProjectData {
    id: number;
    name: string;
    description?: string;
}

interface SpriteData {
    id: number;
    name: string;
    fileId: number;
    categoryId?: number;
}

interface SpriteCategoryData {
    id: number;
    name: string;
    description?: string;
}

interface VersionState {
    thumbnailDetails: any;
    thumbnailSrc: string | null;
}

interface StateData {
    models: Record<string, ModelData>;
    textureSets: Record<string, TextureSetData>;
    packs: Record<string, PackData>;
    projects: Record<string, ProjectData>;
    sprites: Record<string, SpriteData>;
    spriteCategories: Record<string, SpriteCategoryData>;
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
        return { models: {}, textureSets: {}, packs: {}, projects: {}, sprites: {}, spriteCategories: {}, versionStates: {} };
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

    // Pack management
    savePack(name: string, data: PackData): void {
        const state = this.loadState();
        if (!state.packs) state.packs = {};
        state.packs[name] = data;
        this.saveState(state);
    }

    getPack(name: string): PackData | undefined {
        const state = this.loadState();
        return state.packs?.[name];
    }

    hasPack(name: string): boolean {
        const state = this.loadState();
        return state.packs ? name in state.packs : false;
    }

    // Project management
    saveProject(name: string, data: ProjectData): void {
        const state = this.loadState();
        if (!state.projects) state.projects = {};
        state.projects[name] = data;
        this.saveState(state);
    }

    getProject(name: string): ProjectData | undefined {
        const state = this.loadState();
        return state.projects?.[name];
    }

    hasProject(name: string): boolean {
        const state = this.loadState();
        return state.projects ? name in state.projects : false;
    }

    // Sprite management
    saveSprite(name: string, data: SpriteData): void {
        const state = this.loadState();
        if (!state.sprites) state.sprites = {};
        state.sprites[name] = data;
        this.saveState(state);
    }

    getSprite(name: string): SpriteData | undefined {
        const state = this.loadState();
        return state.sprites?.[name];
    }

    hasSprite(name: string): boolean {
        const state = this.loadState();
        return state.sprites ? name in state.sprites : false;
    }

    // Sprite category management
    saveSpriteCategory(name: string, data: SpriteCategoryData): void {
        const state = this.loadState();
        if (!state.spriteCategories) state.spriteCategories = {};
        state.spriteCategories[name] = data;
        this.saveState(state);
    }

    getSpriteCategory(name: string): SpriteCategoryData | undefined {
        const state = this.loadState();
        return state.spriteCategories?.[name];
    }

    hasSpriteCategory(name: string): boolean {
        const state = this.loadState();
        return state.spriteCategories ? name in state.spriteCategories : false;
    }

    // Clear all state (called at start of test run)
    clear(): void {
        this.saveState({ models: {}, textureSets: {}, packs: {}, projects: {}, sprites: {}, spriteCategories: {}, versionStates: {} });
    }

    // Debug info
    getDebugInfo(): string {
        const state = this.loadState();
        return JSON.stringify(
            {
                models: Object.keys(state.models),
                textureSets: Object.keys(state.textureSets),
                packs: Object.keys(state.packs || {}),
                projects: Object.keys(state.projects || {}),
                sprites: Object.keys(state.sprites || {}),
                spriteCategories: Object.keys(state.spriteCategories || {}),
                versionStates: Object.keys(state.versionStates),
            },
            null,
            2
        );
    }
}

// Global singleton instance
export const sharedState = new SharedState();
