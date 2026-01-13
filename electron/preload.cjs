const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  startDownload: (url, target, filename, providerId) => ipcRenderer.invoke('start-download', url, target, filename, providerId),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  search: (query) => ipcRenderer.invoke('search', query),
  getSearchSettings: () => ipcRenderer.invoke('get-search-settings'),
  updateSearchSettings: (settings) => ipcRenderer.invoke('update-search-settings', settings),
  getDownloadSettings: () => ipcRenderer.invoke('get-download-settings'),
  updateDownloadSettings: (settings) => ipcRenderer.invoke('update-download-settings', settings),
  pauseDownload: (id) => ipcRenderer.invoke('pause-download', id),
  deleteDownload: (id, removeFiles) => ipcRenderer.invoke('delete-download', id, removeFiles),
  deleteDownloadWithFiles: (id) => ipcRenderer.invoke('delete-download-files', id),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  onDownloadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onDownloadCompleted: (callback) => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('download-completed', listener);
    return () => ipcRenderer.removeListener('download-completed', listener);
  },
});
