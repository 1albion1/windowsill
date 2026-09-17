'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
};

contextBridge.exposeInMainWorld('overlay', {
  getState: () => ipcRenderer.invoke('overlay:get-state'),
  reloadCats: () => ipcRenderer.invoke('cats:reload'),
  setInteractive: (interactive) => ipcRenderer.send('overlay:set-interactive', Boolean(interactive)),
  openCatsFolder: () => ipcRenderer.send('app:open-cats-folder'),
  reportReady: (summary) => ipcRenderer.send('overlay:ready', summary),
  onGeometry: (callback) => subscribe('overlay:geometry', callback),
  onCats: (callback) => subscribe('overlay:cats', callback),
  onPaused: (callback) => subscribe('overlay:paused', callback),
});
