import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  clipboard,
  dialog,
  ipcMain,
  screen,
  shell,
} from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

import { startEdgeServer } from './edgeServer.js'
import { ProcessManager } from './processManager.js'
import { loadRuntimeConfig, saveRuntimeConfig } from './runtimeConfig.js'
import { UpdateManager } from './updateManager.js'
import { installClient, CLIENT_RELEASES_URL } from './clientInstaller.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The desktop client ships as its own installer in the same GitHub release.
const DESKTOP_CLIENT_URL = CLIENT_RELEASES_URL
// One client install at a time — re-entry would download/launch twice.
let clientInstallInFlight = false

// Bounds advertised to the configuration UI (saveRuntimeConfig clamps to these).
const CONFIG_BOUNDS = {
  appPort: { min: 1024, max: 65535 },
  internalApiPort: { min: 1024, max: 65535 },
  postgresPort: { min: 1024, max: 65535 },
  workerProcessCount: { min: 1, max: 16 },
  maxConcurrentJobsPerWorker: { min: 1, max: 16 },
}

// Settings that only take effect on a full restart (vs. worker-pool recycle).
const RESTART_REQUIRED_KEYS = [
  'appPort',
  'internalApiPort',
  'postgresPort',
  'dataDirectory',
]

let tray = null
let statusWindow = null
let edgeServer = null
let runtimeManager = null
let runtimeConfigPath = null
let updateManager = null
let isShuttingDown = false
let isQuitting = false
// Guards against re-entrant restarts: calling app.relaunch()/quit() twice spawns
// duplicate instances and crashes the app. Once a restart is in flight every
// further request is a no-op.
let isRestarting = false

// 'starting' until every service is up, then 'ready'; 'error' if boot fails.
let bootPhase = 'starting'
let bootError = null

function runtimeLog(message, details) {
  if (details === undefined) {
    console.log(message)
    return
  }

  console.log(message, details)
}

function resolveRuntimeDirectory() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime')
  }

  return path.join(app.getAppPath(), 'build', 'runtime')
}

function snapshot() {
  return runtimeManager ? runtimeManager.buildRuntimeSnapshot() : null
}

// ── Tray ──────────────────────────────────────────────────────────────────

function createTray() {
  // Headless environments (e.g. CI under xvfb, or Linux desktops without a
  // StatusNotifier host) can't create a tray. That must not stop the host from
  // serving the app, so callers treat a failure here as non-fatal.
  const image = nativeImage
    .createFromPath(path.join(__dirname, 'assets', 'tray.png'))
    .resize({ width: 18, height: 18 })
  image.setTemplateImage(false)

  tray = new Tray(image)
  tray.setToolTip('Modelibr')

  if (process.platform === 'linux') {
    // AppIndicator-based trays don't emit click events reliably, so the menu
    // (which includes "Show Status") is the only dependable affordance.
    tray.setContextMenu(buildTrayMenu())
  } else {
    tray.on('click', () => toggleStatusWindow())
    tray.on('right-click', () => tray?.popUpContextMenu(buildTrayMenu()))
  }

  refreshTray()
}

function buildTrayMenu() {
  const ready = bootPhase === 'ready'
  const phaseLabel =
    bootPhase === 'ready'
      ? 'Running'
      : bootPhase === 'error'
        ? `Error: ${bootError ?? 'failed to start'}`
        : 'Starting…'

  const update = updateManager?.state
  let updateItem
  if (update?.status === 'downloaded') {
    updateItem = {
      label: `Restart & Install v${update.latestVersion}`,
      click: () => updateManager?.install(),
    }
  } else if (update?.status === 'downloading') {
    updateItem = {
      label: `Downloading update… ${update.percent ?? 0}%`,
      enabled: false,
    }
  } else {
    updateItem = {
      label: update?.status === 'checking' ? 'Checking for updates…' : 'Check for Updates',
      enabled: update?.status !== 'checking',
      click: () => void updateManager?.check(),
    }
  }

  return Menu.buildFromTemplate([
    { label: `Modelibr — ${phaseLabel}`, enabled: false },
    { type: 'separator' },
    { label: 'Show Status', click: () => showStatusWindow() },
    updateItem,
    {
      label: 'Open in Browser',
      enabled: ready,
      click: () => openFrontend(),
    },
    {
      label: 'Install Desktop Client…',
      click: () => void shell.openExternal(DESKTOP_CLIENT_URL),
    },
    { type: 'separator' },
    {
      label: 'Open Data Folder',
      enabled: !!snapshot(),
      click: () => {
        const data = snapshot()?.dataDirectory
        if (data) void shell.openPath(data)
      },
    },
    {
      label: isRestarting ? 'Restarting…' : 'Restart',
      enabled: !isRestarting,
      click: () => performRestart(),
    },
    { type: 'separator' },
    { label: 'Quit Modelibr', click: () => app.quit() },
  ])
}

