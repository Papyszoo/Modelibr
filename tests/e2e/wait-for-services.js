#!/usr/bin/env node
/**
 * Waits for all E2E services (WebApi, Frontend, Worker) to be healthy.
 * Used by `npm run test:setup` after starting Docker containers.
 */
import http from "http";

const services = [
    { url: "http://localhost:8090/health", label: "WebApi" },
    { url: "http://localhost:3003/health", label: "Worker" },
    { url: "http://localhost:3002", label: "Frontend" },
];

const TIMEOUT_MS = 120000;
const POLL_MS = 2000;

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode || 0);
        });
        request.on("error", reject);
        request.setTimeout(5000, () => {
            request.destroy(new Error("timeout"));
        });
    });
}

async function waitFor(service) {
    const start = Date.now();
    process.stdout.write(
        `⏳ Waiting for ${service.label} at ${service.url}...`,
    );

    while (Date.now() - start < TIMEOUT_MS) {
        try {
            const status = await httpGet(service.url);
            if (status >= 200 && status < 300) {
                process.stdout.write(" ready ✓\n");
                return;
            }
        } catch {
            // retry
        }
        process.stdout.write(".");
        await new Promise((r) => setTimeout(r, POLL_MS));
    }

    process.stdout.write("\n");
    throw new Error(`Timed out waiting for ${service.label}`);
}

try {
    for (const svc of services) {
        await waitFor(svc);
    }
    console.log("\n✅ All services ready\n");
} catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
}
