#!/usr/bin/env node
/**
 * Pre-creates the bind-mounted host directories before `docker compose up`.
 *
 * Why this exists: the WebApi image creates /var/lib/modelibr/* and chowns them
 * to `app`, then runs as `USER app` (src/WebApi/Dockerfile). A bind mount
 * replaces that directory - ownership and all - with the host one, and Docker
 * creates a missing bind-mount source as **root:root 755**. The non-root `app`
 * user then cannot write, so the pre-migration backup this stack deliberately
 * exercises (no MODELIBR_SKIP_PREMIGRATION_BACKUP here, unlike the main e2e
 * stack) fails on boot and /health never comes up.
 *
 * On macOS none of this is visible: Docker Desktop's file sharing maps every
 * mounted file to the container user, so the drill passes locally and fails
 * only on a Linux runner. That is exactly how it stayed red for ten nights.
 *
 * Creating them here, world-writable, means the container user can write and
 * the unprivileged host user can clean up afterwards.
 *
 * `data/postgres` is deliberately NOT included: the postgres image starts as
 * root and manages that directory itself, and it *rejects* a PGDATA with
 * group/world permissions.
 */
import fs from "fs";
import path from "path";

const HOST_DIRS = ["uploads", "backups", "restore", "thumbnails"];
const root = path.join(import.meta.dirname, "data");

for (const name of HOST_DIRS) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    // Explicit chmod: mkdir's mode is masked by the process umask.
    fs.chmodSync(dir, 0o777);
}

console.log(`✓ bind-mount dirs ready under ${path.relative(process.cwd(), root)}/`);
