const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createLogger } = require('./logger');
const { createStatsReader } = require('./stats');
const nvidiaPerf = require('./nvidia-perf');
const { createPresentMonCapture, resolvePresentMonPath } = require('./presentmon');

const SAMPLE_INTERVAL_MS = 2000;
const OVERLAY_BASE_WIDTH = 340;
const OVERLAY_BASE_HEIGHT = 490;
const OVERLAY_MIN_WIDTH = 300;
const OVERLAY_Z_ORDER_INTERVAL_MS = 1000;
const SHUTDOWN_TIMEOUT_MS = 8000;
const FATAL_DIALOG_TIMEOUT_MS = 30000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const readStats = createStatsReader();
const logger = createLogger({ fallbackDirectory: path.join(process.cwd(), 'logs') });

let mainWindow;
let statsTimer;
let overlayZOrderTimer;
let updateCheckTimer;
let statsInFlight = false;
let shutdownTimer;
let fatalDialogTimer;
let currentMode = 'full';
let fullscreenRestoreBounds = null;
let pinned = false;
let overlayAboveGames = false;
let overlayAnchor = 'top-right';
let isQuitting = false;
let isShuttingDown = false;
let fatalDialogOpen = false;
let appExitCode = 0;
let isWindowClosing = false;
let initialHardwareSampleLogged = false;
let currentUpdateState = { status: 'idle' };
let frameCapture;
let autoOverlay = false;
let gameActive = false;

function applyAutoOverlay() {
  if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'overlay') return;
  if (!autoOverlay || gameActive) {
    if (!mainWindow.isVisible()) mainWindow.showInactive();
  } else if (mainWindow.isVisible()) {
    mainWindow.hide();
  }
}
let overlayEditMode = false;
let overlayCustomPosition = null;

function initializeLogging() {
  const userData = app.getPath('userData');
  return logger.initialize({
    defaultDirectory: path.join(userData, 'logs'),
    settingsPath: path.join(userData, 'settings', 'logging.json'),
  });
}

function stopBackgroundWork() {
  isQuitting = true;
  frameCapture?.stop();
  nvidiaPerf.stop();
  clearTimeout(statsTimer);
  clearInterval(overlayZOrderTimer);
  clearInterval(updateCheckTimer);
  statsTimer = null;
  overlayZOrderTimer = null;
  updateCheckTimer = null;
}

function requestShutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  appExitCode = Math.max(appExitCode, exitCode);
  stopBackgroundWork();
  app.quit();
}

function showFatalError(message, details, { canReload = false } = {}) {
  logger.writeSync('fatal', message, details);
  stopBackgroundWork();
  appExitCode = 1;
  if (fatalDialogOpen) return;
  fatalDialogOpen = true;

  const buttons = canReload
    ? ['Reload dashboard', 'Open log folder and close', 'Close app']
    : ['Open log folder', 'Close app'];
  const options = {
    type: 'error',
    title: 'SalsaStats encountered a problem',
    message: 'SalsaStats cannot continue safely.',
    detail: `${message}\n\nLog folder: ${logger.getDirectory()}`,
    buttons,
    defaultId: buttons.length - 1,
    cancelId: buttons.length - 1,
    noLink: true,
  };
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  let dialogPromise;
  try {
    dialogPromise = owner
      ? dialog.showMessageBox(owner, options)
      : dialog.showMessageBox(options);
  } catch (error) {
    logger.writeSync('error', 'Unable to display the error dialog.', error);
    requestShutdown(1);
    return;
  }

  fatalDialogTimer = setTimeout(() => requestShutdown(1), FATAL_DIALOG_TIMEOUT_MS);
  dialogPromise.then(async ({ response }) => {
    clearTimeout(fatalDialogTimer);
    if (canReload && response === 0) {
      fatalDialogOpen = false;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
      isQuitting = false;
      if (!statsInFlight) sampleStats();
      return;
    }

    const openLogIndex = canReload ? 1 : 0;
    if (response === openLogIndex) {
      try {
        const openError = await shell.openPath(logger.getDirectory());
        if (openError) logger.writeSync('error', 'Unable to open the log folder.', openError);
      } catch (error) {
        logger.writeSync('error', 'Unable to open the log folder.', error);
      }
    }
    requestShutdown(1);
  }).catch(error => {
    clearTimeout(fatalDialogTimer);
    logger.writeSync('error', 'Unable to display the error dialog.', error);
    requestShutdown(1);
  });
}