function refreshTray() {
  if (!tray) return
  const phaseLabel =
    bootPhase === 'ready'
      ? 'running'
      : bootPhase === 'error'
        ? 'error'
        : 'starting…'
  tray.setToolTip(`Modelibr — ${phaseLabel}`)

  // On Linux the menu is the live surface, so rebuild it to reflect the phase.
  if (process.platform === 'linux') {
    tray.setContextMenu(buildTrayMenu())
  }
}

// ── Status window ───────────────────────────────────────────────────────────

function createStatusWindow() {
  statusWindow = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    title: 'Modelibr',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  statusWindow.on('close', event => {
    // Closing the window only hides it — the tray host keeps running.
    if (!isQuitting) {
      event.preventDefault()
      statusWindow?.hide()
    }
  })

  void statusWindow.loadFile(path.join(__dirname, 'status.html'))
}

function positionStatusWindowNearTray() {
  if (!statusWindow || !tray) return

  const trayBounds = tray.getBounds()
  const winBounds = statusWindow.getBounds()

  // Fall back to a screen-centered position when the platform reports no
  // tray bounds (common on some Linux desktops).
  if (!trayBounds.width && !trayBounds.height) {
    statusWindow.center()
    return
  }

  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  })
  const workArea = display.workArea

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
  let y =
    process.platform === 'darwin'
      ? Math.round(trayBounds.y + trayBounds.height + 6)
      : Math.round(trayBounds.y - winBounds.height - 6)

  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - winBounds.width))
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - winBounds.height))

  statusWindow.setPosition(x, y, false)
}

function showStatusWindow() {
  if (!statusWindow) {
    createStatusWindow()
  }

  positionStatusWindowNearTray()
  statusWindow?.show()
  statusWindow?.focus()
}

function toggleStatusWindow() {
  if (statusWindow && statusWindow.isVisible()) {
    statusWindow.hide()
    return
  }

  showStatusWindow()
}

// ── Actions shared by IPC + tray ────────────────────────────────────────────

function openFrontend() {
  const url = snapshot()?.publicAppUrl
  if (url) void shell.openExternal(url)
}

// Idempotent restart. Returns whether this call initiated the restart so the UI
// can show "Restarting…" only once and disable the control.
function performRestart() {
  if (isRestarting) {
    return false
  }
  isRestarting = true
  refreshTray()
  app.relaunch()
  app.quit()
  return true
}

