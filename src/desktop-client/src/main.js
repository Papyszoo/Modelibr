import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import electronUpdater from 'electron-updater'

import { loadClientConfig, saveClientConfig } from './clientConfig.js'

const { autoUpdater } = electronUpdater
const __dirname = path.dirname(fileURLToPath(import.meta.url))

let updateHandlersWired = false

// Opt-in auto-update: we check on launch, but a new build is only downloaded and
// installed when the user agrees — first "Download", then "Restart & Install". A
// user may have reasons to stay on a stable build, so nothing happens behind
// their back. Handlers are wired once; checkForUpdates() can be called repeatedly
// (launch + the "Check for Updates…" menu item).
function wireUpdateHandlers() {
  if (updateHandlersWired) {
    return
  }
  updateHandlersWired = true

  // The host and client ship in the same GitHub repo/release. electron-updater's
  // default feed file is latest.yml for both, which would collide. Put the
  // client on its own channel so it fetches client*.yml (the release workflow
  // renames the client's feed to match); the host keeps the default latest*.yml.
  autoUpdater.channel = 'client'
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', info => {
    const version = info?.version ? ` (v${info.version})` : ''
    void dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: `A new version of Modelibr Client${version} is available.`,
        detail: 'Download it now? Nothing installs until you choose to restart.',
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate().catch(error => {
            console.error('[ModelibrClient][update]', error)
            void dialog.showMessageBox({
              type: 'error',
              message: 'Update download failed',
              detail: error instanceof Error ? error.message : String(error),
            })
          })
        }
      })
  })

  autoUpdater.on('update-downloaded', info => {
    const version = info?.version ? ` (v${info.version})` : ''
    void dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart & Install', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: `Modelibr Client${version} is ready to install.`,
        detail: 'The app will restart to finish updating.',
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', error => {
    console.error('[ModelibrClient][update]', error)
  })
}

// Safe no-op in dev (unpackaged). Errors never block the client.
function checkForUpdates({ notifyNoUpdate = false } = {}) {
  if (!app.isPackaged) {
    if (notifyNoUpdate) {
      void dialog.showMessageBox({
        type: 'info',
        message: 'Updates are only available in the installed app.',
      })
    }
    return
  }

  wireUpdateHandlers()

  if (notifyNoUpdate) {
    autoUpdater.once('update-not-available', () =>
      dialog.showMessageBox({ type: 'info', message: 'Modelibr Client is up to date.' })
    )
  }

  autoUpdater.checkForUpdates().catch(error => {
    console.error('[ModelibrClient][update]', error)
    if (notifyNoUpdate) {
      void dialog.showMessageBox({
        type: 'error',
        message: 'Update check failed',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

let mainWindow = null
let hostUrl = null
let configPath = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open external (target=_blank / cross-origin) links in the real browser
  // rather than spawning app windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // If the host isn't reachable, fall back to the local connection page so the
  // user can retry or point the client at a different host.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, validatedUrl) => {
    // -3 (ABORTED) fires for ordinary in-app navigations; ignore it.
    if (errorCode === -3) return
    if (validatedUrl && validatedUrl.startsWith('file://')) return
    showConnectionPage({ failed: true })
  })

  loadHost()
}

function loadHost() {
  void mainWindow?.loadURL(hostUrl)
}

function showConnectionPage({ failed = false } = {}) {
  void mainWindow?.loadFile(path.join(__dirname, 'connect.html'), {
    query: { host: hostUrl, failed: failed ? '1' : '0' },
  })
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }]
      : []),
    {
      label: 'Modelibr',
      submenu: [
        { label: 'Open Modelibr', accelerator: 'CmdOrCtrl+Home', click: () => loadHost() },
        { label: 'Connection Settings…', click: () => showConnectionPage() },
        {
          label: 'Open in Browser',
          click: () => void shell.openExternal(hostUrl),
        },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => checkForUpdates({ notifyNoUpdate: true }) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc() {
  ipcMain.handle('client:get-host-url', () => hostUrl)

  ipcMain.handle('client:connect', async (_event, nextUrl) => {
    const saved = await saveClientConfig(configPath, { hostUrl: nextUrl })
    hostUrl = saved.hostUrl
    loadHost()
    return hostUrl
  })

  ipcMain.handle('client:retry', () => {
    loadHost()
  })
}

async function bootstrap() {
  const { config, configPath: resolvedPath } = await loadClientConfig(
    app.getPath('userData')
  )
  hostUrl = config.hostUrl
  configPath = resolvedPath

  registerIpc()
  buildMenu()
  createWindow()
  checkForUpdates()
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(bootstrap)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})
