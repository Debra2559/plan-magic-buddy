const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

const APP_URL = process.env.SYLVA_APP_URL || "https://plan-magic-buddy.lovable.app";

let mainWindow = null;

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: "Sylva 日历",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0f1210",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  mainWindow.loadURL(`${APP_URL}/calendar`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );

  app.on("activate", () => createMainWindow());
});

app.on("window-all-closed", () => {
  app.quit();
});
