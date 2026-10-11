/**
 * Build-time environment flags.
 *
 * Vite exposes these on `import.meta.env`, which does not exist under Jest
 * (babel only rewrites the known `import.meta` properties, not `env`). Routing
 * the read through this module lets tests mock it instead of tripping over the
 * bare `import.meta` reference.
 */
export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true'
}
