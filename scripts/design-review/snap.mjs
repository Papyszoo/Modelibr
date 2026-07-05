#!/usr/bin/env node
/**
 * Design-review page snapshots.
 *
 * Screenshots every main app page in the DEMO build (MSW + IndexedDB — no
 * backend needed) in both themes, into test-report/design-review/<label>/.
 * Used to eyeball before/after when migrating pages onto the design system:
 *
 *   npm run design:snap -- --label before-sounds
 *   ...make changes...
 *   npm run design:snap -- --label after-sounds
 *   npm run design:compare -- before-sounds after-sounds
 *
 * Options:
 *   --label <name>     required — output folder name
 *   --pages a,b,c      subset of page ids (default: all)
 *   --no-build         reuse the existing demo build in src/frontend/dist
 */
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)
const frontendDir = path.join(repoRoot, 'src/frontend')
// Resolve Playwright from the frontend package (it's a dependency there).
const frontendRequire = createRequire(path.join(frontendDir, 'package.json'))
const { chromium } = frontendRequire('@playwright/test')

// The main design surfaces — keep in sync with the New Tab page's tiles
// (components/layout/NewTabPage.tsx), NOT the TabType union: the union
// carries legacy tab types users can no longer open (e.g. 'textureSets',
// which was split into Global Materials + Multi-Model Textures).
const PAGES = [
  { id: 'modelList', label: 'Models' },
  { id: 'globalMaterials', label: 'Global Materials' },
  { id: 'modelTextures', label: 'Multi-Model Textures' },
  { id: 'environmentMaps', label: 'Environment Maps' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'sprites', label: 'Sprites' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'packs', label: 'Packs' },
  { id: 'projects', label: 'Projects' },
  { id: 'settings', label: 'Settings' },
]
const THEMES = ['dark', 'light']
const PORT = 6030
// Demo build is compiled with base=/Modelibr/demo/ (GitHub Pages layout).
const BASE_PATH = '/Modelibr/demo/'

function parseArgs(argv) {
  const args = { build: true, pages: null, label: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--label') args.label = argv[++i]
    else if (argv[i] === '--pages') args.pages = argv[++i].split(',')
    else if (argv[i] === '--no-build') args.build = false
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  if (!args.label) throw new Error('Missing required --label <name>')
  return args
}

/** Static file server mapping BASE_PATH onto the demo dist folder. */
function serveDemo(distDir) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
    '.hdr': 'application/octet-stream',
    '.exr': 'application/octet-stream',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  }
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let rel = urlPath.startsWith(BASE_PATH)
      ? urlPath.slice(BASE_PATH.length)
      : urlPath.replace(/^\//, '')
    let file = path.join(distDir, rel)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(distDir, rel, 'index.html')
      if (!fs.existsSync(file)) file = path.join(distDir, 'index.html') // SPA fallback
    }
    res.setHeader(
      'Content-Type',
      types[path.extname(file)] || 'application/octet-stream'
    )
    // Demo build ships COEP/COOP headers in dev; harmless to mirror here.
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(resolve =>
    server.listen(PORT, () => resolve(server))
  )
}

/**
 * Seed the app's persisted navigation store with a single open tab, so the
 * page under review renders directly — same mechanism the docs-videos
 * helper uses (localStorage 'modelibr_navigation' + session windowId).
 */
function navigationSeed(tab, theme) {
  return {
    theme,
    storageValue: JSON.stringify({
      state: {
        activeWindows: {
          'design-review': {
            tabs: [{ id: tab.id, type: tab.id, label: tab.label, params: {} }],
            activeTabId: tab.id,
            activeRightTabId: null,
            splitterSize: 50,
            lastActiveAt: new Date().toISOString(),
          },
        },
        recentlyClosedTabs: [],
        recentlyClosedWindows: [],
      },
      version: 0,
    }),
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const outDir = path.join(repoRoot, 'test-report/design-review', args.label)
  fs.mkdirSync(outDir, { recursive: true })

  if (args.build) {
    console.log('Building demo bundle (src/frontend, mode=demo)...')
    execSync('npm run build:demo', { cwd: frontendDir, stdio: 'inherit' })
  }

  const distDir = path.join(frontendDir, 'dist')
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`No demo build found at ${distDir} — run without --no-build`)
  }

  const pages = args.pages
    ? PAGES.filter(p => args.pages.includes(p.id))
    : PAGES
  const server = await serveDemo(distDir)
  const browser = await chromium.launch()

  try {
    for (const theme of THEMES) {
      for (const tab of pages) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        })
        const seed = navigationSeed(tab, theme)
        await context.addInitScript(s => {
          window.sessionStorage.setItem('modelibr_windowId', 'design-review')
          window.localStorage.setItem('modelibr_navigation', s.storageValue)
          window.localStorage.setItem('theme', s.theme)
        }, seed)

        const page = await context.newPage()
        // Not networkidle: the demo's SignalR stubs keep a request in flight.
        await page.goto(`http://localhost:${PORT}${BASE_PATH}`, {
          waitUntil: 'domcontentloaded',
        })
        await page.waitForSelector('.p-splitter', { timeout: 20_000 })
        // Demo seeds IndexedDB + thumbnails render async; give it a beat.
        await page.waitForTimeout(2500)

        const file = path.join(outDir, `${tab.id}--${theme}.png`)
        await page.screenshot({ path: file, fullPage: true })
        console.log(`✓ ${tab.id} (${theme})`)
        await context.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }
  console.log(`\nSnapshots: ${outDir}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
