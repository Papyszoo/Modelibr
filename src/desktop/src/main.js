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
import { loadRuntimeConfig } from './runtimeConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Placeholder until the standalone desktop client gets its own release asset.
const DESKTOP_CLIENT_URL = 'https://github.com/Papyszoo/Modelibr/releases'

let tray = null
let statusWindow = null
let edgeServer = null
let runtimeManager = null
let isShuttingDown = false
let isQuitting = false

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

  return Menu.buildFromTemplate([
    { label: `Modelibr — ${phaseLabel}`, enabled: false },
    { type: 'separator' },
    { label: 'Show Status', click: () => showStatusWindow() },
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
      label: 'Restart',
      click: () => {
        app.relaunch()
        app.quit()
      },
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
    height: 470,
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

  ipcMain.handle('modelibr:install-client', () => {
    void shell.openExternal(DESKTOP_CLIENT_URL)
  })

  ipcMain.handle('modelibr:restart', () => {
    app.relaunch()
    app.quit()
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

  registerIpc()
  createTray()
  createStatusWindow()
  showStatusWindow()

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
