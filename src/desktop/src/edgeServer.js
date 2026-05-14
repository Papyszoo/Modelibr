import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import http from 'http'
import path from 'path'

import { sanitizeRuntimeConfig, saveRuntimeConfig } from './runtimeConfig.js'

export async function startEdgeServer({ runtimeDir, configPath, runtimeManager, log = console.log }) {
  const app = express()
  const backendBaseUrl = `http://127.0.0.1:${runtimeManager.config.internalApiPort}`
  const frontendDir = path.join(runtimeDir, 'frontend')

  app.disable('x-powered-by')
  app.use(express.json())

  app.get('/api/native/runtime', (_request, response) => {
    response.json(runtimeManager.buildRuntimeSnapshot())
  })

  app.put('/api/native/runtime', async (request, response) => {
    const nextConfig = sanitizeRuntimeConfig({
      ...runtimeManager.config,
      ...request.body,
    })

    const restartRequired = nextConfig.appPort !== runtimeManager.config.appPort
    const workerSettingsChanged =
      nextConfig.workerProcessCount !== runtimeManager.config.workerProcessCount ||
      nextConfig.maxConcurrentJobsPerWorker !== runtimeManager.config.maxConcurrentJobsPerWorker ||
      nextConfig.enableHardwareAcceleration !== runtimeManager.config.enableHardwareAcceleration

    const savedConfig = await saveRuntimeConfig(configPath, nextConfig)
    runtimeManager.updateConfig(savedConfig)

    if (workerSettingsChanged && !restartRequired) {
      await runtimeManager.restartWorkers()
    }

    response.json({
      restartRequired,
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

  app.use(express.static(frontendDir, { index: false }))
  app.get('*', (_request, response) => {
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

  await new Promise((resolve, reject) => {
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${runtimeManager.config.appPort} is already in use.\n\nChange it in Settings > Native Runtime and restart Modelibr.`
        ))
      } else {
        reject(err)
      }
    })
    server.listen(runtimeManager.config.appPort, '127.0.0.1', resolve)
  })

  log(`[ModelibrDesktop][edge] Listening on http://127.0.0.1:${runtimeManager.config.appPort}`)

  return {
    async close() {
      await new Promise(resolve => server.close(resolve))
    },
  }
}
