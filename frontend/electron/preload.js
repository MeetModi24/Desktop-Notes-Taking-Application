const { contextBridge } = require("electron");

// Expose safe APIs to the renderer (React)
contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => "pong",
});
