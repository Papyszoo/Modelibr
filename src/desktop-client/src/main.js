import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

import { loadClientConfig, saveClientConfig } from './clientConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
