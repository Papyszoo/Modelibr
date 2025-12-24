/**
 * Test data builder for programmatically creating test entities via API.
 * Bypasses UI interaction for faster, more reliable test setup.
 */

import { ApiHelper } from "../support/api-helper";
import { DbHelper } from "../support/db-helper";
import { sharedState } from "./shared-state";

export class TestDataBuilder {
    constructor(private apiHelper: ApiHelper, private dbHelper: DbHelper) {}

    /**
     * Creates a model with optional additional versions and stores in shared state.
     * @param primaryModelPath - Path to primary model file (e.g., "test-cube.glb")
     * @param additionalVersionPaths - Optional array of version file paths
     * @param stateName - Name to store in shared state (defaults to primary model name)
     */
    async createModelWithVersions(
        primaryModelPath: string,
        additionalVersionPaths: string[] = [],
        stateName?: string
    ): Promise<{
        modelId: number;
        versions: Array<{ id: number; name: string }>;
    }> {
        // Upload primary model
        const modelResponse = await this.apiHelper.uploadModel(
            primaryModelPath
        );
        const modelId = modelResponse.id;

        // Get initial version
        const versions = await this.apiHelper.getModelVersions(modelId);
        const versionList = [{ id: versions[0].id, name: primaryModelPath }];

        // Upload additional versions if provided
        for (const versionPath of additionalVersionPaths) {
            await this.apiHelper.uploadVersion(modelId, versionPath);
            const updatedVersions = await this.apiHelper.getModelVersions(
                modelId
            );
            const newVersion = updatedVersions[updatedVersions.length - 1];
            versionList.push({ id: newVersion.id, name: versionPath });
        }

        // Store in shared state
        const name = stateName || primaryModelPath;
        sharedState.saveModel(name, {
            id: modelId,
            name,
            versions: versionList,
        });

        return { modelId, versions: versionList };
    }

    /**
     * Creates a texture set via API and stores in shared state.
     * @param name - Unique texture set name
     * @param modelId - Optional model ID to associate with
     * @param versionId - Optional version ID to associate with
     */
    async createTextureSet(
        name: string,
        modelId?: number,
        versionId?: number
    ): Promise<{ id: number; name: string }> {
        const textureSet = await this.apiHelper.createTextureSet(name);

        sharedState.saveTextureSet(name, {
            id: textureSet.id,
            name,
            modelId,
            versionId,
        });

        return textureSet;
    }

    /**
     * Creates a complete texture set with texture file uploaded.
     * @param textureSetName - Unique texture set name
     * @param texturePath - Path to texture file (e.g., "blue_color.png")
     */
    async createTextureSetWithTexture(
        textureSetName: string,
        texturePath: string
    ): Promise<{ textureSetId: number; textureId: number }> {
        const textureSet = await this.createTextureSet(textureSetName);
        const texture = await this.apiHelper.uploadTexture(
            textureSet.id,
            texturePath
        );

        return { textureSetId: textureSet.id, textureId: texture.id };
    }

    /**
     * Links a texture set to a model version.
     */
    async linkTextureSetToVersion(
        textureSetId: number,
        versionId: number
    ): Promise<void> {
        await this.apiHelper.linkTextureSetToVersion(textureSetId, versionId);
    }

    /**
     * Sets a texture set as default for a version.
     */
    async setDefaultTextureSet(
        versionId: number,
        textureSetId: number
    ): Promise<void> {
        await this.apiHelper.setDefaultTextureSet(versionId, textureSetId);
    }

    /**
     * Captures and stores the current state of a version's thumbnail in shared state.
     * Used for validating that state remains unchanged after other operations.
     */
    async captureVersionState(versionId: number): Promise<void> {
        const thumbnailDetails = await this.dbHelper.getThumbnailDetails(
            versionId
        );

        sharedState.saveVersionState(versionId, {
            thumbnailDetails,
            thumbnailSrc: null, // Will be set from UI if needed
        });
    }

    /**
     * Updates the UI thumbnail src for a captured version state.
     */
    updateVersionStateThumbnailSrc(
        versionId: number,
        thumbnailSrc: string | null
    ): void {
        const existingState = sharedState.getVersionState(versionId);
        if (existingState) {
            sharedState.saveVersionState(versionId, {
                ...existingState,
                thumbnailSrc,
            });
        }
    }
}
