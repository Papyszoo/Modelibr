import express from 'express'
import rateLimit from 'express-rate-limit'
import { createProxyMiddleware } from 'http-proxy-middleware'
import http from 'http'
import path from 'path'

import { sanitizeRuntimeConfig, saveRuntimeConfig } from './runtimeConfig.js'

export async function startEdgeServer({ runtimeDir, configPath, runtimeManager, log = console.log }) {
  const app = express()
  // Proxy to the API port the WebApi actually bound (a free fallback if the
  // configured one was taken), not the raw config.
  const backendBaseUrl = `http://127.0.0.1:${runtimeManager.runningConfig.internalApiPort}`
  const frontendDir = path.join(runtimeDir, 'frontend')

  app.disable('x-powered-by')

  // IMPORTANT: do NOT parse the body globally. http-proxy-middleware streams
  // the request body to the WebApi/WebDAV target, so consuming it here with
  // express.json() would make every proxied POST/PUT/PROPFIND hang (the target
  // waits for a body that was already drained). Parse JSON only on the local
  // routes that actually read req.body.
  app.get('/api/native/runtime', (_request, response) => {
    response.json(runtimeManager.buildRuntimeSnapshot())
  })

  app.put('/api/native/runtime', express.json(), async (request, response) => {
    const previousConfig = runtimeManager.config
    const nextConfig = sanitizeRuntimeConfig({
      ...previousConfig,
      ...request.body,
    })

    // Worker settings apply live; ports and the data folder need a restart.
    // ProcessManager.hasPendingRestart() is the single source of truth for
    // "needs restart" (used identically by the tray IPC handler), so changing
    // the backend/database port here behaves the same as from the tray — not
    // just appPort.
    const workerSettingsChanged =
      nextConfig.workerProcessCount !== previousConfig.workerProcessCount ||
      nextConfig.maxConcurrentJobsPerWorker !== previousConfig.maxConcurrentJobsPerWorker ||
      nextConfig.enableHardwareAcceleration !== previousConfig.enableHardwareAcceleration

    const savedConfig = await saveRuntimeConfig(configPath, nextConfig)
    runtimeManager.updateConfig(savedConfig)
    // Queue a data-folder move for the next launch if it changed here too.
    await runtimeManager.scheduleDataMigrationIfNeeded()

    if (workerSettingsChanged) {
      await runtimeManager.restartWorkers()
    }

    response.json({
      restartRequired: runtimeManager.hasPendingRestart(),
      config: runtimeManager.buildRuntimeSnapshot(),
    })
  })

  const apiProxy = createProxyMiddleware({
    target: backendBaseUrl,
    changeOrigin: false,
    ws: true,
    pathRewrite: requestPath => requestPath.replace(/^\/api/, ''),
    logLevel: 'silent',
  })

  const webDavProxy = createProxyMiddleware({
    target: backendBaseUrl,
    changeOrigin: false,
    ws: false,
    logLevel: 'silent',
  })

  app.use((request, response, next) => {
    if (request.path === '/modelibr-cert.crt' || request.path.startsWith('/modelibr')) {
      webDavProxy(request, response, next)
      return
    }

    if (request.path.startsWith('/api')) {
      apiProxy(request, response, next)
      return
    }

    next()
  })

  // Rate-limit the static frontend file serving. The /api and WebDAV proxies
  // above short-circuit before reaching here, so this only guards the local
  // file-system reads — generous enough to never affect normal local use.
  const staticLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10000,
    standardHeaders: true,
    legacyHeaders: false,
  })

  // Attach the limiter directly to the two handlers that touch the file system
  // (static assets + the SPA catch-all sendFile) so the rate limiting is applied
  // at the route level CodeQL recognizes, not only as upstream app.use middleware.
  app.use(staticLimiter, express.static(frontendDir, { index: false }))
  app.get('*', staticLimiter, (_request, response) => {
    response.sendFile(path.join(frontendDir, 'index.html'))
  })

  const server = http.createServer(app)

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/api/')) {
      apiProxy.upgrade(request, socket, head)
      return
    }

    socket.destroy()
  })

  // The app port was already resolved to a free one at start (runningConfig),
  // so a clash here is rare — surface a clear message if it somehow still hits.
  const appPort = runtimeManager.runningConfig.appPort
  // Loopback by default (this machine only). Bind all interfaces when the user
  // opts into network access, so a desktop client on another LAN machine can
  // reach the host. The app has no auth, so this is off by default.
  const bindHost = runtimeManager.runningConfig.allowNetworkAccess
    ? '0.0.0.0'
    : '127.0.0.1'
  await new Promise((resolve, reject) => {
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${appPort} is already in use.\n\nChange it in Settings and restart Modelibr.`
        ))
      } else {
        reject(err)
      }
    })
    server.listen(appPort, bindHost, resolve)
  })

  log(`[ModelibrDesktop][edge] Listening on http://${bindHost}:${appPort}`)

  return {
    async close() {
      await new Promise(resolve => server.close(resolve))
    },
  }
}
