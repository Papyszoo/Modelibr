import pg from "pg";

export class DbHelper {
    private pool: pg.Pool;

    constructor() {
        this.pool = new pg.Pool({
            user: process.env.POSTGRES_USER || "modelibr",
            host: process.env.POSTGRES_HOST || "localhost",
            database: process.env.POSTGRES_DB || "Modelibr",
            password:
                process.env.POSTGRES_PASSWORD || "ChangeThisStrongPassword123!",
            port: parseInt(process.env.POSTGRES_PORT || "5432"),
        });
    }

    async query(text: string, params?: any[]) {
        return this.pool.query(text, params);
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
        await this.pool.end();
    }
}
