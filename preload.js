const { contextBridge, ipcRenderer } = require('electron');

const channels = {
  setMode: 'window:mode',
  setAnchor: 'window:anchor',
  setOverlayMenu: 'window:overlay-menu',
  setOverlayAboveGames: 'window:overlay-above-games',
  setScale: 'window:scale',
  moveWindow: 'window:move',
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  closeWindow: 'window:close',
  setPinned: 'window:pin',
};

contextBridge.exposeInMainWorld('salsaStats', {
  setMode: mode => ipcRenderer.send(channels.setMode, mode),
  setAnchor: (anchor, reset = false) => ipcRenderer.send(channels.setAnchor, anchor, reset),
  setOverlayMenu: open => ipcRenderer.send(channels.setOverlayMenu, open),
  setOverlayAboveGames: enabled => ipcRenderer.send(channels.setOverlayAboveGames, enabled),
  setScale: scale => ipcRenderer.send(channels.setScale, scale),
  setOverlayHeight: height => ipcRenderer.send('window:height', height),
  moveWindow: point => ipcRenderer.send(channels.moveWindow, point),
  minimize: () => ipcRenderer.send(channels.minimize),
  toggleMaximize: () => ipcRenderer.send(channels.toggleMaximize),
  closeWindow: () => ipcRenderer.send(channels.closeWindow),
  setPinned: pinned => ipcRenderer.send(channels.setPinned, pinned),
  getLogDirectory: () => ipcRenderer.invoke('logs:get-directory'),
  chooseLogDirectory: () => ipcRenderer.invoke('logs:choose-directory'),
  openLogDirectory: () => ipcRenderer.invoke('logs:open-directory'),
  readLogTail: offset => ipcRenderer.invoke('logs:tail', offset),
  copyText: text => ipcRenderer.invoke('clipboard:write', text),
  reportError: (message, details, fatal = false) => ipcRenderer.send('renderer:error', { message, details, fatal }),
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  browseGame: () => ipcRenderer.invoke('games:browse'),
  getKeybinds: () => ipcRenderer.invoke('keybinds:get'),
  setKeybindCapture: capturing => ipcRenderer.invoke('keybinds:capture', capturing),
  setKeybind: (action, accelerator) => ipcRenderer.invoke('keybinds:set', action, accelerator),
  resetKeybinds: () => ipcRenderer.invoke('keybinds:reset'),
  listDirectory: directory => ipcRenderer.invoke('fs:list', directory),
  scanGames: directory => ipcRenderer.invoke('fs:scan', directory),
  detectGames: () => ipcRenderer.invoke('games:detect'),
  setAutoOverlay: (enabled, running) => ipcRenderer.invoke('overlay:auto', enabled, running),
  getLogin: () => ipcRenderer.invoke('app:get-login'),
  setLogin: enabled => ipcRenderer.invoke('app:set-login', enabled),
  copyImage: rect => ipcRenderer.invoke('clipboard:image', rect),
  onShortcut: callback => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('shortcut', listener);
    return () => ipcRenderer.removeListener('shortcut', listener);
  },
  installUpdate: () => ipcRenderer.send('updates:install'),
  onUpdateState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  onStatsUpdate: callback => {
    const listener = (_event, stats) => callback(stats);
    ipcRenderer.on('stats-update', listener);
    return () => ipcRenderer.removeListener('stats-update', listener);
  },
});