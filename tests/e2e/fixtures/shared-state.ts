/**
 * Scenario-scoped state for managing test data within a single scenario.
 *
 * Replaces the old file-based SharedState singleton with an in-memory,
 * per-Page store that enables parallel execution across multiple Playwright workers.
 *
 * Migration:
 *   Old: import { sharedState } from "../fixtures/shared-state";
 *        sharedState.getModel("name");
 *
 *   New: import { getScenarioState } from "../fixtures/shared-state";
 *        getScenarioState(page).getModel("name");
 *
 * Each Playwright test receives a unique `page` instance. The WeakMap keyed
 * by Page ensures full isolation between parallel scenarios.
 */

import type { Page } from "@playwright/test";

// ── Data interfaces ──────────────────────────────────────────────────

export interface ModelData {
    id: number;
    name: string;
    versionId?: number;
    versions?: Array<{ id: number; name: string }>;
}

export interface TextureSetData {
    id: number;
    name: string;
    modelId?: number;
    versionId?: number;
}

export interface PackData {
    id: number;
    name: string;
    description?: string;
    licenseType?: string;
    url?: string;
}

export interface ProjectData {
    id: number;
    name: string;
    description?: string;
    notes?: string;
}

export interface SpriteData {
    id: number;
    name: string;
    fileId: number;
    categoryId?: number;
}

export interface SpriteCategoryData {
    id: number;
    name: string;
    description?: string;
}

export interface SoundData {
    id: number;
    name: string;
    fileId: number;
    duration: number;
    categoryId?: number;
}

export interface SoundCategoryData {
    id: number;
    name: string;
    description?: string;
}

export interface VersionState {
    thumbnailDetails: any;
    thumbnailSrc: string | null;
}

// ── Scenario-scoped state class ──────────────────────────────────────

export class ScenarioState {
    // Entity stores
    models = new Map<string, ModelData>();
    textureSets = new Map<string, TextureSetData>();
    packs = new Map<string, PackData>();
    projects = new Map<string, ProjectData>();
    sprites = new Map<string, SpriteData>();
    spriteCategories = new Map<string, SpriteCategoryData>();
    sounds = new Map<string, SoundData>();
    soundCategories = new Map<string, SoundCategoryData>();
    versionStates = new Map<string, VersionState>();
    currentSprite?: string;

    // Upload tracking (replaces module-level uploadTracker in shared-setup.steps.ts)
    uploadTrackerModelName: string | null = null;
    uploadTrackerVersionId: number = 0;

    // Arbitrary per-scenario key-value store for step-local tracking
    // Use for module-level mutable vars like multiVersionModelId, currentSoundName, etc.
    private _custom = new Map<string, any>();

    // ── Custom key-value store ───────────────────────────────────────

    setCustom(key: string, value: any): void {
        this._custom.set(key, value);
    }

    getCustom<T = any>(key: string): T | undefined {
        return this._custom.get(key) as T | undefined;
    }

    // ── Model management ─────────────────────────────────────────────

    saveModel(name: string, data: ModelData): void {
        this.models.set(name, data);
    }

    getModel(name: string): ModelData | undefined {
        return this.models.get(name);
    }

    hasModel(name: string): boolean {
        return this.models.has(name);
    }

    // ── Texture set management ───────────────────────────────────────

    saveTextureSet(name: string, data: TextureSetData): void {
        this.textureSets.set(name, data);
    }

    getTextureSet(name: string): TextureSetData | undefined {
        return this.textureSets.get(name);
    }

    hasTextureSet(name: string): boolean {
        return this.textureSets.has(name);
    }

    // ── Version state management ─────────────────────────────────────

    saveVersionState(versionId: number, vstate: VersionState): void {
        this.versionStates.set(versionId.toString(), vstate);
    }

    getVersionState(versionId: number): VersionState | undefined {
        return this.versionStates.get(versionId.toString());
    }

    // ── Pack management ──────────────────────────────────────────────

