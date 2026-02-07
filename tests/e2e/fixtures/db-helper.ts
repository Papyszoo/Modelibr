import pg from "pg";

export class DbHelper {
    private pool: pg.Pool | null = null;

    private getPool(): pg.Pool {
        // Lazily create pool, and recreate if needed
        if (!this.pool) {
            this.pool = new pg.Pool({
                user: process.env.POSTGRES_USER || "modelibr",
                host: process.env.POSTGRES_HOST || "localhost",
                database: process.env.POSTGRES_DB || "Modelibr",
                password: process.env.POSTGRES_PASSWORD || "e2e_password",
                port: parseInt(process.env.POSTGRES_PORT || "5433"),
                // Keep connections alive and limit pool size
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });
        }
        return this.pool;
    }

    async query(text: string, params?: any[]) {
        return this.getPool().query(text, params);
    }

    async getThumbnailDetails(modelVersionId: number) {
        const res = await this.query(
            'SELECT * FROM "Thumbnails" WHERE "ModelVersionId" = $1',
            [modelVersionId],
        );
        return res.rows[0];
    }

    async getModelVersion(versionId: number) {
        const res = await this.query(
            'SELECT * FROM "ModelVersions" WHERE "Id" = $1',
            [versionId],
        );
        return res.rows[0];
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }

    /**
     * Get the default texture set ID for a model version
     */
    async getDefaultTextureSetForVersion(
        modelVersionId: number,
    ): Promise<number | null> {
        const res = await this.query(
            'SELECT "DefaultTextureSetId" FROM "ModelVersions" WHERE "Id" = $1',
            [modelVersionId],
        );
        return res.rows[0]?.DefaultTextureSetId || null;
    }

    /**
     * Verify a model exists and is NOT soft-deleted
     */
    async assertModelExists(modelId: number): Promise<void> {
        const res = await this.query(
            'SELECT "Id", "Name", "DeletedAt" FROM "Models" WHERE "Id" = $1',
            [modelId],
        );
        if (res.rows.length === 0) {
            throw new Error(`Model ${modelId} not found in database`);
        }
        if (res.rows[0].DeletedAt !== null) {
            throw new Error(
                `Model ${modelId} exists but is soft-deleted (DeletedAt: ${res.rows[0].DeletedAt})`,
            );
        }
    }

    /**
     * Verify a model is soft-deleted (DeletedAt is populated)
     */
    async assertModelSoftDeleted(modelId: number): Promise<void> {
        const res = await this.query(
            'SELECT "Id", "Name", "DeletedAt" FROM "Models" WHERE "Id" = $1',
            [modelId],
        );
        if (res.rows.length === 0) {
            throw new Error(`Model ${modelId} not found in database`);
        }
        if (res.rows[0].DeletedAt === null) {
            throw new Error(`Model ${modelId} exists but is NOT soft-deleted`);
        }
    }

    /**
     * Verify a model has been permanently deleted (row does not exist at all)
     */
    async assertModelPermanentlyDeleted(modelId: number): Promise<void> {
        const res = await this.query(
            'SELECT "Id" FROM "Models" WHERE "Id" = $1',
            [modelId],
        );
        if (res.rows.length > 0) {
            throw new Error(
                `Model ${modelId} still exists in database (should be permanently deleted)`,
            );
        }
    }

    /**
     * Get the version count for a model
     */
    async getModelVersionCount(modelId: number): Promise<number> {
        const res = await this.query(
            'SELECT COUNT(*) as count FROM "ModelVersions" WHERE "ModelId" = $1 AND "DeletedAt" IS NULL',
            [modelId],
        );
        return parseInt(res.rows[0].count, 10);
    }

    /**
     * Verify a texture set exists in the database
     */
    async assertTextureSetExists(textureSetId: number): Promise<void> {
        const res = await this.query(
            'SELECT "Id", "Name", "DeletedAt" FROM "TextureSets" WHERE "Id" = $1',
            [textureSetId],
        );
        if (res.rows.length === 0) {
            throw new Error(`TextureSet ${textureSetId} not found in database`);
        }
        if (res.rows[0].DeletedAt !== null) {
            throw new Error(
                `TextureSet ${textureSetId} exists but is soft-deleted`,
            );
        }
    }

    /**
     * Verify a sprite exists in the database
     */
    async assertSpriteExists(spriteId: number): Promise<void> {
        const res = await this.query(
            'SELECT "Id", "Name" FROM "Sprites" WHERE "Id" = $1 AND "DeletedAt" IS NULL',
            [spriteId],
        );
        if (res.rows.length === 0) {
            throw new Error(
                `Sprite ${spriteId} not found in database (or is soft-deleted)`,
            );
        }
    }

    /**
     * Verify a sound exists in the database
     */
    async assertSoundExists(soundId: number): Promise<void> {
        const res = await this.query(
            'SELECT "Id", "Name" FROM "Sounds" WHERE "Id" = $1',
            [soundId],
        );
        if (res.rows.length === 0) {
            throw new Error(`Sound ${soundId} not found in database`);
        }
    }

    /**
     * Verify a sound has been deleted from the database
     */
    async assertSoundDeleted(soundId: number): Promise<void> {
        const res = await this.query(
            'SELECT "Id" FROM "Sounds" WHERE "Id" = $1',
            [soundId],
        );
        if (res.rows.length > 0) {
            throw new Error(
                `Sound ${soundId} still exists in database (should be deleted)`,
            );
        }
    }

    /**
     * Get a model by name (non-deleted)
     */
    async getModelByName(
        name: string,
    ): Promise<{ Id: number; Name: string } | null> {
        const res = await this.query(
            'SELECT "Id", "Name" FROM "Models" WHERE "Name" = $1 AND "DeletedAt" IS NULL ORDER BY "CreatedAt" DESC LIMIT 1',
            [name],
        );
        return res.rows[0] || null;
    }

    /**
     * Get model with version info by ID
     */
    async getModelWithVersions(modelId: number): Promise<any> {
        const res = await this.query(
            `SELECT m."Id" as "ModelId", m."Name", mv."Id" as "VersionId", mv."CreatedAt"
             FROM "Models" m
             JOIN "ModelVersions" mv ON mv."ModelId" = m."Id"
             WHERE m."Id" = $1 AND m."DeletedAt" IS NULL AND mv."DeletedAt" IS NULL
             ORDER BY mv."CreatedAt" DESC`,
            [modelId],
        );
        return res.rows;
    }
}
