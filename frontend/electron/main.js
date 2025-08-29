// electron/main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // In dev, load Vite dev server; in prod, load built files
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// IPC handler for resizing
ipcMain.on("resize-window", (_, size) => {
  if (!mainWindow) return;
  if (size === "compact") {
    mainWindow.setSize(400, 300);
  } else if (size === "expanded") {
    mainWindow.setSize(1200, 800);
  }
});

app.on("ready", createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
