// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  resizeWindow: (mode) => ipcRenderer.send("resize-window", mode),
});