function isTrustedRenderer(event) {
  return mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
}

function parseLogLine(line) {
  try {
    const record = JSON.parse(line);
    const details = record.details === undefined ? '' : JSON.stringify(record.details).slice(0, 400);
    return { time: record.timestamp, level: record.level, message: record.message, details };
  } catch {
    return { time: null, level: 'info', message: line, details: '' };
  }
}

// Returns whole log lines written after `offset` (or the recent tail on the first call).
function readLogTail(offset) {
  const MAX_BYTES = 256 * 1024;
  const INITIAL_BYTES = 64 * 1024;
  let size;
  try {
    size = fs.statSync(logger.getLogFilePath()).size;
  } catch {
    return { offset: 0, entries: [] };
  }
  const resume = Number.isFinite(offset) && offset >= 0 && offset <= size;
  let start = resume ? offset : Math.max(0, size - INITIAL_BYTES);
  if (size - start > MAX_BYTES) start = size - MAX_BYTES;
  if (size === start) return { offset: size, entries: [] };

  const buffer = Buffer.alloc(size - start);
  const descriptor = fs.openSync(logger.getLogFilePath(), 'r');
  try {
    fs.readSync(descriptor, buffer, 0, buffer.length, start);
  } finally {
    fs.closeSync(descriptor);
  }
  const lastNewline = buffer.lastIndexOf(0x0a);
  if (lastNewline < 0) return { offset: start, entries: [] };

  let lines = buffer.subarray(0, lastNewline + 1).toString('utf8').split('\n').filter(Boolean);
  if (!resume && start > 0) lines = lines.slice(1);
  return { offset: start + lastNewline + 1, entries: lines.map(parseLogLine) };
}

function listDirectory(directory) {
  if (!directory) {
    const entries = [];
    for (let code = 67; code <= 90; code += 1) {
      const root = `${String.fromCharCode(code)}:\\`;
      if (fs.existsSync(root)) entries.push({ name: root, type: 'dir', path: root });
    }
    ['desktop', 'documents', 'downloads'].forEach(key => {
      try {
        entries.push({ name: key[0].toUpperCase() + key.slice(1), type: 'dir', path: app.getPath(key) });
      } catch {
        // Folder not available on this machine.
      }
    });
    return { path: '', parent: null, entries };
  }

  const resolved = path.resolve(String(directory));
  const parent = resolved === path.parse(resolved).root ? '' : path.dirname(resolved);
  const entries = [];
  for (const item of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (item.isDirectory()) entries.push({ name: item.name, type: 'dir', path: path.join(resolved, item.name) });
    else if (item.isFile() && /\.exe$/i.test(item.name)) entries.push({ name: item.name, type: 'exe', path: path.join(resolved, item.name) });
    if (entries.length >= 3000) break;
  }
  entries.sort((a, b) => (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1)
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { path: resolved, parent, entries };
}

// Finds one likely game executable (the largest non-installer .exe) per subfolder of `root`.
function scanGames(root) {
  const SKIP = /(unins|uninstall|crash|report|redist|vcredist|dxsetup|dotnet|setup|install|updater|helper|webview|easyanticheat|battleye|benchmark|prereq)/i;
  const MAX_ENTRIES = 20000;
  let visited = 0;
  let truncated = false;

  const collect = (directory, depth, found) => {
    let items;
    try {
      items = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (++visited > MAX_ENTRIES) {
        truncated = true;
        return;
      }
      const full = path.join(directory, item.name);
      if (item.isDirectory()) {
        if (depth < 5) collect(full, depth + 1, found);
      } else if (item.isFile() && /\.exe$/i.test(item.name) && !SKIP.test(item.name)) {
        try {
          found.push({ exe: item.name, path: full, size: fs.statSync(full).size });
        } catch {
          // Unreadable file; skip it.
        }
      }
    }
  };

  const games = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    if (truncated || games.length >= 300) break;
    if (!item.isDirectory()) continue;
    const found = [];
    collect(path.join(root, item.name), 1, found);
    if (!found.length) continue;
    const best = found.reduce((max, current) => (current.size > max.size ? current : max));
    games.push({ name: item.name, exe: best.exe, path: best.path });
  }
  return { games, truncated };
}

