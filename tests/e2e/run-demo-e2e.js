#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import http, { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "../../src/frontend");
const DIST_DIR = path.join(FRONTEND_DIR, "dist");
const HOST = "127.0.0.1";
const PORT = 3004;
const FRONTEND_URL = "http://localhost:3004/Modelibr/demo/";
const DEMO_BASE_PATH = "/Modelibr/demo/";
const VITE_BIN = path.join(
    FRONTEND_DIR,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
);

const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".eot": "application/vnd.ms-fontobject",
    ".fbx": "application/octet-stream",
    ".glb": "model/gltf-binary",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".mtl": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".wav": "audio/wav",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

const testEnv = {
    ...process.env,
    FRONTEND_URL,
};

function run(command, options = {}) {
    console.log(`\n> ${command}\n`);
    try {
        execSync(command, { stdio: "inherit", ...options });
        return 0;
    } catch (error) {
        return error.status || 1;
    }
}

function runAsync(command, args, options = {}) {
    console.log(`\n> ${command} ${args.join(" ")}\n`);

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: "inherit",
            ...options,
        });

        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 1));
    });
}

function ensureFrontendDependencies() {
    if (existsSync(VITE_BIN)) {
        return;
    }

    console.log("📦 Installing frontend dependencies for demo build...\n");
    const installResult = run("npm ci", { cwd: FRONTEND_DIR });
    if (installResult !== 0) {
        console.error("❌ Failed to install frontend dependencies for demo build");
        process.exit(1);
    }
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (res) => {
            res.resume();
            resolve(res.statusCode || 0);
        });

        request.on("error", reject);
        request.setTimeout(5000, () => {
            request.destroy(new Error("Request timed out"));
        });
    });
}

async function waitForFrontend(url, timeoutMs = 120000) {
    const start = Date.now();
    const pollInterval = 2000;

    process.stdout.write(`⏳ Waiting for demo frontend at ${url}...`);

    while (Date.now() - start < timeoutMs) {
        try {
            const status = await httpGet(url);
            if (status >= 200 && status < 300) {
                process.stdout.write(" ready\n");
                return;
            }
        } catch {
            // Ignore and retry
        }

        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    process.stdout.write("\n");
    throw new Error(`Timed out waiting for demo frontend at ${url}`);
}

async function fileExists(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return stats.isFile();
    } catch {
        return false;
    }
}

function getMimeType(filePath) {
    return (
        MIME_TYPES[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream"
    );
}

async function resolveRequestFile(urlPath) {
    if (
        urlPath === "/" ||
        urlPath === "/index.html" ||
        urlPath === DEMO_BASE_PATH.slice(0, -1)
    ) {
        return { redirect: DEMO_BASE_PATH };
    }

    if (!urlPath.startsWith(DEMO_BASE_PATH)) {
        return null;
    }

    const relativePath =
        decodeURIComponent(urlPath.slice(DEMO_BASE_PATH.length)) ||
        "index.html";
    const candidatePath = path.resolve(DIST_DIR, relativePath);

    if (!candidatePath.startsWith(DIST_DIR)) {
        return null;
    }

    if (await fileExists(candidatePath)) {
        return { filePath: candidatePath };
    }

    if (!path.extname(relativePath)) {
        return { filePath: path.join(DIST_DIR, "index.html") };
    }

    return null;
}

function startStaticServer() {
    const server = createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url || "/", FRONTEND_URL);
            const resolved = await resolveRequestFile(requestUrl.pathname);

            if (!resolved) {
                res.writeHead(404, {
                    "Content-Type": "text/plain; charset=utf-8",
                });
                res.end("Not found");
                return;
            }

            if (resolved.redirect) {
                res.writeHead(302, { Location: resolved.redirect });
                res.end();
                return;
            }

            const body = await fs.readFile(resolved.filePath);
            res.writeHead(200, {
                "Content-Type": getMimeType(resolved.filePath),
            });
            res.end(body);
        } catch (error) {
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(
                error instanceof Error
                    ? error.message
                    : "Unexpected server error",
            );
        }
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(PORT, HOST, () => resolve(server));
    });
}

function cleanup(server) {
    console.log("\n🧹 Stopping local demo preview server...\n");
    return new Promise((resolve) => {
        if (!server) {
            resolve();
            return;
        }

        server.close(() => resolve());
    });
}

async function main() {
    const startTime = Date.now();
    const args = process.argv.slice(2);
    let server;

    ensureFrontendDependencies();

    console.log("🚀 Building demo frontend...\n");

    const buildResult = run("npm run build:demo", { cwd: FRONTEND_DIR });
    if (buildResult !== 0) {
        console.error("❌ Failed to build demo frontend");
        process.exit(1);
    }

    try {
        console.log("\n🚀 Starting local demo preview server...\n");
        server = await startStaticServer();
        await waitForFrontend(FRONTEND_URL);
    } catch (error) {
        console.error(`\n❌ ${error.message}`);
        await cleanup(server);
        process.exit(1);
    }

    console.log("\n🧪 Running demo tests...\n");

    const testResult = await runAsync(
        "npx",
        ["playwright", "test", "--config=playwright.demo.config.ts", ...args],
        { env: testEnv },
    );

    await cleanup(server);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    if (testResult === 0) {
        console.log(`\n✅ Demo E2E tests passed in ${duration}s\n`);
    } else {
        console.log(`\n❌ Demo E2E tests failed after ${duration}s\n`);
    }

    process.exit(testResult);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
