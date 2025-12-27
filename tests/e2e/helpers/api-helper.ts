import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "fs";

/**
 * API Helper for E2E tests
 * Provides direct API access for test setup/teardown operations
 */
export class ApiHelper {
    private client: AxiosInstance;

    constructor(baseURL: string = "http://localhost:8090") {
        this.client = axios.create({
            baseURL,
            timeout: 30000,
            validateStatus: () => true, // Don't throw on any status
        });
    }

    /**
     * Create a texture set
     */
    async createTextureSet(
        name: string
    ): Promise<{ id: number; name: string }> {
        const response = await this.client.post("/texture-sets", { name });
        if (response.status !== 200 && response.status !== 201) {
            console.error(
                "Create texture set failed:",
                response.status,
                response.statusText,
                response.data
            );
            throw new Error(
                `Failed to create texture set: ${response.status} ${response.statusText}`
            );
        }
        return response.data;
    }

    /**
     * Upload a texture file to a texture set
     * Two-step process: 1) Upload file via /files endpoint, 2) Add texture to set
     */
    async uploadTextureToSet(
        textureSetId: number,
        filePath: string,
        textureType: number = 1 // 1 = Albedo
    ): Promise<void> {
        // Step 1: Upload the file with textureSetId parameter
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));

        const uploadResponse = await this.client.post(
            `/files?textureSetId=${textureSetId}`,
            formData,
            {
                headers: formData.getHeaders(),
            }
        );

        if (uploadResponse.status !== 200) {
            console.error(
                "File upload failed:",
                uploadResponse.status,
                uploadResponse.statusText,
                uploadResponse.data
            );
            throw new Error(
                `Failed to upload file: ${uploadResponse.status} ${uploadResponse.statusText}`
            );
        }

        const fileId = uploadResponse.data.id || uploadResponse.data.fileId;
        if (!fileId) {
            throw new Error("File upload succeeded but no file ID returned");
        }

        // Step 2: Add the texture to the set with the specified type
        const addTextureResponse = await this.client.post(
            `/texture-sets/${textureSetId}/textures`,
            {
                FileId: fileId,
                TextureType: textureType,
            }
        );

        if (addTextureResponse.status !== 200) {
            console.error(
                "Add texture to set failed:",
                addTextureResponse.status,
                addTextureResponse.statusText,
                addTextureResponse.data
            );
            throw new Error(
                `Failed to add texture to set: ${addTextureResponse.status} ${addTextureResponse.statusText}`
            );
        }
    }

    /**
     * Associate a texture set with a model version
     */
    async linkTextureSetToModel(
        textureSetId: number,
        modelId: number,
        modelVersionId: number
    ): Promise<void> {
        const response = await this.client.post(
            `/texture-sets/${textureSetId}/model-versions/${modelVersionId}`
        );

        // Accept 200, 201, 204 as success, and 400 with AssociationAlreadyExists as "already done"
        if (
            response.status !== 200 &&
            response.status !== 201 &&
            response.status !== 204
        ) {
            // Check if it's "already associated" error - treat as success
            if (response.status === 400 && response.data?.error === 'AssociationAlreadyExists') {
                // Silently succeed - texture set is already linked
                return;
            }
            console.error(
                "Link texture set failed:",
                response.status,
                response.statusText,
                response.data
            );
            throw new Error(
                `Failed to link texture set: ${response.status} ${response.statusText}`
            );
        }
    }

    /**
     * Set default texture set for a model version
     */
    async setDefaultTextureSet(
        modelId: number,
        modelVersionId: number,
        textureSetId: number | null
    ): Promise<void> {
        const params = new URLSearchParams();
        if (textureSetId !== null) {
            params.append("textureSetId", textureSetId.toString());
        }
        params.append("modelVersionId", modelVersionId.toString());

        const response = await this.client.put(
            `/models/${modelId}/defaultTextureSet?${params.toString()}`
        );

        if (response.status !== 200) {
            console.error(
                "Set default texture set failed:",
                response.status,
                response.statusText,
                response.data
            );
            throw new Error(
                `Failed to set default texture set: ${response.status} ${response.statusText}`
            );
        }
    }

    /**
     * Get all models
     */
    async getModels(): Promise<any[]> {
        const response = await this.client.get("/models");
        if (response.status !== 200) {
            throw new Error(`Failed to get models: ${response.status}`);
        }
        return response.data;
    }

    /**
     * Get a specific model by ID
     */
    async getModel(modelId: number): Promise<any> {
        const response = await this.client.get(`/models/${modelId}`);
        if (response.status !== 200) {
            throw new Error(`Failed to get model: ${response.status}`);
        }
        return response.data;
    }

    /**
     * Get all versions for a model
     */
    async getModelVersions(modelId: number): Promise<any[]> {
        const response = await this.client.get(`/models/${modelId}/versions`);
        if (response.status !== 200) {
            throw new Error(`Failed to get model versions: ${response.status}`);
        }
        // Response has a 'value' array
        return response.data.value || response.data || [];
    }

    /**
     * Find a model by name (searches in the list)
     */
    async findModelByName(modelName: string): Promise<any | null> {
        const models = await this.getModels();
        const nameWithoutExt = modelName.split(".").slice(0, -1).join(".");
        return (
            models.find(
                (m) => m.name === modelName || m.name === nameWithoutExt
            ) || null
        );
    }

    /**
     * Get all texture sets
     */
    async getAllTextureSets(): Promise<any[]> {
        const response = await this.client.get("/texture-sets");
        if (response.status !== 200) {
            throw new Error(`Failed to get texture sets: ${response.status}`);
        }
        return response.data.textureSets || [];
    }

    /**
     * Get a texture set by name
     */
    async getTextureSetByName(name: string): Promise<any> {
        const sets = await this.getAllTextureSets();
        const found = sets.find((s) => s.name === name);
        if (!found) {
            throw new Error(`Texture set "${name}" not found`);
        }
        return found;
    }
}
