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
                password:
                    process.env.POSTGRES_PASSWORD || "ChangeThisStrongPassword123!",
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
            [modelVersionId]
        );
        return res.rows[0];
    }

    async getModelVersion(versionId: number) {
        const res = await this.query(
            'SELECT * FROM "ModelVersions" WHERE "Id" = $1',
            [versionId]
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
    async getDefaultTextureSetForVersion(modelVersionId: number): Promise<number | null> {
        const res = await this.query(
            'SELECT "DefaultTextureSetId" FROM "ModelVersions" WHERE "Id" = $1',
            [modelVersionId]
        );
        return res.rows[0]?.DefaultTextureSetId || null;
    }
}
