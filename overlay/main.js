/**
 * MemoryGraph Live Overlay — Electron app that mimics Cluely's architecture.
 *
 * Features:
 * - Transparent always-on-top floating window
 * - System audio capture (from Zoom/Meet/any call)
 * - Real-time transcription via OpenAI Whisper
 * - Memory-backed AI suggestions via MemoryGraph daemon
 * - Auto-captures everything into the knowledge graph
 * - Stealth mode (click-through, nearly invisible)
 *
 * Architecture mirrors Cluely:
 * - Electron main process handles audio capture + transcription
 * - Renderer shows the overlay UI
 * - MemoryGraph daemon provides the intelligence layer
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, Tray, Menu } = require("electron");
const path = require("path");

let overlay = null;
let tray = null;
let isVisible = true;
let isStealthMode = false;

const DAEMON_URL = process.env.MEMORYGRAPH_URL || "http://127.0.0.1:3033";

app.whenReady().then(() => {
  createOverlay();
  createTray();
  registerShortcuts();
  console.log("[overlay] MemoryGraph Live Overlay started");
  console.log("[overlay] Ctrl+Shift+M to toggle visibility");
  console.log("[overlay] Ctrl+Shift+S to toggle stealth mode");
});

function createOverlay() {
  overlay = new BrowserWindow({
    width: 420,
    height: 600,
    x: 50,
    y: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  overlay.loadFile(path.join(__dirname, "overlay.html"));
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Make click-through in stealth mode
  overlay.setIgnoreMouseEvents(false);

  if (process.argv.includes("--dev")) {
    overlay.webContents.openDevTools({ mode: "detach" });
  }
}

function createTray() {
  // Tray icon (uses a built-in Electron icon as placeholder)
  tray = new Tray(path.join(__dirname, "icon.png").replace("icon.png", ""));
  if (!tray) return; // Skip tray if no icon

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show/Hide Overlay", click: toggleVisibility },
    { label: "Stealth Mode", click: toggleStealth, type: "checkbox", checked: false },
    { type: "separator" },
    { label: "Open Dashboard", click: () => require("electron").shell.openExternal("http://localhost:3033") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  try {
    tray.setContextMenu(contextMenu);
    tray.setToolTip("MemoryGraph Live");
  } catch {
    // Tray creation may fail without icon
  }
}

function registerShortcuts() {
  // Toggle overlay visibility
  globalShortcut.register("CommandOrControl+Shift+M", toggleVisibility);
  // Toggle stealth mode
  globalShortcut.register("CommandOrControl+Shift+S", toggleStealth);
  // Quick capture clipboard
  globalShortcut.register("CommandOrControl+Shift+C", captureClipboard);
}

function toggleVisibility() {
  if (isVisible) {
    overlay.hide();
  } else {
    overlay.show();
  }
  isVisible = !isVisible;
}

function toggleStealth() {
  isStealthMode = !isStealthMode;
  if (isStealthMode) {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setOpacity(0.3);
    overlay.webContents.send("stealth-mode", true);
  } else {
    overlay.setIgnoreMouseEvents(false);
    overlay.setOpacity(1.0);
    overlay.webContents.send("stealth-mode", false);
  }
}

async function captureClipboard() {
  const { clipboard } = require("electron");
  const text = clipboard.readText();
  if (text && text.length >= 8) {
    try {
      await fetch(`${DAEMON_URL}/api/v1/capture/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "clipboard", title: "Quick capture (hotkey)" }),
      });
      overlay.webContents.send("capture-success", "Clipboard captured");
    } catch {
      overlay.webContents.send("capture-error", "Daemon not running");
    }
  }
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle("get-audio-sources", async () => {
  const sources = await desktopCapturer.getSources({ types: ["window", "screen"] });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

ipcMain.handle("query-memory", async (_event, dialogue) => {
  try {
    const res = await fetch(`${DAEMON_URL}/api/v1/cluely/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dialogue }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Daemon not running" };
  }
});

ipcMain.handle("get-system-prompt", async (_event, dialogue) => {
  try {
    const res = await fetch(`${DAEMON_URL}/api/v1/cluely/system-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dialogue }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Daemon not running" };
  }
});

ipcMain.handle("ingest-transcript", async (_event, text, source) => {
  try {
    const res = await fetch(`${DAEMON_URL}/api/v1/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: source || "overlay", title: "Live transcript capture" }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Daemon not running" };
  }
});

ipcMain.handle("get-health", async () => {
  try {
    const res = await fetch(`${DAEMON_URL}/api/health`);
    return await res.json();
  } catch {
    return { ok: false, error: "Daemon not running" };
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
