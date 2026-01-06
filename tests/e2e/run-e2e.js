#!/usr/bin/env node
/**
 * Cross-platform E2E test runner script.
 * Replaces run-e2e.ps1 to work on Windows, macOS, and Linux.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMPOSE_FILE = 'docker-compose.e2e.yml';

// Environment variables for test run
const testEnv = {
    ...process.env,
    POSTGRES_USER: 'modelibr',
    POSTGRES_PASSWORD: 'e2e_password',
    POSTGRES_DB: 'Modelibr',
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5433',
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

function runSilent(command) {
    try {
        return execSync(command, { encoding: 'utf-8' }).trim();
    } catch {
        return '';
    }
}

function isE2ERunning() {
    // Check if any containers from the E2E compose are running
    const output = runSilent(`docker compose -f ${COMPOSE_FILE} ps -q`);
    return output.length > 0;
}

function cleanup() {
    console.log('\n🧹 Cleaning up...\n');
    run(`docker compose -f ${COMPOSE_FILE} down -v`);
    
    // Clear shared state file
    const statePath = path.join(__dirname, 'fixtures', '.shared-state.json');
    if (fs.existsSync(statePath)) {
        fs.rmSync(statePath, { force: true });
        console.log('Removed shared state file');
    }
}

async function main() {
    const startTime = Date.now();
    
    console.log('🚀 Starting E2E test environment...\n');
    
    // Always clean up state before starting for a fresh run
    const statePath = path.join(__dirname, '.shared-state.json');
    
    // Stop any running containers first
    if (isE2ERunning()) {
        console.log('⚠️  E2E environment is already running. Stopping containers...\n');
        run(`docker compose -f ${COMPOSE_FILE} down -v`);
    }
    
    // Always clean shared state file if it exists
    if (fs.existsSync(statePath)) {
        fs.rmSync(statePath, { force: true });
        console.log('🗑️  Removed stale shared state file');
    }
    
    // Start containers
    const startResult = run(`docker compose -f ${COMPOSE_FILE} up -d --build`);
    if (startResult !== 0) {
        console.error('❌ Failed to start containers');
        cleanup();
        process.exit(1);
    }
    
    console.log('\n🧪 Running tests...\n');
    
    // Run tests (use test:quick to avoid recursion since npm test now calls this script)
    // Pass through any arguments from the command line
    const args = process.argv.slice(2).join(' ');
    const testResult = run(`npm run test:quick -- ${args}`, { env: testEnv });
    
    // Cleanup
    cleanup();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (testResult === 0) {
        console.log(`\n✅ All tests passed in ${duration}s\n`);
    } else {
        console.log(`\n❌ Tests failed after ${duration}s\n`);
    }
    
    process.exit(testResult);
}

main().catch(err => {
    console.error('Error:', err);
    cleanup();
    process.exit(1);
});
