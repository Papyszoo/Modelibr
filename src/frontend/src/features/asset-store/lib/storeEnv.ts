/**
 * Isolated env read: Jest cannot parse `import.meta`, so this one-liner
 * lives alone and is globally mocked in setupTests.ts (backed by
 * process.env.VITE_STORE_URL there).
 */
export function readStoreUrlEnv(): string | undefined {
  return import.meta.env.VITE_STORE_URL
}
