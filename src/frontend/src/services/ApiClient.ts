import axios, { AxiosInstance, AxiosResponse } from "axios";
import { Model } from "../utils/fileUtils";

export interface UploadModelResponse {
    id: string;
    name: string;
    files: Array<{
        id: string;
        originalFileName: string;
        sizeBytes: number;
        mimeType: string;
    }>;
}

export interface ThumbnailStatus {
    id: string;
    modelId: string;
    status: 'Pending' | 'InProgress' | 'Completed' | 'Failed';
    thumbnailPath?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
    processedAt?: string;
}

class ApiClient {
    private baseURL: string;
    private client: AxiosInstance;

    constructor() {
        this.baseURL =
            import.meta.env.VITE_API_BASE_URL || "https://localhost:8081";
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    getBaseURL(): string {
        return this.baseURL;
    }

    async uploadModel(file: File): Promise<UploadModelResponse> {
        const formData = new FormData();
        formData.append("file", file);

        const response: AxiosResponse<UploadModelResponse> = await this.client.post("/models", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        return response.data;
    }

    async getModels(): Promise<Model[]> {
        const response: AxiosResponse<Model[]> = await this.client.get("/models");
        return response.data;
    }

    getModelFileUrl(modelId: string): string {
        return `${this.baseURL}/models/${modelId}/file`;
    }

    getFileUrl(fileId: string): string {
        return `${this.baseURL}/files/${fileId}`;
    }

    // Thumbnail methods
    async getThumbnailStatus(modelId: string): Promise<ThumbnailStatus> {
        const response: AxiosResponse<ThumbnailStatus> = await this.client.get(`/models/${modelId}/thumbnail`);
        return response.data;
    }

    getThumbnailUrl(modelId: string): string {
        return `${this.baseURL}/models/${modelId}/thumbnail/file`;
    }

    async regenerateThumbnail(modelId: string): Promise<void> {
        const response: AxiosResponse<void> = await this.client.post(`/models/${modelId}/thumbnail/regenerate`);
        return response.data;
    }
}

export default new ApiClient();
