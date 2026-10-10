// The page's only door into the app: one function that asks the main process to show its native folder dialog.
// Loaded by the sandboxed window as `preload.cjs` (copied next to `main.js` by the build). It must stay CommonJS:
// a sandboxed preload cannot be an ES module.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('opencrawDesktop', {
  chooseFolder: () => ipcRenderer.invoke('opencraw:choose-folder'),
})