// Looks for installed games in Steam libraries, common game folders and Epic's manifests.
function detectGames() {
  const roots = new Set();
  const steamHomes = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
    .filter(Boolean)
    .map(base => path.join(base, 'Steam'));
  for (const steam of steamHomes) {
    roots.add(path.join(steam, 'steamapps', 'common'));
    try {
      const text = fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) {
        roots.add(path.join(match[1].replace(/\\\\/g, '\\'), 'steamapps', 'common'));
      }
    } catch {
      // Steam is not installed here.
    }
  }
  for (let code = 67; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (!fs.existsSync(drive)) continue;
    ['SteamLibrary\\steamapps\\common', 'Games', 'Epic Games', 'GOG Games', 'XboxGames'].forEach(relative => roots.add(path.join(drive, relative)));
  }

  const seen = new Set();
  const games = [];
  const add = game => {
    const key = game.exe.toLowerCase();
    if (seen.has(key) || /redist|steamworks|steamvr|proton|runtime/i.test(game.name)) return;
    seen.add(key);
    games.push(game);
  };
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      scanGames(root).games.forEach(add);
    } catch {
      // Unreadable library folder.
    }
  }

  const manifests = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  try {
    for (const file of fs.readdirSync(manifests)) {
      if (!file.endsWith('.item')) continue;
      const item = JSON.parse(fs.readFileSync(path.join(manifests, file), 'utf8'));
      if (item.LaunchExecutable && item.DisplayName) {
        add({ name: String(item.DisplayName), exe: path.basename(item.LaunchExecutable), path: path.join(item.InstallLocation || '', item.LaunchExecutable) });
      }
    }
  } catch {
    // Epic is not installed here.
  }
  return { games: games.slice(0, 300), truncated: false };
}