function registerIpc() {
  ipcMain.handle('modelibr:get-status', async () => {
    if (!runtimeManager || bootPhase === 'starting') {
      return { phase: bootPhase, error: bootError }
    }

    const status = await runtimeManager.probeStatus()
    return { phase: bootPhase, error: bootError, ...status }
  })

  ipcMain.handle('modelibr:open-frontend', () => openFrontend())

  ipcMain.handle('modelibr:copy-frontend-url', () => {
    const url = snapshot()?.publicAppUrl
    if (url) clipboard.writeText(url)
  })

  ipcMain.handle('modelibr:open-data-folder', () => {
    const data = snapshot()?.dataDirectory
    if (data) void shell.openPath(data)
  })

  ipcMain.handle('modelibr:install-client', async () => {
    if (clientInstallInFlight) {
      return { ok: false, reason: 'in-progress' }
    }
    clientInstallInFlight = true

    const sendProgress = progress =>
      statusWindow?.webContents.send('modelibr:install-progress', progress)

    try {
      return await installClient({
        onProgress: sendProgress,
        openPath: target => shell.openPath(target),
        openExternal: url => shell.openExternal(url),
        log: runtimeLog,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      runtimeLog('[ModelibrDesktop] Client install failed', { error: message })
      sendProgress({ phase: 'error', percent: 0, message })
      // Leave the user a manual path when the automated install can't proceed.
      void shell.openExternal(DESKTOP_CLIENT_URL)
      return { ok: false, reason: 'error', error: message }
    } finally {
      clientInstallInFlight = false
    }
  })

  ipcMain.handle('modelibr:get-update', () => updateManager?.state ?? null)

  ipcMain.handle('modelibr:check-update', async () => {
    await updateManager?.check()
    return updateManager?.state ?? null
  })

  ipcMain.handle('modelibr:open-update', () => {
    updateManager?.install()
  })

  ipcMain.handle('modelibr:get-config', () => {
    if (!runtimeManager) {
      return null
    }

    const { config } = runtimeManager
    return {
      bounds: CONFIG_BOUNDS,
      // The effective data path (config.dataDirectory may be blank → default);
      // shown to the user as the active/placeholder location.
      effectiveDataDirectory: snapshot()?.dataDirectory ?? '',
      config: {
        appPort: config.appPort,
        internalApiPort: config.internalApiPort,
        postgresPort: config.postgresPort,
        workerProcessCount: config.workerProcessCount,
        maxConcurrentJobsPerWorker: config.maxConcurrentJobsPerWorker,
        enableHardwareAcceleration: config.enableHardwareAcceleration,
        dataDirectory: config.dataDirectory,
      },
    }
  })

  ipcMain.handle('modelibr:save-config', async (_event, patch) => {
    if (!runtimeManager || !runtimeConfigPath) {
      return { ok: false }
    }

    const previous = runtimeManager.config
    const saved = await saveRuntimeConfig(runtimeConfigPath, {
      ...previous,
      ...patch,
    })
    runtimeManager.updateConfig(saved)

    // Ports and the data folder need a full restart; worker-only changes can be
    // applied live by recycling the worker pool.
    const restartRequired = RESTART_REQUIRED_KEYS.some(
      key => saved[key] !== previous[key]
    )
    const workersChanged =
      saved.workerProcessCount !== previous.workerProcessCount ||
      saved.maxConcurrentJobsPerWorker !== previous.maxConcurrentJobsPerWorker ||
      saved.enableHardwareAcceleration !== previous.enableHardwareAcceleration

    if (workersChanged && !restartRequired) {
      await runtimeManager.restartWorkers()
    }

    return { ok: true, restartRequired, config: saved }
  })

  ipcMain.handle('modelibr:choose-data-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Modelibr data folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('modelibr:restart', () => {
    const started = performRestart()
    return { ok: true, started, alreadyRestarting: !started }
  })

  ipcMain.handle('modelibr:quit', () => {
    app.quit()
  })
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

async function shutdown() {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true

  try {
    if (edgeServer) {
      await edgeServer.close()
      edgeServer = null
    }

    if (runtimeManager) {
      await runtimeManager.stop()
      runtimeManager = null
    }
  } finally {
    isShuttingDown = false
  }
}

async function bootstrap() {
  // Menu-bar / tray app — no persistent dock presence on macOS.
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
  Menu.setApplicationMenu(null)

  const runtimeDir = resolveRuntimeDirectory()
  const { config, configPath } = await loadRuntimeConfig(app.getPath('userData'))
  runtimeConfigPath = configPath

  updateManager = new UpdateManager({
    log: runtimeLog,
    onChange: () => refreshTray(),
  })

  registerIpc()
  try {
    createTray()
  } catch (error) {
    runtimeLog('[ModelibrDesktop] Tray unavailable — continuing headless', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  createStatusWindow()
  showStatusWindow()

  // Non-blocking: surfaces a newer release in the tray + status window if found.
  void updateManager.check()

  runtimeManager = new ProcessManager({
    runtimeDir,
    userDataDir: app.getPath('userData'),
    config,
    log: runtimeLog,
  })

  try {
    await runtimeManager.start()
    edgeServer = await startEdgeServer({
      runtimeDir,
      configPath,
      runtimeManager,
      log: runtimeLog,
    })

    bootPhase = 'ready'
    bootError = null
  } catch (error) {
    bootPhase = 'error'
    bootError = error instanceof Error ? error.message : String(error)
    runtimeLog('[ModelibrDesktop] Boot failed', { error: bootError })

    await dialog.showMessageBox({
      type: 'error',
      title: 'Modelibr Failed To Start',
      message: bootError,
    })
  } finally {
    refreshTray()
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showStatusWindow()
  })

  app.whenReady()
    .then(bootstrap)
    .catch(async error => {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Modelibr Failed To Start',
        message: error instanceof Error ? error.message : String(error),
      })
      await shutdown()
      app.exit(1)
    })
}

// Tray app: closing the status window must not quit the host.
app.on('window-all-closed', () => {})

app.on('before-quit', event => {
  isQuitting = true

  if (isShuttingDown) {
    return
  }

  event.preventDefault()
  void shutdown().finally(() => app.exit(0))
})
