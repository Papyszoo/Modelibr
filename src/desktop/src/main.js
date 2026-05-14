import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

import { startEdgeServer } from './edgeServer.js'
import { ProcessManager } from './processManager.js'
import { loadRuntimeConfig } from './runtimeConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null
let edgeServer = null
let runtimeManager = null
let isShuttingDown = false

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

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void mainWindow.loadFile(path.join(__dirname, 'loading.html'))
}

function buildApplicationMenu() {
  const template = [
    {
      label: 'Modelibr',
      submenu: [
        {
          label: 'Open In Browser',
          click: () => {
            if (!runtimeManager) {
              return
            }

            void shell.openExternal(runtimeManager.buildRuntimeSnapshot().publicAppUrl)
          },
        },
        {
          label: 'Open Data Folder',
          click: () => {
            if (!runtimeManager) {
              return
            }

            void shell.openPath(runtimeManager.buildRuntimeSnapshot().dataDirectory)
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
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'togglefullscreen' }],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

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
  const runtimeDir = resolveRuntimeDirectory()
  const { config, configPath } = await loadRuntimeConfig(app.getPath('userData'))

  createMainWindow()
  buildApplicationMenu()

  runtimeManager = new ProcessManager({
    runtimeDir,
    userDataDir: app.getPath('userData'),
    config,
    log: runtimeLog,
  })

  await runtimeManager.start()
  edgeServer = await startEdgeServer({
    runtimeDir,
    configPath,
    runtimeManager,
    log: runtimeLog,
  })

  void mainWindow?.loadURL(`http://127.0.0.1:${config.appPort}`)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }

      mainWindow.focus()
    }
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', event => {
  if (isShuttingDown) {
    return
  }

  event.preventDefault()
  void shutdown().finally(() => app.exit(0))
})

app.on('activate', () => {
  if (!mainWindow && runtimeManager) {
    createMainWindow()
    void mainWindow?.loadURL(`http://127.0.0.1:${runtimeManager.config.appPort}`)
  }
})
