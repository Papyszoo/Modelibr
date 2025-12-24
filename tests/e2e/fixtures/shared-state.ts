/**
 * Shared state fixture for managing test data across scenarios within a single test run.
 * This enables dependent scenarios while maintaining isolation between full test runs.
 */

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

    // Model management
    saveModel(name: string, data: ModelData): void {
        this.models.set(name, data);
    }

    getModel(name: string): ModelData | undefined {
        return this.models.get(name);
    }

    hasModel(name: string): boolean {
        return this.models.has(name);
    }

    // Texture set management
    saveTextureSet(name: string, data: TextureSetData): void {
        this.textureSets.set(name, data);
    }

    getTextureSet(name: string): TextureSetData | undefined {
        return this.textureSets.get(name);
    }

    hasTextureSet(name: string): boolean {
        return this.textureSets.has(name);
    }

    // Version state management (for independence validation)
    saveVersionState(versionId: number, state: VersionState): void {
        this.versionStates.set(versionId, state);
    }

    getVersionState(versionId: number): VersionState | undefined {
        return this.versionStates.get(versionId);
    }

    hasVersionState(versionId: number): boolean {
        return this.versionStates.has(versionId);
    }

    // Clear all state (called between test runs, not between scenarios)
    clear(): void {
        this.models.clear();
        this.textureSets.clear();
        this.versionStates.clear();
    }

    // Debug helper
    getDebugInfo(): string {
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