function registerLogHandlers() {
  ipcMain.handle('overlay:auto', (event, enabled, running) => {
    if (!isTrustedRenderer(event)) return false;
    autoOverlay = enabled === true;
    gameActive = running === true;
    applyAutoOverlay();
    return true;
  });

  ipcMain.handle('app:get-login', event => (isTrustedRenderer(event) ? app.getLoginItemSettings().openAtLogin : false));

  ipcMain.handle('app:set-login', (event, enabled) => {
    if (!isTrustedRenderer(event) || !app.isPackaged) return false;
    app.setLoginItemSettings({ openAtLogin: enabled === true });
    return true;
  });

  ipcMain.handle('clipboard:image', async (event, rect) => {
    if (!isTrustedRenderer(event) || !rect) return false;
    const area = ['x', 'y', 'width', 'height'].map(key => Math.round(Number(rect[key])));
    if (area.some(value => !Number.isFinite(value)) || area[2] < 1 || area[3] < 1) return false;
    try {
      const image = await mainWindow.webContents.capturePage({ x: area[0], y: area[1], width: area[2], height: area[3] });
      if (image.isEmpty()) return false;
      clipboard.writeImage(image);
      return true;
    } catch (error) {
      logger.writeSync('warn', 'Unable to copy an image.', error);
      return false;
    }
  });
  ipcMain.handle('games:detect', event => {
    if (!isTrustedRenderer(event)) return null;
    try {
      return detectGames();
    } catch (error) {
      logger.writeSync('warn', 'Unable to detect installed games.', error);
      return { games: [], truncated: false };
    }
  });

  ipcMain.handle('fs:scan', (event, directory) => {
    if (!isTrustedRenderer(event) || !directory) return null;
    try {
      return scanGames(path.resolve(String(directory)));
    } catch (error) {
      logger.writeSync('warn', 'Unable to scan a folder for games.', error);
      return { games: [], truncated: false };
    }
  });
  ipcMain.handle('fs:list', (event, directory) => {
    if (!isTrustedRenderer(event)) return null;
    try {
      return listDirectory(directory);
    } catch (error) {
      return { path: String(directory || ''), parent: '', entries: [], error: error.message };
    }
  });
  ipcMain.handle('clipboard:write', (event, text) => {
    if (!isTrustedRenderer(event) || typeof text !== 'string') return false;
    clipboard.writeText(text.slice(0, 1024 * 1024));
    return true;
  });
  ipcMain.handle('logs:tail', (event, offset) => {
    if (!isTrustedRenderer(event)) return null;
    try {
      return readLogTail(offset);
    } catch (error) {
      return { offset: 0, entries: [] };
    }
  });

  ipcMain.handle('logs:get-directory', event => {
    if (!isTrustedRenderer(event)) return null;
    return { directory: logger.getDirectory(), logFile: logger.getLogFilePath() };
  });

  ipcMain.handle('logs:choose-directory', async event => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Request not allowed.' };
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose SalsaStats log folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
      const directory = logger.setDirectory(result.filePaths[0]);
      return { ok: true, directory, logFile: logger.getLogFilePath() };
    } catch (error) {
      logger.writeSync('error', 'Unable to change the log folder.', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('logs:open-directory', async event => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Request not allowed.' };
    try {
      const error = await shell.openPath(logger.getDirectory());
      if (error) {
        logger.writeSync('error', 'Unable to open the log folder.', error);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (error) {
      logger.writeSync('error', 'Unable to open the log folder.', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.on('renderer:error', (event, payload) => {
    if (!isTrustedRenderer(event) || !payload || typeof payload !== 'object') return;
    const message = String(payload.message || 'Renderer error');
    if (payload.fatal === true) {
      showFatalError(message, payload.details, { canReload: true });
    } else {
      logger.writeSync('warn', message, payload.details);
    }
  });
}

function publishUpdateState(status, details = {}) {
  currentUpdateState = { status, ...details };
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.send('updates:state', currentUpdateState);
  }
}

function registerUpdateHandlers() {
  ipcMain.handle('updates:get-state', event => (
    isTrustedRenderer(event) ? currentUpdateState : { status: 'idle' }
  ));

  ipcMain.on('updates:install', event => {
    if (!isTrustedRenderer(event) || currentUpdateState.status !== 'downloaded') return;
    autoUpdater.quitAndInstall(true, true);
  });

  ipcMain.handle('app:get-version', event => (isTrustedRenderer(event) ? app.getVersion() : null));

  ipcMain.handle('games:browse', async event => {
    if (!isTrustedRenderer(event)) return null;
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose a game executable',
        properties: ['openFile'],
        filters: [{ name: 'Programs', extensions: ['exe'] }],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return { exe: path.basename(result.filePaths[0]) };
    } catch (error) {
      logger.writeSync('warn', 'Unable to browse for a game.', error);
      return null;
    }
  });

  ipcMain.handle('updates:check', async event => {
    if (!isTrustedRenderer(event)) return null;
    if (!app.isPackaged) return { status: 'dev' };
    if (['checking', 'downloading', 'downloaded'].includes(currentUpdateState.status)) return currentUpdateState;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.writeSync('warn', 'Unable to check for updates.', error);
      publishUpdateState('error');
    }
    return currentUpdateState;
  });
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('checking-for-update', () => {
    logger.writeSync('info', 'Checking for updates.', { currentVersion: app.getVersion() });
    publishUpdateState('checking');
  });
  autoUpdater.on('update-available', info => {
    logger.writeSync('info', 'Update available.', { version: info.version });
    publishUpdateState('available', { version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    logger.writeSync('info', 'No update available.', { currentVersion: app.getVersion() });
    publishUpdateState('current');
  });
  autoUpdater.on('download-progress', progress => publishUpdateState('downloading', {
    percent: Math.round(progress.percent),
  }));
  autoUpdater.on('update-downloaded', info => {
    logger.writeSync('info', 'Update downloaded.', { version: info.version });
    publishUpdateState('downloaded', { version: info.version });
  });
  autoUpdater.on('error', error => {
    logger.writeSync('warn', 'Automatic update failed.', error);
    publishUpdateState('error');
  });

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch(error => {
      logger.writeSync('warn', 'Unable to check for updates.', error);
      publishUpdateState('error');
    });
  };
  checkForUpdates();
  updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  updateCheckTimer.unref();
}

process.on('uncaughtException', error => {
  showFatalError('An uncaught main-process exception occurred.', error);
});

process.on('unhandledRejection', reason => {
  showFatalError('An unhandled main-process promise rejection occurred.', reason);
});

function overlayPositionPath() {
  return path.join(app.getPath('userData'), 'settings', 'overlay-position.json');
}

function loadOverlayPosition() {
  try {
    const saved = JSON.parse(fs.readFileSync(overlayPositionPath(), 'utf8'));
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) return { x: saved.x, y: saved.y };
  } catch {
    // No saved position yet.
  }
  return null;
}

function saveOverlayPosition() {
  try {
    if (overlayCustomPosition) {
      fs.mkdirSync(path.dirname(overlayPositionPath()), { recursive: true });
      fs.writeFileSync(overlayPositionPath(), JSON.stringify(overlayCustomPosition));
    } else {
      fs.rmSync(overlayPositionPath(), { force: true });
    }
  } catch (error) {
    logger.writeSync('warn', 'Unable to save the overlay position.', error);
  }
}

const modeBounds = {};

function displayFor(bounds) {
  return screen.getDisplayNearestPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  });
}

// Shrinks and shifts bounds so the whole rectangle stays inside the area.
function fitInto(bounds, area) {
  const width = Math.round(Math.min(bounds.width, area.width));
  const height = Math.round(Math.min(bounds.height, area.height));
  return {
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
    width,
    height,
  };
}

function keepOnScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const display = displayFor(bounds);
  mainWindow.setBounds(fitInto(bounds, currentMode === 'overlay' ? display.bounds : display.workArea), false);
}

function restoreModeBounds(kind, width, height, center) {
  const saved = modeBounds[kind];
  if (saved) {
    mainWindow.setBounds(fitInto(saved, displayFor(saved).workArea), false);
    return;
  }
  mainWindow.setSize(width, height, false);
  if (center) mainWindow.center();
}

function positionOverlay() {
  if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'overlay') return;

  if (overlayCustomPosition) {
    const [w, h] = mainWindow.getSize();
    const area = screen.getDisplayNearestPoint(overlayCustomPosition).bounds;
    const next = fitInto({ x: overlayCustomPosition.x, y: overlayCustomPosition.y, width: w, height: h }, area);
    mainWindow.setPosition(next.x, next.y, false);
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const [width, height] = mainWindow.getSize();
  const margin = 18;
  const x = Math.round(overlayAnchor.endsWith('right')
    ? workArea.x + workArea.width - width - margin
    : workArea.x + margin);
  const y = Math.round(overlayAnchor.startsWith('bottom')
    ? workArea.y + workArea.height - height - margin
    : workArea.y + margin);
  mainWindow.setPosition(x, y, false);
}

function createWindow() {
  isWindowClosing = false;
  const window = new BrowserWindow({
    title: 'SalsaStats',
    width: 1040,
    height: 720,
    minWidth: 640,
    minHeight: 500,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The overlay must keep updating while it is hidden between games.
      backgroundThrottling: false,
    },
  });

  mainWindow = window;
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      logger.writeSync(level >= 3 ? 'error' : 'warn', 'Renderer console message.', {
        message,
        line,
        sourceId,
        level,
      });
    }
  });
  window.webContents.on('unresponsive', () => {
    if (isQuitting || isWindowClosing) return;
    showFatalError('The dashboard stopped responding.', undefined, { canReload: true });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    if (isQuitting || isWindowClosing || details.reason === 'clean-exit') return;
    showFatalError(`The dashboard process exited (${details.reason}).`, details, { canReload: true });
  });
  window.loadFile(path.join(__dirname, 'index.html')).catch(error => {
    showFatalError('Unable to load the dashboard.', error);
  });
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    window.center();
    window.show();
  });
  window.on('blur', () => {
    if (mainWindow === window && currentMode === 'overlay' && overlayAboveGames && !isQuitting) window.moveTop();
  });
  window.on('restore', keepOnScreen);
  window.on('close', () => {
    isWindowClosing = true;
    clearInterval(overlayZOrderTimer);
    overlayZOrderTimer = null;
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
}

function registerWindowHandler(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
    try {
      handler(...args);
    } catch (error) {
      // A bad window request must never take the whole app down.
      logger.writeSync('warn', 'Window request failed.', { channel, message: error.message });
    }
  });
}

