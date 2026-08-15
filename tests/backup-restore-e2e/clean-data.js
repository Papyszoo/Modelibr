#!/usr/bin/env node
/**
 * Removes the bind-mounted `data/` tree after a run.
 *
 * `data/postgres` is written by the postgres container as root, so an
 * unprivileged host user cannot remove it - `rmSync(..., {force: true})`
 * swallows ENOENT, not EACCES, and the thrown error used to fail the whole
 * nightly step *after* the real failure, burying it in the log.
 *
 * So: try it directly, and fall back to deleting from a throwaway root
 * container. Using a container rather than sudo keeps this working for a
 * developer running the drill locally.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const here = import.meta.dirname;
const data = path.join(here, "data");

if (!fs.existsSync(data)) {
    process.exit(0);
}

try {
    fs.rmSync(data, { recursive: true, force: true });
    console.log("✓ data/ removed");
    process.exit(0);
} catch (err) {
    if (err.code !== "EACCES" && err.code !== "EPERM") throw err;
    console.log(`data/ is root-owned (${err.code}) - removing via a root container`);
}

const result = spawnSync(
    "docker",
    ["run", "--rm", "-v", `${here}:/work`, "alpine:3", "rm", "-rf", "/work/data"],
    { stdio: "inherit" },
);

if (result.status !== 0) {
    console.error("✗ could not remove data/ - remove it manually before the next run");
    process.exit(1);
}

console.log("✓ data/ removed (root container)");
