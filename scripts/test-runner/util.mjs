// Shared helpers: paths, colored output, command runner (tee to terminal + log),
// and Docker availability check.

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
export const REPORT_DIR = path.join(REPO_ROOT, "test-report");
export const LOGS_DIR = path.join(REPORT_DIR, "logs");
export const WORK_DIR = path.join(REPORT_DIR, ".work");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
export const c = {
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    blue: wrap("34"),
    cyan: wrap("36"),
    gray: wrap("90"),
    bold: wrap("1"),
    dim: wrap("2"),
};

export function exists(relPath) {
    return fs.existsSync(path.join(REPO_ROOT, relPath));
}

let dockerCache;
/** True if the Docker daemon is reachable. Result is cached for the process. */
export function dockerUp() {
    if (dockerCache === undefined) {
        try {
            execSync("docker info", { stdio: "ignore" });
            dockerCache = true;
        } catch {
            dockerCache = false;
        }
    }
    return dockerCache;
}

/**
 * Run a shell command, streaming output to the terminal and a log file at once.
 * Resolves with { exitCode, output } and never rejects.
 */
export function runCommand(command, { cwd, logFile, extraEnv } = {}) {
    return new Promise((resolve) => {
        const logStream = logFile
            ? fs.createWriteStream(logFile, { flags: "w" })
            : null;
        let output = "";
        const child = spawn(command, {
            cwd,
            shell: true,
            env: { ...process.env, ...extraEnv },
            stdio: ["ignore", "pipe", "pipe"],
        });
        const onData = (chunk) => {
            const s = chunk.toString();
            output += s;
            process.stdout.write(s);
            if (logStream) logStream.write(s);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (err) => {
            const s = `\n[test-runner] failed to start command: ${err.message}\n`;
            output += s;
            process.stdout.write(s);
            if (logStream) logStream.end();
            resolve({ exitCode: 1, output, spawnError: true });
        });
        child.on("close", (code) => {
            if (logStream) logStream.end();
            resolve({ exitCode: code ?? 1, output });
        });
    });
}

/** Human-readable duration. */
export function fmtDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${Math.round(s % 60)}s`;
}
