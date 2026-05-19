import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "fs";

export interface BackupSummary {
    fileName: string;
    sizeBytes: number;
    createdAtUtc: string;
    status: "in_progress" | "ready" | "failed";
    hostPath: string;
    containerPath: string;
    includesThumbnails: boolean;
    error: string | null;
}

export class BackupApi {
    public readonly baseURL: string;
    private client: AxiosInstance;

    constructor(baseURL: string = process.env.API_BASE_URL || "http://localhost:8190") {
        this.baseURL = baseURL;
        this.client = axios.create({
            baseURL,
            timeout: 120000,
            validateStatus: () => true,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });
    }

    async health(): Promise<number> {
        const r = await this.client.get("/health");
        return r.status;
    }

    // ── Backups ─────────────────────────────────────────────────────────

    async listBackups(): Promise<BackupSummary[]> {
        const r = await this.client.get("/backups");
        if (r.status !== 200) throw new Error(`list /backups → ${r.status}`);
        return r.data.backups;
    }

    async createBackup(includeThumbnails: boolean): Promise<{ status: number; data: BackupSummary }> {
        const r = await this.client.post("/backups", { includeThumbnails });
        return { status: r.status, data: r.data };
    }

    async deleteBackup(fileName: string): Promise<number> {
        const r = await this.client.delete(`/backups/${encodeURIComponent(fileName)}`);
        return r.status;
    }

    async downloadBackup(fileName: string): Promise<{ status: number; bytes: Buffer; contentType?: string }> {
        const r = await this.client.get(`/backups/${encodeURIComponent(fileName)}`, {
            responseType: "arraybuffer",
        });
        const ct = r.headers["content-type"];
        return {
            status: r.status,
            bytes: Buffer.from(r.data),
            contentType: typeof ct === "string" ? ct : undefined,
        };
    }

    async stageRestore(fileName: string): Promise<{ status: number; data: any }> {
        const r = await this.client.post(`/backups/${encodeURIComponent(fileName)}/restore`);
        return { status: r.status, data: r.data };
    }

    async storageInfo(): Promise<{ hostPath: string; containerPath: string; totalUsedBytes: number }> {
        const r = await this.client.get("/backups/storage");
        if (r.status !== 200) throw new Error(`storage → ${r.status}`);
        return r.data;
    }

    async waitForBackupReady(fileName: string, timeoutMs: number = 120000): Promise<BackupSummary> {
        const deadline = Date.now() + timeoutMs;
        let lastSummary: BackupSummary | undefined;
        while (Date.now() < deadline) {
            const list = await this.listBackups();
            const match = list.find((b) => b.fileName === fileName);
            if (match) {
                lastSummary = match;
                if (match.status === "ready") return match;
                if (match.status === "failed") {
                    throw new Error(`Backup ${fileName} failed: ${match.error}`);
                }
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        throw new Error(
            `Backup ${fileName} did not become ready within ${timeoutMs}ms. Last status: ${lastSummary?.status ?? "missing"}`,
        );
    }

    // ── Models ──────────────────────────────────────────────────────────

    async uploadModel(filePath: string): Promise<{ status: number; data: any }> {
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));
        const r = await this.client.post("/models", formData, {
            headers: formData.getHeaders(),
        });
        return { status: r.status, data: r.data };
    }

