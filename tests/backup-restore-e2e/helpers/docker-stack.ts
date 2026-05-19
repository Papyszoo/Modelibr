import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STACK_DIR = path.resolve(HERE, "..");
const COMPOSE_FILE = path.join(STACK_DIR, "docker-compose.backup-e2e.yml");
const WEBAPI_CONTAINER = "webapi-backup-e2e";
const POSTGRES_CONTAINER = "postgres-backup-e2e";

export const HOST_DATA_DIR = path.join(STACK_DIR, "data");

/** Restart only the webapi service. Postgres + frontend stay up. */
export async function restartWebapi(): Promise<void> {
    await execAsync(
        `docker compose -f "${COMPOSE_FILE}" restart ${WEBAPI_CONTAINER}`,
        { cwd: STACK_DIR },
    );
}

/** Wait for the webapi's /health to return 2xx. */
export async function waitForWebapi(timeoutMs: number = 120000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch("http://localhost:8190/health");
            if (r.ok) return;
        } catch {
            // retry
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`webapi did not come back within ${timeoutMs}ms`);
}

/** Get recent webapi logs (helpful when a test fails). */
export async function getWebapiLogs(lines: number = 200): Promise<string> {
    try {
        const { stdout, stderr } = await execAsync(
            `docker logs --tail ${lines} ${WEBAPI_CONTAINER}`,
        );
        return stdout + stderr;
    } catch (e: any) {
        return `Failed to read webapi logs: ${e.message}`;
    }
}

/** Drop a stale row from a Postgres table via psql, useful to mutate the DB between tests. */
export async function execPsql(sql: string): Promise<string> {
    const escaped = sql.replace(/"/g, '\\"');
    const { stdout } = await execAsync(
        `docker exec -e PGPASSWORD=backup_e2e_password ${POSTGRES_CONTAINER} psql -U modelibr -d Modelibr -c "${escaped}"`,
    );
    return stdout;
}

/** Drop ALL public-schema tables and re-create the empty schema. Simulates a wipe scenario. */
export async function wipePostgresPublicSchema(): Promise<void> {
    await execAsync(
        `docker exec -e PGPASSWORD=backup_e2e_password ${POSTGRES_CONTAINER} psql -U modelibr -d Modelibr -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`,
    );
}

export function readHostFile(relativePath: string): Buffer {
    return fs.readFileSync(path.join(HOST_DATA_DIR, relativePath));
}

export function writeHostFile(relativePath: string, contents: Buffer | string): void {
    const full = path.join(HOST_DATA_DIR, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
}

export function hostPathExists(relativePath: string): boolean {
    return fs.existsSync(path.join(HOST_DATA_DIR, relativePath));
}

export function listHostDir(relativePath: string): string[] {
    const full = path.join(HOST_DATA_DIR, relativePath);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full);
}

/**
 * Delete any `.pre-restore-*` directory under `<HOST_DATA_DIR>/<root>`. The
 * production restore processor refuses to run if these exist — they're the
 * only on-disk copy of the operator's pre-restore data, and silently sweeping
 * them would be a data-loss bug. In tests we know the previous run was a
 * controlled experiment so it's safe to purge them on setup.
 */
export function purgePreRestoreDirs(root: "uploads" | "thumbnails"): void {
    const dir = path.join(HOST_DATA_DIR, root);
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        if (!name.startsWith(".pre-restore-")) continue;
        try {
            fs.rmSync(path.join(dir, name), { recursive: true, force: true });
        } catch {
            // best-effort
        }
    }
}
