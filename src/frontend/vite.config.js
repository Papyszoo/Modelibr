import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The demo SPA is a thin client-rendered shell served from the same origin as
// the landing page and the docs, so keep it out of search results and give it
// an explicit canonical URL. Only the demo build gets these tags.
const demoTags = {
  name: 'demo-seo-tags',
  transformIndexHtml() {
    return [
      {
        tag: 'meta',
        attrs: { name: 'robots', content: 'noindex' },
        injectTo: 'head',
      },
      {
        tag: 'link',
        attrs: { rel: 'canonical', href: 'https://modelibr.com/demo/' },
        injectTo: 'head',
      },
    ]
  },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDemo = mode === 'demo'
  const plugins = [react()]
  if (isDemo) {
    plugins.push(demoTags)
  }

  return {
    base: isDemo ? '/demo/' : '/',
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3010,
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      fs: {
        // Allow Vite dev server to read the shared TIFF decoder from the
        // sibling asset-processor workspace.
        allow: [path.resolve(__dirname, '..')],
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 3010,
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    optimizeDeps: {
      include: ['three'],
    },
  }
})
