const { contextBridge, ipcRenderer } = require('electron');

const channels = {
  setMode: 'window:mode',
  setAnchor: 'window:anchor',
  setOverlayAboveGames: 'window:overlay-above-games',
  setScale: 'window:scale',
  moveWindow: 'window:move',
  minimize: 'window:minimize',
  toggleFullscreen: 'window:toggle-fullscreen',
  closeWindow: 'window:close',
  setPinned: 'window:pin',
};

contextBridge.exposeInMainWorld('salsaStats', {
  setMode: mode => ipcRenderer.send(channels.setMode, mode),
  setAnchor: anchor => ipcRenderer.send(channels.setAnchor, anchor),
  setOverlayAboveGames: enabled => ipcRenderer.send(channels.setOverlayAboveGames, enabled),
  setScale: scale => ipcRenderer.send(channels.setScale, scale),
  moveWindow: point => ipcRenderer.send(channels.moveWindow, point),
  minimize: () => ipcRenderer.send(channels.minimize),
  toggleFullscreen: () => ipcRenderer.send(channels.toggleFullscreen),
  closeWindow: () => ipcRenderer.send(channels.closeWindow),
  setPinned: pinned => ipcRenderer.send(channels.setPinned, pinned),
  getLogDirectory: () => ipcRenderer.invoke('logs:get-directory'),
  chooseLogDirectory: () => ipcRenderer.invoke('logs:choose-directory'),
  openLogDirectory: () => ipcRenderer.invoke('logs:open-directory'),
  getNvapi: () => ipcRenderer.invoke('nvapi:get'),
  setNvapi: enabled => ipcRenderer.invoke('nvapi:set', enabled),
  restartApp: () => ipcRenderer.send('app:restart'),
  reportError: (message, details, fatal = false) => ipcRenderer.send('renderer:error', { message, details, fatal }),
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
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