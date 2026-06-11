#!/usr/bin/env node
// Local control panel for the test catalog. Binds 127.0.0.1 only. Serves the
// static UI + catalog.json, and exposes a small API to run a suite and stream its
// output live over SSE. Commands are built from the manifest (runspec.mjs) — the
// client only sends a validated run-spec, never a raw command.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { CATALOG_FILE, GH_CACHE_FILE, REPORT_DIR, HISTORY_FILE } from "./util.mjs";
import { exists, dockerUp, REPO_ROOT } from "../test-runner/util.mjs";
import { buildRunSpec, getSuite } from "./runspec.mjs";
import { buildCatalog } from "./build-catalog.mjs";
import { collectLocalHistory } from "./collectors/local-history.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");
const PORT = parseInt(process.env.MODELIBR_TEST_SITE_PORT || "5178", 10);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

/** @type {{id:string,status:string,suiteId:string,startedAt:number,buffer:string[],clients:Set<any>,result:any,child:any}|null} */
let activeRun = null;

function send(res, code, body, headers = {}) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(data);
}

// ── Catalog freshness ────────────────────────────────────────────────────────
// Watch the test sources and mark the catalog dirty when anything changes; the
// rebuild happens lazily on the next catalog request (~2s), so the site stays
// current without manual `test:catalog` runs. If watchers can't be installed,
// fall back to a 60s time-based staleness check.
const WATCH_DIRS = [
    "tests",
    "src/frontend/src",
    "src/asset-processor/tests",
    "src/desktop",
    ".github/workflows",
    "scripts/test-runner",
];
let catalogDirty = false;
let watchersOk = true;
for (const d of WATCH_DIRS) {
    const abs = path.join(REPO_ROOT, d);
    if (!fs.existsSync(abs)) continue;
    try {
        fs.watch(abs, { recursive: true }, () => {
            catalogDirty = true;
        });
    } catch {
        watchersOk = false;
    }
}

// (Re)build catalog.json when missing or stale; returns true when a catalog is
// available to serve. A failed rebuild of an EXISTING catalog serves the stale
// one rather than erroring; only a missing catalog 500s.
function ensureCatalog(res) {
    const missing = !fs.existsSync(CATALOG_FILE);
    const timeStale =
        !watchersOk && !missing && Date.now() - fs.statSync(CATALOG_FILE).mtimeMs > 60_000;
    if (missing || catalogDirty || timeStale) {
        try {
            // Reuse the GitHub-history cache when present (instant); never block
            // a page load on a 30s gh fetch — the ↻ button does explicit refreshes.
            buildCatalog({ github: fs.existsSync(GH_CACHE_FILE), quiet: true });
            catalogDirty = false;
        } catch (e) {
            if (missing) {
                send(res, 500, { error: `catalog build failed: ${e.message || e}` });
                return false;
            }
        }
    }
    return true;
}

function serveFromRoot(res, abs, dir) {
    if (!abs.startsWith(dir) || !fs.existsSync(abs)) return send(res, 404, { error: "not found" });
    let target = abs;
    if (fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
    if (!fs.existsSync(target)) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": MIME[path.extname(target)] || "application/octet-stream" });
    fs.createReadStream(target).pipe(res);
}

function serveStatic(req, res, urlPath) {
    let file = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
    if (file === "catalog.json") {
        if (!ensureCatalog(res)) return;
        res.writeHead(200, { "Content-Type": "application/json" });
        return fs.createReadStream(CATALOG_FILE).pipe(res);
    }
    serveFromRoot(res, path.join(UI_DIR, path.normalize(file)), UI_DIR);
}

// Serve a generated report (e.g. tests/e2e/playwright-report) under /report/<repo
// path>, with a traversal guard so only files inside the repo are reachable.
function serveReport(req, res, relPath) {
    const abs = path.resolve(REPO_ROOT, path.normalize(relPath));
    serveFromRoot(res, abs, REPO_ROOT);
}

function broadcast(event, payload) {
    if (!activeRun) return;
    const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of activeRun.clients) c.write(line);
}

function appendHistory(record) {
    try {
        fs.mkdirSync(REPORT_DIR, { recursive: true });
        fs.appendFileSync(HISTORY_FILE, JSON.stringify(record) + "\n");
    } catch {
        /* non-fatal */
    }
}

function branch() {
    try {
        return execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
        return "unknown";
    }
}