function applyWindowStacking() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const overlay = currentMode === 'overlay';
  const forceAboveGames = overlay && overlayAboveGames;
  // A focusable overlay steals activation, which makes fullscreen games minimise.
  mainWindow.setFocusable(!overlay);
  // Click-through so the overlay never intercepts the mouse while gaming; edit mode lets it be moved.
  mainWindow.setIgnoreMouseEvents(overlay && !overlayEditMode);
  mainWindow.setAlwaysOnTop(overlay || pinned, forceAboveGames ? 'screen-saver' : 'floating');
  if (forceAboveGames) mainWindow.moveTop();
}

function syncOverlayZOrderMaintenance() {
  clearInterval(overlayZOrderTimer);
  overlayZOrderTimer = null;
  if (currentMode !== 'overlay' || !overlayAboveGames || isQuitting) return;

  overlayZOrderTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || currentMode !== 'overlay') return;
    mainWindow.moveTop();
  }, OVERLAY_Z_ORDER_INTERVAL_MS);
  overlayZOrderTimer.unref();
}

registerWindowHandler('window:mode', mode => {
  const previous = currentMode;
  currentMode = ['compact', 'overlay'].includes(mode) ? mode : 'full';
  if (previous !== 'overlay' && previous !== currentMode) modeBounds[previous] = mainWindow.getBounds();
  if (currentMode !== 'overlay') overlayEditMode = false;
  if (currentMode === 'compact') {
    mainWindow.setMinimumSize(320, 210);
    restoreModeBounds('compact', 360, 260, false);
  } else if (currentMode === 'overlay') {
    // The renderer fits the height to its content, so the minimum stays small.
    mainWindow.setMinimumSize(OVERLAY_MIN_WIDTH, 40);
    mainWindow.setSize(OVERLAY_BASE_WIDTH, OVERLAY_BASE_HEIGHT, false);
  } else {
    mainWindow.setMinimumSize(640, 500);
    restoreModeBounds('full', 1040, 720, true);
  }
  applyWindowStacking();
  syncOverlayZOrderMaintenance();
  positionOverlay();
  applyAutoOverlay();
});

