#!/usr/bin/env node
/**
 * Lightweight E2E test runner.
 * Runs backend/worker in Docker (using cached/available images) and frontend locally.
 */

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

const COMPOSE_FILE = 'docker-compose.light.yml';

// Environment variables for test run
const testEnv = {
    ...process.env,
    FRONTEND_URL: 'http://localhost:3002',
};

function run(command, options = {}) {
    console.log(`\n> ${command}\n`);
    try {
        execSync(command, { stdio: 'inherit', ...options });
        return 0;
    } catch (error) {
        return error.status || 1;
    }
}

let frontendProcess = null;

function cleanup() {
    console.log('\n🧹 Cleaning up...\n');

    // Stop frontend
    if (frontendProcess) {
        console.log('Stopping frontend...');
        frontendProcess.kill();
    }

    // Stop Docker containers
    run(`sudo docker compose -f ${COMPOSE_FILE} down -v`);

    const dataPath = path.join(__dirname, 'data');
    if (fs.existsSync(dataPath)) {
        // use sudo rm because docker creates files as root
        try {
            execSync(`sudo rm -rf "${dataPath}"`);
            console.log('Removed data directory');
        } catch (e) {
            console.error('Failed to remove data directory');
        }
    }
}

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForFrontend(url, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok) return true;
        } catch (e) {
            // ignore
        }
        await wait(1000);
    }
    return false;
}

async function main() {
    const startTime = Date.now();

    console.log('🚀 Starting LIGHTWEIGHT E2E test environment...\n');

    // 1. Prepare Data Directory
    const dataPath = path.join(__dirname, 'data');
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath);
    }
    const thumbsPath = path.join(dataPath, 'thumbnails');
    if (!fs.existsSync(thumbsPath)) {
        fs.mkdirSync(thumbsPath);
    }

    // 2. Start Backend & Worker in Docker
    console.log('Starting Backend and Worker...');
    // No --build because we use image: mcr...
    const startResult = run(`sudo docker compose -f ${COMPOSE_FILE} up -d`);
    if (startResult !== 0) {
        console.error('❌ Failed to start containers');
        cleanup();
        process.exit(1);
    }

    console.log('Waiting for Backend to be ready (this may take a while for first run restore/build)...');
    // Check backend health. Exposed on 8090.
    if (!await waitForFrontend('http://localhost:8090/health', 120000)) {
        console.error('❌ Backend failed to start');
        run('sudo docker logs webapi-e2e-light');
        cleanup();
        process.exit(1);
    }

    // 3. Start Frontend Locally
    console.log('Starting Frontend locally...');

    // Dump worker logs if it crashed
    try {
        const workerState = execSync("sudo docker inspect -f '{{.State.Running}}' worker-e2e-light").toString().trim();
        if (workerState !== 'true') {
            console.error('❌ Worker container crashed!');
            run('sudo docker logs worker-e2e-light');
            cleanup();
            process.exit(1);
        }
    } catch (e) {
        // Ignore check
    }

    const frontendDir = path.join(REPO_ROOT, 'src/frontend');

    // Install dependencies if needed
    if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
        console.log('Installing frontend dependencies...');
        run('npm install', { cwd: frontendDir });
    }

    // Build frontend (needed for preview)
    console.log('Building frontend...');
    // We use host.docker.internal because tests run inside container and browser needs to reach host's exposed port 8090
    run('npm run build', { cwd: frontendDir, env: { ...process.env, VITE_API_BASE_URL: 'http://host.docker.internal:8090' } });

    // Start preview
    console.log('Starting preview server...');
    frontendProcess = spawn('npm', ['run', 'preview', '--', '--host', '--port', '3002'], {
        cwd: frontendDir,
        env: { ...process.env, VITE_API_BASE_URL: 'http://host.docker.internal:8090' },
        stdio: 'inherit'
    });

    console.log('Waiting for frontend to be ready...');
    if (!await waitForFrontend('http://localhost:3002')) {
        console.error('❌ Frontend failed to start');
        cleanup();
        process.exit(1);
    }

    console.log('\n🧪 Running tests...\n');

    // Install dependencies inside worker container for tests
    console.log('Installing test dependencies inside container...');
    // We install in /app/tests/e2e
    const installRes = run(`sudo docker exec -w /app/tests/e2e worker-e2e-light npm install`);
    if (installRes !== 0) {
        console.error('❌ Failed to install test dependencies in container');
        cleanup();
        process.exit(1);
    }

    // Run tests inside container
    console.log('Running tests inside container...');
    // FRONTEND_URL points to host (docker gateway)
    // Running only @setup first to debug
    // Run bddgen first
    run(`sudo docker exec -w /app/tests/e2e worker-e2e-light npx bddgen`);
    const testResult = run(`sudo docker exec -w /app/tests/e2e -e FRONTEND_URL=http://host.docker.internal:3002 -e API_BASE_URL=http://webapi:8080 worker-e2e-light npx playwright test --grep "@setup"`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (testResult === 0) {
        console.log(`\n✅ All tests passed in ${duration}s\n`);
        cleanup();
    } else {
        console.log(`\n❌ Tests failed after ${duration}s\n`);
        console.log('Dumping WebApi logs:');
        run('sudo docker logs webapi-e2e-light');
        cleanup();
    }

    process.exit(testResult);
}

main().catch(err => {
    console.error('Error:', err);
    cleanup();
    process.exit(1);
});