    savePack(name: string, data: PackData): void {
        this.packs.set(name, data);
    }

    getPack(name: string): PackData | undefined {
        return this.packs.get(name);
    }

    hasPack(name: string): boolean {
        return this.packs.has(name);
    }

    // ── Project management ───────────────────────────────────────────

    saveProject(name: string, data: ProjectData): void {
        this.projects.set(name, data);
    }

    getProject(name: string): ProjectData | undefined {
        return this.projects.get(name);
    }

    hasProject(name: string): boolean {
        return this.projects.has(name);
    }

    // ── Sprite management ────────────────────────────────────────────

    saveSprite(name: string, data: SpriteData): void {
        this.sprites.set(name, data);
    }

    getSprite(name: string): SpriteData | undefined {
        return this.sprites.get(name);
    }

    hasSprite(name: string): boolean {
        return this.sprites.has(name);
    }

    // ── Sprite category management ───────────────────────────────────

    saveSpriteCategory(name: string, data: SpriteCategoryData): void {
        this.spriteCategories.set(name, data);
    }

    getSpriteCategory(name: string): SpriteCategoryData | undefined {
        return this.spriteCategories.get(name);
    }

    hasSpriteCategory(name: string): boolean {
        return this.spriteCategories.has(name);
    }

    // ── Current sprite context ───────────────────────────────────────

    setCurrentSprite(name: string): void {
        this.currentSprite = name;
    }

    getCurrentSprite(): string | undefined {
        return this.currentSprite;
    }

    // ── Sound management ─────────────────────────────────────────────

    saveSound(name: string, data: SoundData): void {
        this.sounds.set(name, data);
    }

    getSound(name: string): SoundData | undefined {
        return this.sounds.get(name);
    }

    hasSound(name: string): boolean {
        return this.sounds.has(name);
    }

    // ── Sound category management ────────────────────────────────────

    saveSoundCategory(name: string, data: SoundCategoryData): void {
        this.soundCategories.set(name, data);
    }

    getSoundCategory(name: string): SoundCategoryData | undefined {
        return this.soundCategories.get(name);
    }

    hasSoundCategory(name: string): boolean {
        return this.soundCategories.has(name);
    }

    // ── Utilities ────────────────────────────────────────────────────

    clear(): void {
        this.models.clear();
        this.textureSets.clear();
        this.packs.clear();
        this.projects.clear();
        this.sprites.clear();
        this.spriteCategories.clear();
        this.sounds.clear();
        this.soundCategories.clear();
        this.versionStates.clear();
        this._custom.clear();
        this.currentSprite = undefined;
        this.uploadTrackerModelName = null;
        this.uploadTrackerVersionId = 0;
    }

    getDebugInfo(): string {
        return JSON.stringify(
            {
                models: [...this.models.keys()],
                textureSets: [...this.textureSets.keys()],
                packs: [...this.packs.keys()],
                projects: [...this.projects.keys()],
                sprites: [...this.sprites.keys()],
                spriteCategories: [...this.spriteCategories.keys()],
                sounds: [...this.sounds.keys()],
                soundCategories: [...this.soundCategories.keys()],
                versionStates: [...this.versionStates.keys()],
            },
            null,
            2,
        );
    }
}

// ── Per-Page scenario state store ────────────────────────────────────

/**
 * WeakMap keyed by Playwright Page instance ensures:
 * - Each test (which gets a unique Page) has its own state
 * - State is automatically garbage-collected when the Page is GC'd
 * - No cross-test contamination between parallel workers
 */
const scenarioStates = new WeakMap<Page, ScenarioState>();

/**
 * Get or create the scenario-scoped state for a given Page.
 * Call this in each step handler:
 *   const state = getScenarioState(page);
 *   state.getModel("name");
 */
export function getScenarioState(page: Page): ScenarioState {
    let state = scenarioStates.get(page);
    if (!state) {
        state = new ScenarioState();
        scenarioStates.set(page, state);
    }
    return state;
}