registerWindowHandler('window:anchor', (anchor, reset) => {
  if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(anchor)) return;
  overlayAnchor = anchor;
  if (reset === true) {
    overlayCustomPosition = null;
    saveOverlayPosition();
  }
  positionOverlay();
});

registerWindowHandler('window:scale', scaleValue => {
  if (currentMode !== 'overlay') return;
  const scale = Number(scaleValue);
  if (!Number.isFinite(scale)) return;
  const boundedScale = Math.max(0.7, Math.min(1.5, scale));
  const width = Math.round(OVERLAY_BASE_WIDTH * boundedScale);
  mainWindow.setMinimumSize(Math.round(OVERLAY_MIN_WIDTH * boundedScale), 40);
  const [, currentHeight] = mainWindow.getSize();
  mainWindow.setSize(width, currentHeight, false);
  if (!overlayEditMode && !overlayCustomPosition) positionOverlay();
  else keepOnScreen();
});

registerWindowHandler('window:height', value => {
  if (currentMode !== 'overlay') return;
  const height = Math.round(Number(value));
  if (!Number.isFinite(height)) return;
  const [width, current] = mainWindow.getSize();
  const next = Math.round(Math.max(40, Math.min(height, displayFor(mainWindow.getBounds()).bounds.height)));
  if (Math.abs(next - current) < 2) return;
  mainWindow.setSize(width, next, false);
  if (!overlayEditMode && !overlayCustomPosition) positionOverlay();
  else keepOnScreen();
});

