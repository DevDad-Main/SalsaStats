const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const { createLogger } = require('./logger');
const { createStatsReader } = require('./stats');

const SAMPLE_INTERVAL_MS = 2000;
const OVERLAY_BASE_WIDTH = 340;
const OVERLAY_BASE_HEIGHT = 490;
const OVERLAY_MIN_WIDTH = 300;
const OVERLAY_MIN_HEIGHT = 390;
const SHUTDOWN_TIMEOUT_MS = 8000;
const FATAL_DIALOG_TIMEOUT_MS = 30000;
const readStats = createStatsReader();
const logger = createLogger({ fallbackDirectory: path.join(process.cwd(), 'logs') });

let mainWindow;
let statsTimer;
let statsInFlight = false;
let shutdownTimer;
let fatalDialogTimer;
let currentMode = 'full';
let pinned = false;
let overlayAnchor = 'top-right';
let isQuitting = false;
let isShuttingDown = false;
let fatalDialogOpen = false;
let appExitCode = 0;
let isWindowClosing = false;

function initializeLogging() {
  const userData = app.getPath('userData');
  return logger.initialize({
    defaultDirectory: path.join(userData, 'logs'),
    settingsPath: path.join(userData, 'settings', 'logging.json'),
  });
}

function stopBackgroundWork() {
  isQuitting = true;
  clearTimeout(statsTimer);
  statsTimer = null;
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

function registerLogHandlers() {
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

process.on('uncaughtException', error => {
  showFatalError('An uncaught main-process exception occurred.', error);
});

process.on('unhandledRejection', reason => {
  showFatalError('An unhandled main-process promise rejection occurred.', reason);
});

function positionOverlay() {
  if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'overlay') return;

  const { workArea } = screen.getPrimaryDisplay();
  const [width, height] = mainWindow.getSize();
  const margin = 18;
  const x = overlayAnchor.endsWith('right')
    ? workArea.x + workArea.width - width - margin
    : workArea.x + margin;
  const y = overlayAnchor.startsWith('bottom')
    ? workArea.y + workArea.height - height - margin
    : workArea.y + margin;
  mainWindow.setPosition(x, y, true);
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
  window.on('close', () => {
    isWindowClosing = true;
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
}

function registerWindowHandler(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
    handler(...args);
  });
}

registerWindowHandler('window:mode', mode => {
  currentMode = ['compact', 'overlay'].includes(mode) ? mode : 'full';
  if (currentMode === 'compact') {
    mainWindow.setMinimumSize(320, 210);
    mainWindow.setSize(360, 260, true);
  } else if (currentMode === 'overlay') {
    mainWindow.setMinimumSize(OVERLAY_MIN_WIDTH, OVERLAY_MIN_HEIGHT);
    mainWindow.setSize(OVERLAY_BASE_WIDTH, OVERLAY_BASE_HEIGHT, true);
  } else {
    mainWindow.setMinimumSize(640, 500);
    mainWindow.setSize(1040, 720, true);
    mainWindow.center();
  }
  mainWindow.setAlwaysOnTop(currentMode === 'overlay' || pinned);
  positionOverlay();
});

registerWindowHandler('window:anchor', anchor => {
  if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(anchor)) return;
  overlayAnchor = anchor;
  positionOverlay();
});

registerWindowHandler('window:scale', scaleValue => {
  if (currentMode !== 'overlay') return;
  const scale = Number(scaleValue);
  if (!Number.isFinite(scale)) return;
  const boundedScale = Math.max(0.7, Math.min(1.5, scale));
  const width = Math.round(OVERLAY_BASE_WIDTH * boundedScale);
  const height = Math.round(OVERLAY_BASE_HEIGHT * boundedScale);
  mainWindow.setMinimumSize(
    Math.round(OVERLAY_MIN_WIDTH * boundedScale),
    Math.round(OVERLAY_MIN_HEIGHT * boundedScale),
  );
  mainWindow.setSize(width, height, true);
  positionOverlay();
});

registerWindowHandler('window:move', point => {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return;
  mainWindow.setPosition(Number(point.x), Number(point.y), true);
});

registerWindowHandler('window:minimize', () => mainWindow.minimize());
registerWindowHandler('window:toggle-fullscreen', () => mainWindow.setFullScreen(!mainWindow.isFullScreen()));
registerWindowHandler('window:close', () => mainWindow.close());
registerWindowHandler('window:pin', shouldPin => {
  pinned = shouldPin === true;
  mainWindow.setAlwaysOnTop(pinned || currentMode === 'overlay');
});

async function sampleStats() {
  if (isQuitting || statsInFlight) return;
  statsInFlight = true;
  try {
    const stats = await readStats();
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
  clearTimeout(shutdownTimer);
  clearTimeout(fatalDialogTimer);
});

app.on('child-process-gone', (_event, details) => {
  if (!isQuitting) logger.writeSync('error', 'An Electron child process exited.', details);
});

app.whenReady().then(() => {
  initializeLogging();
  registerLogHandlers();
  createWindow();
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