function startRun(spec, res) {
    const suite = getSuite(spec.suiteId);
    if (!suite) return send(res, 400, { error: `unknown suite: ${spec.suiteId}` });
    if (!exists(suite.detectPath)) return send(res, 409, { error: `${suite.name} is not present on this branch` });
    if (suite.requiresDocker && !dockerUp()) return send(res, 409, { error: "Docker is not running — start it first" });
    if (activeRun && activeRun.status === "running") return send(res, 409, { error: "a run is already in progress" });

    let rs;
    try {
        rs = buildRunSpec(spec);
    } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
    }

    fs.mkdirSync(rs.workDir, { recursive: true });
    fs.mkdirSync(path.join(REPORT_DIR, "logs"), { recursive: true });
    // The "everything" run spawns the mega-runner, which clears test-report/logs
    // at ITS start — so its console log lives at the test-report root instead.
    const logFile = suite.id === "everything"
        ? path.join(REPORT_DIR, "everything.log")
        : path.join(REPORT_DIR, "logs", `${suite.id}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "w" });

    const id = `${Date.now()}`;
    // detached → own process group, so /api/run/stop can kill the whole tree
    // (shell + npm + playwright/dotnet children), not just the shell.
    const child = spawn(rs.command, { cwd: rs.cwd, shell: true, detached: true, env: { ...process.env, ...rs.env }, stdio: ["ignore", "pipe", "pipe"] });
    activeRun = { id, status: "running", suiteId: suite.id, suiteName: suite.name, startedAt: Date.now(), buffer: [], clients: new Set(), result: null, child, summary: rs.summary, stopRequested: false };

    const onData = (chunk) => {
        const s = chunk.toString();
        activeRun.buffer.push(s);
        if (activeRun.buffer.length > 5000) activeRun.buffer.shift();
        logStream.write(s);
        broadcast("output", { chunk: s });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    // Single finalizer for both normal exit and spawn failure, guarded so the two
    // (a spawn `error` may or may not be followed by `close`) can't double-run.
    let finished = false;
    const finish = (code, errText) => {
        if (finished) return;
        finished = true;
        if (errText) {
            activeRun.buffer.push(errText);
            logStream.write(errText);
            broadcast("output", { chunk: errText });
        }
        logStream.end();
        let counts = null;
        try { counts = rs.parse({ exitCode: code, output: activeRun.buffer.join("") }); } catch { counts = null; }
        const durationMs = Date.now() - activeRun.startedAt;
        const status = activeRun.stopRequested ? "stopped" : code === 0 ? "passed" : "failed";
        const reportLink = rs.reportPath && exists(`${rs.reportPath}/index.html`) ? rs.reportPath : null;
        activeRun.status = "done";
        activeRun.result = { status, counts, durationMs, exitCode: code, reportLink, logFile: path.relative(REPO_ROOT, logFile) };
        // No history line for stopped runs (partial durations would skew the
        // timing stats) or for "everything" (the runner records each suite itself).
        if (status !== "stopped" && suite.id !== "everything")
            appendHistory({ timestamp: new Date().toISOString(), branch: branch(), source: "studio", params: rs.summary, suites: [{ id: suite.id, status, durationMs, counts }] });
        broadcast("end", activeRun.result);
        for (const c of activeRun.clients) c.end();
        activeRun.clients.clear();
    };
    child.on("error", (err) => finish(1, `\n[server] failed to start command: ${err.message}\n`));
    child.on("close", (code) => finish(code ?? 1));

    send(res, 200, { runId: id, suiteId: suite.id, command: rs.command, params: rs.summary });
}

// Kill the active run's whole process group (negative pid = group; the child
// was spawned detached). The close handler then finalizes with status "stopped".
function killActiveRun() {
    if (!activeRun || activeRun.status !== "running" || !activeRun.child?.pid) return false;
    activeRun.stopRequested = true;
    try {
        process.kill(-activeRun.child.pid, "SIGTERM");
    } catch {
        try { activeRun.child.kill("SIGTERM"); } catch { /* already gone */ }
    }
    return true;
}

function stopRun(res) {
    if (!killActiveRun()) return send(res, 409, { error: "no run in progress" });
    send(res, 200, { ok: true });
}

function streamRun(req, res) {
    if (!activeRun) return send(res, 404, { error: "no active run" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: start\ndata: ${JSON.stringify({ id: activeRun.id, suiteId: activeRun.suiteId, suiteName: activeRun.suiteName })}\n\n`);
    // Replay buffered output so late subscribers see the whole run.
    if (activeRun.buffer.length) res.write(`event: output\ndata: ${JSON.stringify({ chunk: activeRun.buffer.join("") })}\n\n`);
    if (activeRun.status === "done") {
        res.write(`event: end\ndata: ${JSON.stringify(activeRun.result)}\n\n`);
        return res.end();
    }
    activeRun.clients.add(res);
    req.on("close", () => activeRun && activeRun.clients.delete(res));
}

function readBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => {
            try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); }
        });
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    if (p === "/api/health") return send(res, 200, { ok: true, branch: branch(), dockerUp: dockerUp() });
    if (p === "/api/catalog") {
        if (!ensureCatalog(res)) return;
        return send(res, 200, fs.readFileSync(CATALOG_FILE, "utf8"));
    }
    if (p === "/api/history") return send(res, 200, collectLocalHistory());
    if (p === "/api/summary") {
        try {
            return send(res, 200, fs.readFileSync(path.join(REPORT_DIR, "summary.json"), "utf8"));
        } catch {
            return send(res, 200, { meta: null, results: [] });
        }
    }
    if (p === "/api/run/active") return send(res, 200, activeRun ? { id: activeRun.id, status: activeRun.status, suiteId: activeRun.suiteId, result: activeRun.result } : { status: "idle" });
    if (p === "/api/run/stream") return streamRun(req, res);
    if (p === "/api/run/stop" && req.method === "POST") return stopRun(res);
    if (p === "/api/run" && req.method === "POST") return startRun(await readBody(req), res);
    if (p === "/api/github/refresh" && req.method === "POST") {
        try { buildCatalog({ github: true, refreshGh: true, quiet: true }); } catch (e) { return send(res, 500, { error: String(e.message || e) }); }
        return send(res, 200, { ok: true });
    }
    if (p.startsWith("/report/") && req.method === "GET") return serveReport(req, res, decodeURIComponent(p.slice("/report/".length)));
    if (req.method === "GET") return serveStatic(req, res, p);
    send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
    const urlStr = `http://127.0.0.1:${PORT}`;
    console.log(`\n  Modelibr Test Studio → ${urlStr}\n`);
    if (!process.argv.includes("--no-open") && process.platform === "darwin") {
        try { execSync(`open ${urlStr}`, { stdio: "ignore" }); } catch { /* ignore */ }
    }
});

// Don't orphan a detached run when the server itself is stopped — kill the
// run's process group first so no test processes/containers keep spinning.
for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        killActiveRun();
        process.exit(sig === "SIGINT" ? 130 : 143);
    });
}
