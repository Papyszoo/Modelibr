const { contextBridge, ipcRenderer } = require('electron')

// Bridge used only by the local connection/settings page (connect.html). The
// remote Modelibr frontend itself runs without this API.
contextBridge.exposeInMainWorld('client', {
  getHostUrl: () => ipcRenderer.invoke('client:get-host-url'),
  connect: hostUrl => ipcRenderer.invoke('client:connect', hostUrl),
  retry: () => ipcRenderer.invoke('client:retry'),
})