    async createModelVersion(modelId: number, filePath: string): Promise<{ status: number; data: any }> {
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));
        const r = await this.client.post(`/models/${modelId}/versions?setAsActive=true`, formData, {
            headers: formData.getHeaders(),
        });
        return { status: r.status, data: r.data };
    }

    async listModels(): Promise<any[]> {
        const r = await this.client.get("/models");
        if (r.status !== 200) throw new Error(`list /models → ${r.status}`);
        return Array.isArray(r.data) ? r.data : r.data?.models ?? [];
    }

    async getModelVersions(modelId: number): Promise<any[]> {
        const r = await this.client.get(`/models/${modelId}/versions`);
        if (r.status !== 200) throw new Error(`get versions → ${r.status}`);
        return r.data?.value || r.data || [];
    }

    async softDeleteModel(modelId: number): Promise<number> {
        const r = await this.client.delete(`/models/${modelId}`);
        return r.status;
    }

    // ── Texture sets ────────────────────────────────────────────────────

    async createTextureSetWithFile(
        name: string,
        filePath: string,
        textureType: number = 1,
    ): Promise<{ status: number; data: any }> {
        const formData = new FormData();
        formData.append("file", fs.createReadStream(filePath));
        const r = await this.client.post(
            `/texture-sets/with-file?name=${encodeURIComponent(name)}&textureType=${textureType}`,
            formData,
            { headers: formData.getHeaders() },
        );
        return { status: r.status, data: r.data };
    }

    async listTextureSets(): Promise<any[]> {
        const r = await this.client.get("/texture-sets");
        if (r.status !== 200) throw new Error(`list /texture-sets → ${r.status}`);
        return r.data?.textureSets || [];
    }

    async getTextureSet(id: number): Promise<any> {
        const r = await this.client.get(`/texture-sets/${id}`);
        if (r.status !== 200) throw new Error(`get texture set ${id} → ${r.status}`);
        return r.data;
    }

    // ── Packs ───────────────────────────────────────────────────────────

    async createPack(name: string, description: string = ""): Promise<{ status: number; data: any }> {
        const r = await this.client.post("/packs", { name, description });
        return { status: r.status, data: r.data };
    }

    async addModelToPack(packId: number, modelId: number): Promise<number> {
        const r = await this.client.post(`/packs/${packId}/models/${modelId}`);
        return r.status;
    }

    async listPacks(): Promise<any[]> {
        const r = await this.client.get("/packs");
        if (r.status !== 200) throw new Error(`list /packs → ${r.status}`);
        return Array.isArray(r.data) ? r.data : r.data?.packs ?? [];
    }

    async getPack(id: number): Promise<any> {
        const r = await this.client.get(`/packs/${id}`);
        if (r.status !== 200) throw new Error(`get pack ${id} → ${r.status}`);
        return r.data;
    }

    // ── Projects ────────────────────────────────────────────────────────

    async createProject(name: string, description: string = ""): Promise<{ status: number; data: any }> {
        const r = await this.client.post("/projects", { name, description });
        return { status: r.status, data: r.data };
    }

    async addModelToProject(projectId: number, modelId: number): Promise<number> {
        const r = await this.client.post(`/projects/${projectId}/models/${modelId}`);
        return r.status;
    }

    async listProjects(): Promise<any[]> {
        const r = await this.client.get("/projects");
        if (r.status !== 200) throw new Error(`list /projects → ${r.status}`);
        return Array.isArray(r.data) ? r.data : r.data?.projects ?? [];
    }

    async getProject(id: number): Promise<any> {
        const r = await this.client.get(`/projects/${id}`);
        if (r.status !== 200) throw new Error(`get project ${id} → ${r.status}`);
        return r.data;
    }

    // ── Recycled ────────────────────────────────────────────────────────

    /**
     * Returns a flattened recycle-bin listing as `{entityType, entityId, name?}`.
     * The /recycled endpoint groups by category (Models, ModelVersions, Files,
     * TextureSets, Textures, Sprites, Sounds, EnvironmentMaps, EnvironmentMapVariants);
     * we collapse those into one list so callers don't need to know the schema.
     */
    async listRecycled(): Promise<Array<{ entityType: string; entityId: number; name?: string }>> {
        const r = await this.client.get("/recycled");
        if (r.status !== 200) throw new Error(`list /recycled → ${r.status}`);
        const data = r.data ?? {};

        const out: Array<{ entityType: string; entityId: number; name?: string }> = [];
        const push = (entityType: string, arr: any[] | undefined, idKey: string = "id", nameKey?: string) => {
            for (const item of arr ?? []) {
                const id = item?.[idKey];
                if (typeof id !== "number") continue;
                out.push({ entityType, entityId: id, name: nameKey ? item?.[nameKey] : item?.name });
            }
        };

        // Field names mirror GetAllRecycledQueryResponse on the server (camelCased by JSON).
        push("Model", data.models, "id", "name");
        push("ModelVersion", data.modelVersions, "id");
        push("File", data.files, "id", "originalFileName");
        push("TextureSet", data.textureSets, "id", "name");
        push("Texture", data.textures, "id");
        push("Sprite", data.sprites, "id", "name");
        push("Sound", data.sounds, "id", "name");
        push("EnvironmentMap", data.environmentMaps, "id", "name");
        push("EnvironmentMapVariant", data.environmentMapVariants, "id");
        return out;
    }

    // ── Settings ────────────────────────────────────────────────────────

    async setSetting(key: string, value: string): Promise<number> {
        const r = await this.client.put(`/settings/${encodeURIComponent(key)}`, { value });
        return r.status;
    }
}