registerWindowHandler('window:move', point => {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return;
  const [width, height] = mainWindow.getSize();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = currentMode === 'overlay' ? display.bounds : display.workArea;
  // Electron 44 rejects fractional coordinates; fitInto rounds and keeps the window on the screen being used.
  const next = fitInto({ x: Number(point.x), y: Number(point.y), width, height }, area);
  mainWindow.setPosition(next.x, next.y, false);
});

registerWindowHandler('window:minimize', () => mainWindow.minimize());
registerWindowHandler('window:toggle-fullscreen', () => {
  if (mainWindow.isFullScreen()) {
    const restoreBounds = fullscreenRestoreBounds;
    mainWindow.once('leave-full-screen', () => {
      fullscreenRestoreBounds = null;
      if (!restoreBounds || mainWindow.isDestroyed()) return;
      mainWindow.setBounds(fitInto(restoreBounds, displayFor(restoreBounds).workArea), false);
    });
    mainWindow.setFullScreen(false);
    return;
  }
  fullscreenRestoreBounds = mainWindow.getBounds();
  mainWindow.setFullScreen(true);
});
registerWindowHandler('window:close', () => mainWindow.close());
registerWindowHandler('window:pin', shouldPin => {
  pinned = shouldPin === true;
  applyWindowStacking();
});

async function sampleStats() {
  if (isQuitting || statsInFlight) return;
  statsInFlight = true;
  try {
    const stats = await readStats();
    stats.frames = frameCapture ? frameCapture.getSnapshot() : { status: 'missing', message: '', fps: null };
    if (!initialHardwareSampleLogged) {
      logger.writeSync('info', 'Initial system telemetry sample.', {
        cpuName: stats.cpu.name,
        cpuCores: stats.cpu.cores,
        gpuName: stats.gpu.name,
        gpuTelemetryAvailable: stats.gpu.usage !== null,
        gpuTelemetrySource: stats.gpu.telemetrySource,
        nvapi: nvidiaPerf.getStatus(),
        gpuUsage: stats.gpu.usage,
        gpuMemoryUsedMiB: stats.gpu.memoryUsed,
        gpuMemoryTotalMiB: stats.gpu.memoryTotal,
        gpuTemperatureC: stats.gpu.temperature,
        gpuPowerW: stats.gpu.power,
        gpuClockMHz: stats.gpu.clock,
        gpuAdapters: stats.gpu.detectedAdapters,
      });
      initialHardwareSampleLogged = true;
    }
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
      mainWindow.webContents.send('stats-update', stats);
    }
  } catch (error) {
    logger.writeSync('error', 'Unable to read system stats.', error);
  } finally {
    statsInFlight = false;
    if (!isQuitting) {
      statsTimer = setTimeout(() => {
        statsTimer = null;
        sampleStats();
      }, SAMPLE_INTERVAL_MS);
    }
  }
}

