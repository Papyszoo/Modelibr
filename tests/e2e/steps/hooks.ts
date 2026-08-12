import { createBdd } from "playwright-bdd";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { DockerHelper } from "../helpers/docker-helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { After } = createBdd();

const dockerHelper = new DockerHelper();

const CONTAINERS = [
    { name: "webapi-e2e", label: "webapi" },
    { name: "asset-processor-e2e", label: "worker" },
] as const;

// Full container logs are written here as well as attached. Attachments live in
// playwright-report/, which the NEXT suite in the runner (e2e-performance)
// overwrites - on 2026-08-10 that destroyed the only copy of the worker's dying
// stderr before it could be read. `*.log` is gitignored under tests/e2e.
const CONTAINER_LOG_DIR = path.join(__dirname, "..", "container-logs");

function slugify(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

After(async ({ $testInfo }) => {
    // Only attach logs if the test failed or timed out
    if ($testInfo.status === "failed" || $testInfo.status === "timedOut") {
        console.log(
            `[Hooks] Test failed: ${$testInfo.title}. Attaching backend logs...`,
        );

        await mkdir(CONTAINER_LOG_DIR, { recursive: true }).catch(() => {});

        for (const { name, label } of CONTAINERS) {
            const state = await dockerHelper.getContainerState(name);
            const logs = await dockerHelper.getContainerLogs(name, 500);

            // console.log, not just an attachment: the console reporter prints
            // only the first ~200 chars of a text attachment, so the state line
            // has to stand alone to reach test-report/logs/<suite>.log - the one
            // artifact that outlives the run.
            console.log(`[Hooks] ${name}: ${state}`);

            await $testInfo.attach(`${label}-state`, {
                body: state,
                contentType: "text/plain",
            });

            const logPath = path.join(
                CONTAINER_LOG_DIR,
                `${slugify($testInfo.title)}-retry${$testInfo.retry}-${label}.log`,
            );
            try {
                await writeFile(
                    logPath,
                    `# docker inspect: ${state}\n\n${logs}`,
                    "utf8",
                );
                console.log(`[Hooks] ${label} logs written to ${logPath}`);
            } catch (error: any) {
                console.warn(
                    `[Hooks] Failed to write ${logPath}: ${error.message}`,
                );
            }

            await $testInfo.attach(`${label}-logs`, {
                body: logs,
                contentType: "text/plain",
            });
        }

        console.log("[Hooks] Backend logs attached to report.");
    }
});
