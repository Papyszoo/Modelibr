import { createBdd } from "playwright-bdd";
import { DockerHelper } from "../helpers/docker-helper";

const { After } = createBdd();

const dockerHelper = new DockerHelper();

After(async ({ $testInfo }) => {
    // Only attach logs if the test failed or timed out
    if ($testInfo.status === "failed" || $testInfo.status === "timedOut") {
        console.log(`[Hooks] Test failed: ${$testInfo.title}. Attaching backend logs...`);

        // Fetch logs from backend containers
        const webApiLogs = await dockerHelper.getContainerLogs("webapi-e2e", 500);
        const workerLogs = await dockerHelper.getContainerLogs("thumbnail-worker-e2e", 500);

        // Attach WebAPI logs
        await $testInfo.attach("webapi-logs", {
            body: webApiLogs,
            contentType: "text/plain",
        });

        // Attach Worker logs
        await $testInfo.attach("worker-logs", {
            body: workerLogs,
            contentType: "text/plain",
        });
        
        console.log("[Hooks] Backend logs attached to report.");
    }
});
