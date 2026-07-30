const { app, BrowserWindow, Tray, Menu, shell, nativeImage, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const APP_URL = process.env.SYLVA_APP_URL || "https://plan-magic-buddy.lovable.app";
const STORE = path.join(app.getPath("userData"), "widgets.json");

let mainWindow = null;
let tray = null;
/** @type {Map<string, BrowserWindow>} */
const widgets = new Map();

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return { widgets: [] };
  }
}
function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(state, null, 2));
  } catch {}
}
function persistWidgets() {
  const list = [];
  for (const [id, win] of widgets) {
    if (win.isDestroyed()) continue;
    const b = win.getBounds();
    list.push({ id, kind: id.split(":")[0], ...b });
  }
  writeState({ widgets: list });
}

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

function createWidget(kind, bounds) {
  const id = `${kind}:${Date.now()}`;
  const display = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: bounds?.width ?? 320,
    height: bounds?.height ?? 380,
    x: bounds?.x ?? display.x + display.width - 360,
    y: bounds?.y ?? display.y + 40,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    vibrancy: "under-window",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(`${APP_URL}/widget?kind=${encodeURIComponent(kind)}`);
  win.on("moved", persistWidgets);
  win.on("resized", persistWidgets);
  win.on("closed", () => {
    widgets.delete(id);
    persistWidgets();
    refreshTray();
  });
  widgets.set(id, win);
  persistWidgets();
  refreshTray();
  return win;
}

function restoreWidgets() {
  const state = readState();
  for (const w of state.widgets ?? []) {
    createWidget(w.kind ?? "today", w);
  }
}

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, "trayTemplate.png"));
  if (!img.isEmpty()) {
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createEmpty();
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 Sylva 日历", click: createMainWindow },
      { type: "separator" },
      { label: "添加桌面组件", enabled: false },
      { label: "· 今日待办", click: () => createWidget("today") },
      { label: "· 接下来的日程", click: () => createWidget("agenda") },
      { label: "· 关键节点倒计时", click: () => createWidget("milestones") },
      { type: "separator" },
      {
        label: `关闭全部组件 (${widgets.size})`,
        enabled: widgets.size > 0,
        click: () => {
          for (const win of [...widgets.values()]) if (!win.isDestroyed()) win.close();
        },
      },
      { type: "separator" },
      { label: "退出", role: "quit" },
    ]),
  );
}

app.whenReady().then(() => {
  createMainWindow();
  tray = new Tray(trayIcon());
  tray.setToolTip("Sylva 日历");
  refreshTray();
  restoreWidgets();

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      {
        label: "组件",
        submenu: [
          { label: "添加：今日待办", click: () => createWidget("today") },
          { label: "添加：接下来的日程", click: () => createWidget("agenda") },
          { label: "添加：关键节点倒计时", click: () => createWidget("milestones") },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );

  app.on("activate", () => createMainWindow());
});

app.on("window-all-closed", () => {
  // 保持常驻菜单栏，桌面组件继续显示
});
