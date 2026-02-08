import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "fs";

/**
 * API Helper for E2E tests
 * Provides direct API access for test setup/teardown operations
 */
export class ApiHelper {
    private client: AxiosInstance;

    constructor(
        baseURL: string = process.env.API_BASE_URL || "http://localhost:8090",
    ) {
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
        name: string,
    ): Promise<{ id: number; name: string }> {
        const response = await this.client.post("/texture-sets", { name });
        if (response.status !== 200 && response.status !== 201) {
            console.error(
                "Create texture set failed:",
                response.status,
                response.statusText,
                response.data,
            );
            throw new Error(
                `Failed to create texture set: ${response.status} ${response.statusText}`,
            );
        }
        return response.data;
    }

    /**
     * Create a texture set with a file in one operation
     * Uses /texture-sets/with-file endpoint
     */
    async createTextureSetWithFile(
        name: string,
        filePath: string,
        textureType: number = 1, // 1 = Albedo
    ): Promise<{ textureSetId: number; name: string; fileId: number }> {
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));

        const response = await this.client.post(
            `/texture-sets/with-file?name=${encodeURIComponent(name)}&textureType=${textureType}`,
            formData,
            {
                headers: formData.getHeaders(),
            },
        );

        if (response.status !== 200 && response.status !== 201) {
            console.error(
                "Create texture set with file failed:",
                response.status,
                response.statusText,
                response.data,
            );
            throw new Error(
                `Failed to create texture set with file: ${response.status} ${response.statusText}`,
            );
        }
        return response.data;
    }

    /**
     * Map texture type names to their numeric values
     */
    private mapTextureType(textureType: string | number): number {
        if (typeof textureType === "number") {
            return textureType;
        }
        const mapping: Record<string, number> = {
            Albedo: 1,
            Normal: 2,
            Height: 3,
            AO: 4,
            Roughness: 5,
            Metallic: 6,
            Emissive: 9,
            Bump: 10,
            Alpha: 11,
            Displacement: 12,
        };
        return mapping[textureType] ?? 1; // Default to Albedo
    }

    /**
     * Upload a texture file to a texture set
     * Two-step process: 1) Upload file via /files endpoint, 2) Add texture to set
     */
    async uploadTextureToSet(
        textureSetId: number,
        filePath: string,
        textureType: string | number = 1, // 1 = Albedo, or string name like 'Albedo'
    ): Promise<void> {
        const textureTypeNum = this.mapTextureType(textureType);

        // Step 1: Upload the file with textureSetId parameter
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));

        const uploadResponse = await this.client.post(
            `/files?textureSetId=${textureSetId}`,
            formData,
            {
                headers: formData.getHeaders(),
            },
        );

        if (uploadResponse.status !== 200) {
            console.error(
                "File upload failed:",
                uploadResponse.status,
                uploadResponse.statusText,
                uploadResponse.data,
            );
            throw new Error(
                `Failed to upload file: ${uploadResponse.status} ${uploadResponse.statusText}`,
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
                TextureType: textureTypeNum,
            },
        );

        if (addTextureResponse.status !== 200) {
            console.error(
                "Add texture to set failed:",
                addTextureResponse.status,
                addTextureResponse.statusText,
                addTextureResponse.data,
            );
            throw new Error(
                `Failed to add texture to set: ${addTextureResponse.status} ${addTextureResponse.statusText}`,
            );
        }
    }

    /**
     * Associate a texture set with a model version
     */
    async linkTextureSetToModel(
        textureSetId: number,
        modelId: number,
        modelVersionId: number,
    ): Promise<void> {
        const response = await this.client.post(
            `/texture-sets/${textureSetId}/model-versions/${modelVersionId}`,
        );

        // Accept 200, 201, 204 as success, and 400 with AssociationAlreadyExists as "already done"
        if (
            response.status !== 200 &&
            response.status !== 201 &&
            response.status !== 204
        ) {
            // Check if it's "already associated" error - treat as success
            if (
                response.status === 400 &&
                response.data?.error === "AssociationAlreadyExists"
            ) {
                // Silently succeed - texture set is already linked
                return;
            }
            console.error(
                "Link texture set failed:",
                response.status,
                response.statusText,
                response.data,
            );
            throw new Error(
                `Failed to link texture set: ${response.status} ${response.statusText}`,
            );
        }
    }

    /**
     * Set default texture set for a model version
     */
    async setDefaultTextureSet(
        modelId: number,
        modelVersionId: number,
        textureSetId: number | null,
    ): Promise<void> {
        const response = await this.client.put(
            `/models/${modelId}/default-texture-set`,
            {
                TextureSetId: textureSetId,
                ModelVersionId: modelVersionId,
            },
        );

        if (response.status !== 200) {
            console.error(
                "Set default texture set failed:",
                response.status,
                response.statusText,
                response.data,
            );
            throw new Error(
                `Failed to set default texture set: ${response.status} ${response.statusText}`,
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
                (m) => m.name === modelName || m.name === nameWithoutExt,
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

    /**
     * Upload a model file and return the created model data
     */
    async uploadModel(
        filePath: string,
    ): Promise<{ id: number; name: string; versionId?: number }> {
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));

        const response = await this.client.post("/models", formData, {
            headers: formData.getHeaders(),
        });

        if (response.status !== 200 && response.status !== 201) {
            throw new Error(
                `Failed to upload model: ${response.status} ${response.statusText}`,
            );
        }
        return response.data;
    }

    /**
     * Create a pack
     */
    async createPack(
        name: string,
        description?: string,
    ): Promise<{ id: number; name: string }> {
        const response = await this.client.post("/packs", {
            name,
            description: description || "",
        });
        if (response.status !== 200 && response.status !== 201) {
            throw new Error(
                `Failed to create pack: ${response.status} ${response.statusText}`,
            );
        }
        return response.data;
    }

    /**
     * Create a project
     */
    async createProject(
        name: string,
        description?: string,
    ): Promise<{ id: number; name: string }> {
        const response = await this.client.post("/projects", {
            name,
            description: description || "",
        });
        if (response.status !== 200 && response.status !== 201) {
            throw new Error(
                `Failed to create project: ${response.status} ${response.statusText}`,
            );
        }
        return response.data;
    }

    /**
     * Delete a sound by ID
     */
    async deleteSound(soundId: number): Promise<void> {
        const response = await this.client.delete(`/sounds/${soundId}`);
        if (response.status !== 200 && response.status !== 204) {
            throw new Error(
                `Failed to delete sound: ${response.status} ${response.statusText}`,
            );
        }
    }

    /**
     * Get all sprites
     */
    async getAllSprites(): Promise<any[]> {
        const response = await this.client.get("/sprites");
        if (response.status !== 200) {
            throw new Error(`Failed to get sprites: ${response.status}`);
        }
        return response.data.sprites || [];
    }

    /**
     * Get all sounds
     */
    async getAllSounds(): Promise<any[]> {
        const response = await this.client.get("/sounds");
        if (response.status !== 200) {
            throw new Error(`Failed to get sounds: ${response.status}`);
        }
        return response.data.sounds || [];
    }
}
