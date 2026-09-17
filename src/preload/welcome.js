'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowsill', {
  openCatsFolder: () => ipcRenderer.send('app:open-cats-folder'),
  openGuide: () => ipcRenderer.send('app:open-guide'),
  close: () => ipcRenderer.send('welcome:close'),
  quit: () => ipcRenderer.send('app:quit'),
  getAutoStart: () => ipcRenderer.invoke('app:get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:set-auto-start', Boolean(enabled)),
});
