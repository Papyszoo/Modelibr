const { contextBridge, ipcRenderer } = require('electron')

// Minimal, sandbox-safe bridge for the status window. The renderer never
// touches Node or Electron internals directly — every action is an IPC call
// the main process validates and performs.
contextBridge.exposeInMainWorld('modelibr', {
  getStatus: () => ipcRenderer.invoke('modelibr:get-status'),
  openFrontend: () => ipcRenderer.invoke('modelibr:open-frontend'),
  copyFrontendUrl: () => ipcRenderer.invoke('modelibr:copy-frontend-url'),
  openDataFolder: () => ipcRenderer.invoke('modelibr:open-data-folder'),
  installClient: () => ipcRenderer.invoke('modelibr:install-client'),
  getConfig: () => ipcRenderer.invoke('modelibr:get-config'),
  saveConfig: patch => ipcRenderer.invoke('modelibr:save-config', patch),
  restart: () => ipcRenderer.invoke('modelibr:restart'),
  quit: () => ipcRenderer.invoke('modelibr:quit'),
})
