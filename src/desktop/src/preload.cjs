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
  getClientStatus: () => ipcRenderer.invoke('modelibr:client-status'),
  openClient: () => ipcRenderer.invoke('modelibr:open-client'),
  onInstallProgress: callback => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('modelibr:install-progress', listener)
    return () => ipcRenderer.removeListener('modelibr:install-progress', listener)
  },
  getConfig: () => ipcRenderer.invoke('modelibr:get-config'),
  saveConfig: patch => ipcRenderer.invoke('modelibr:save-config', patch),
  chooseDataFolder: () => ipcRenderer.invoke('modelibr:choose-data-folder'),
  getUpdate: () => ipcRenderer.invoke('modelibr:get-update'),
  checkUpdate: () => ipcRenderer.invoke('modelibr:check-update'),
  openUpdate: () => ipcRenderer.invoke('modelibr:open-update'),
  restart: () => ipcRenderer.invoke('modelibr:restart'),
  quit: () => ipcRenderer.invoke('modelibr:quit'),
})