app.on('before-quit', () => {
  stopBackgroundWork();
  if (!shutdownTimer) {
    shutdownTimer = setTimeout(() => app.exit(appExitCode), SHUTDOWN_TIMEOUT_MS);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  clearTimeout(shutdownTimer);
  clearTimeout(fatalDialogTimer);
});

app.on('child-process-gone', (_event, details) => {
  if (!isQuitting) logger.writeSync('error', 'An Electron child process exited.', details);
});

const DEFAULT_SHORTCUTS = {
  customize: 'CommandOrControl+Alt+O',
  minimal: 'CommandOrControl+Alt+M',
  toggle: 'CommandOrControl+Alt+H',
  edit: 'CommandOrControl+Alt+E',
};
let shortcuts = { ...DEFAULT_SHORTCUTS };
let shortcutHandlers = {};

function keybindsPath() {
  return path.join(app.getPath('userData'), 'settings', 'keybinds.json');
}

function loadShortcuts() {
  try {
    const saved = JSON.parse(fs.readFileSync(keybindsPath(), 'utf8'));
    Object.keys(DEFAULT_SHORTCUTS).forEach(action => {
      if (typeof saved[action] === 'string' && /^[A-Za-z0-9+]{1,40}$/.test(saved[action])) shortcuts[action] = saved[action];
    });
  } catch {
    // No saved keybinds; the defaults apply.
  }
}

function saveShortcuts() {
  try {
    fs.mkdirSync(path.dirname(keybindsPath()), { recursive: true });
    fs.writeFileSync(keybindsPath(), JSON.stringify(shortcuts));
  } catch (error) {
    logger.writeSync('warn', 'Unable to save keybinds.', error);
  }
}

function registerShortcut(action) {
  try {
    return globalShortcut.register(shortcuts[action], shortcutHandlers[action]);
  } catch (error) {
    logger.writeSync('warn', 'Unable to register a keybind.', { action, message: error.message });
    return false;
  }
}

function registerKeybindHandlers() {
  ipcMain.handle('keybinds:get', event => (isTrustedRenderer(event) ? { shortcuts, defaults: DEFAULT_SHORTCUTS } : null));

  ipcMain.handle('keybinds:set', (event, action, accelerator) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Request not allowed.' };
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SHORTCUTS, action) || !/^[A-Za-z0-9+]{1,40}$/.test(String(accelerator))) {
      return { ok: false, error: 'That key combination is not valid.' };
    }
    const taken = Object.entries(shortcuts).find(([other, value]) => other !== action && value.toLowerCase() === accelerator.toLowerCase());
    if (taken) return { ok: false, error: 'Another SalsaStats keybind already uses that combination.' };
    const previous = shortcuts[action];
    globalShortcut.unregister(previous);
    shortcuts[action] = accelerator;
    if (!registerShortcut(action)) {
      shortcuts[action] = previous;
      registerShortcut(action);
      return { ok: false, error: 'That combination is unavailable. Another app may be using it.' };
    }
    saveShortcuts();
    return { ok: true, shortcuts };
  });

  ipcMain.handle('keybinds:reset', event => {
    if (!isTrustedRenderer(event)) return null;
    globalShortcut.unregisterAll();
    shortcuts = { ...DEFAULT_SHORTCUTS };
    Object.keys(shortcuts).forEach(registerShortcut);
    saveShortcuts();
    return { ok: true, shortcuts };
  });
}

function registerShortcuts() {
  const send = action => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shortcut', action);
  };
  shortcutHandlers = {
    customize: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!mainWindow.isVisible()) mainWindow.show();
      send('customize');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && currentMode === 'full') mainWindow.focus();
      }, 250);
    },
    minimal: () => send('minimal'),
    edit: () => {
      if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'overlay') return;
      overlayEditMode = !overlayEditMode;
      if (overlayEditMode && !mainWindow.isVisible()) mainWindow.showInactive();
      if (!overlayEditMode) {
        const [x, y] = mainWindow.getPosition();
        overlayCustomPosition = { x, y };
        saveOverlayPosition();
      }
      applyWindowStacking();
      send(overlayEditMode ? 'edit-on' : 'edit-off');
    },
    toggle: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else if (currentMode === 'overlay') mainWindow.showInactive();
      else mainWindow.show();
    },
  };
  loadShortcuts();
  Object.keys(shortcuts).forEach(action => {
    if (!registerShortcut(action)) logger.writeSync('warn', 'Keybind is unavailable.', { action, accelerator: shortcuts[action] });
  });
}

// Only one SalsaStats may run at a time; a second launch just brings the first one forward.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (currentMode === 'overlay') {
    if (!mainWindow.isVisible()) mainWindow.showInactive();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  initializeLogging();
  registerLogHandlers();
  nvidiaPerf.start({ resourcesPath: process.resourcesPath, baseDirectory: __dirname, logger });
  frameCapture = createPresentMonCapture({
    exePath: resolvePresentMonPath(process.resourcesPath, __dirname),
    logger,
  });
  frameCapture.start();
  registerUpdateHandlers();
  configureAutoUpdates();
  createWindow();
  overlayCustomPosition = loadOverlayPosition();
  registerShortcuts();
  registerKeybindHandlers();
  sampleStats();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  showFatalError('Unable to start SalsaStats.', error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

registerWindowHandler('window:overlay-above-games', shouldRaise => {
  overlayAboveGames = shouldRaise === true;
  applyWindowStacking();
  syncOverlayZOrderMaintenance();
});