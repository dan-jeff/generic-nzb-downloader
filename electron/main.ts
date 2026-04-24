import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { download } from 'electron-dl';
import electronUpdater from 'electron-updater';
import { SearchProviderSettings } from '../src/core/types/search.js';
import { SearchManager } from '../src/core/search/SearchManager.js';
import { DownloadManager } from '../src/core/download/DownloadManager.js';
import { NodeStorageAdapter } from './adapters/NodeStorageAdapter.js';
import { NodeFSAdapter } from './adapters/NodeFSAdapter.js';
import { NodeNetworkAdapter } from './adapters/NodeNetworkAdapter.js';

const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

// Compiled main lives at dist-electron/main/electron/main.js.
// The source electron/ dir (containing preload.cjs) and dist/ dir (containing the
// renderer HTML) are three levels up. In the packaged asar the same structure is preserved.
const projectRoot = path.resolve(__dirname, '..', '..', '..');

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

interface DownloadSettings {
  downloadDirectory: string;
}

interface StoreSchema {
  history: any[];
  searchSettings: SearchProviderSettings[];
  downloadSettings: DownloadSettings;
  autoUpdate: boolean;
}

const store = new Store<StoreSchema>({
  defaults: {
    history: [],
    searchSettings: [
      { type: 'nzb', enabled: false, indexers: [] },
    ],
    downloadSettings: {
      downloadDirectory: '',
    },
    autoUpdate: true,
  },
});

const searchManager = new SearchManager(store.get('searchSettings'));

let mainWindow: BrowserWindow | null = null;
let downloadManager: DownloadManager | null = null;
let isCleaningUp = false;
let isQuitting = false;

function createDownloadManager(): DownloadManager {
  const storageAdapter = new NodeStorageAdapter(store as unknown as Store<{ [key: string]: any }>);
  const fileSystemAdapter = new NodeFSAdapter();
  const networkFactory = () => new NodeNetworkAdapter();
  const manager = new DownloadManager(storageAdapter, fileSystemAdapter, networkFactory);

  manager.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', progress);
    }
  });

  manager.on('download-completed', (item) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-completed', item);
    }
  });

  return manager;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Generic NZB Downloader',
    icon: path.join(projectRoot, 'assets/icon.png'),
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(projectRoot, 'electron/preload.cjs'),
    },
    autoHideMenuBar: true,
  });

  mainWindow.setMenuBarVisibility(false);

  downloadManager = createDownloadManager();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
  } else {
    mainWindow.loadFile(path.join(projectRoot, 'dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    downloadManager = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Local (non-NZB) downloads go through electron-dl directly; newsreader downloads
// go through the shared DownloadManager. Both write to the same on-disk history.
ipcMain.handle('start-download', async (_event, url: string | Uint8Array, target?: 'local' | 'newsreader', filename?: string, providerId?: string) => {
  if (!downloadManager || !mainWindow) return { success: false, error: 'Download Manager not initialized' };

  try {
    const downloadContent = typeof url === 'string' ? url : Buffer.from(url as any);
    const id = Math.random().toString(36).substring(7);
    const isNzb = Buffer.isBuffer(downloadContent) || (typeof url === 'string' && url.endsWith('.nzb'));

    if (target === 'local' || (!target && !isNzb)) {
      const downloadItem = {
        id,
        url: typeof url === 'string' ? url : '',
        filename: filename || '',
        savePath: '',
        status: 'downloading',
        startTime: Date.now(),
        providerName: 'Local',
      };

      const targetDirectory = store.get('downloadSettings')?.downloadDirectory?.trim();
      store.set('history', [downloadItem, ...(store.get('history') || [])]);

      const patchHistory = (patch: (item: any) => any) => {
        const current = store.get('history') || [];
        store.set('history', current.map((h: any) => h.id === id ? patch(h) : h));
      };

      const downloadOptions: any = {
        onStarted: (item: any) => {
          downloadItem.filename = item.getFilename();
          downloadItem.savePath = item.getSavePath();
          patchHistory(h => ({ ...h, filename: downloadItem.filename, savePath: downloadItem.savePath }));
        },
        onProgress: (progress: any) => {
          mainWindow?.webContents.send('download-progress', {
            id,
            filename: downloadItem.filename || progress.filename,
            percent: progress.percent,
            transferredBytes: progress.transferredBytes,
            totalBytes: progress.totalBytes,
            status: 'downloading',
            speed: 0,
            providerName: 'Local',
            path: downloadItem.savePath,
          });
        },
        onCompleted: (item: any) => {
          const completedItem = {
            id,
            filename: item.filename,
            savePath: item.savePath || downloadItem.savePath,
            status: 'completed',
            endTime: Date.now(),
            totalBytes: item.fileSize,
            startTime: downloadItem.startTime,
            providerName: 'Local',
          };
          patchHistory(() => completedItem);
          mainWindow?.webContents.send('download-completed', {
            ...completedItem,
            path: completedItem.savePath,
            timestamp: completedItem.endTime,
            size: completedItem.totalBytes,
          });
        },
        onError: (error: Error) => {
          console.error('Local download error:', error);
          patchHistory(h => ({ ...h, status: 'failed' }));
        }
      };
      if (targetDirectory) downloadOptions.directory = targetDirectory;

      download(mainWindow, typeof url === 'string' ? url : '', downloadOptions).catch((error: Error) => {
        console.error('Local download error:', error);
        patchHistory(h => ({ ...h, status: 'failed' }));
      });

      return { success: true, id };
    }

    const newId = await downloadManager.addDownload(downloadContent, filename || '', providerId, 'newsreader');
    return { success: true, id: newId };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('pause-download', async (_event, id: string) => downloadManager?.pause(id) ?? false);
ipcMain.handle('delete-download', async (_event, id: string, removeFiles: boolean) => downloadManager?.delete(id, removeFiles) ?? false);
ipcMain.handle('delete-download-files', async (_event, id: string) => downloadManager?.deleteWithFiles(id) ?? false);

ipcMain.handle('open-path', async (_event, targetPath: string) => {
  if (!targetPath) return false;
  try {
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      shell.showItemInFolder(targetPath);
      return true;
    }
    return (await shell.openPath(targetPath)) === '';
  } catch (error) {
    console.error('Failed to open path:', error);
    return false;
  }
});

ipcMain.handle('get-history', () => {
  const history = store.get('history') || [];
  return history.map((item: any) => ({
    id: item.id,
    url: item.url,
    filename: item.filename,
    path: item.savePath,
    timestamp: item.endTime || item.startTime,
    size: item.totalBytes || 0,
    providerName: item.providerName,
    externalId: item.externalId,
    status: item.status,
  }));
});

ipcMain.handle('clear-history', () => {
  store.set('history', []);
  return true;
});

ipcMain.handle('search', async (_event, query: string) => searchManager.search(query));
ipcMain.handle('get-search-settings', () => store.get('searchSettings'));
ipcMain.handle('update-search-settings', (_event, settings: SearchProviderSettings[]) => {
  store.set('searchSettings', settings);
  searchManager.updateProviders(settings);
  downloadManager?.updateSettings();
  return true;
});
ipcMain.handle('get-download-settings', () => store.get('downloadSettings'));
ipcMain.handle('update-download-settings', (_event, settings: DownloadSettings) => {
  store.set('downloadSettings', settings);
  return true;
});

type UpdateStatus = {
  type: 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded';
  version?: string;
  error?: string;
  progress?: { percent: number; transferred: number; total: number };
};

const sendUpdateStatus = (payload: UpdateStatus) => {
  mainWindow?.webContents.send('update-status', payload);
};

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-auto-update', () => store.get('autoUpdate'));
ipcMain.on('set-auto-update', (_event, enable: boolean) => {
  store.set('autoUpdate', enable);
  if (enable && !isDev) autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('check-for-update', async () => {
  if (isDev) {
    sendUpdateStatus({ type: 'not-available', version: app.getVersion() });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    sendUpdateStatus({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
});

ipcMain.on('quit-and-install', () => autoUpdater.quitAndInstall());

const configureAutoUpdates = () => {
  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ type: 'checking' }));
  autoUpdater.on('update-available', (info: any) => sendUpdateStatus({ type: 'available', version: info.version }));
  autoUpdater.on('update-not-available', (info: any) => sendUpdateStatus({ type: 'not-available', version: info.version }));
  autoUpdater.on('error', (error: Error | unknown) =>
    sendUpdateStatus({ type: 'error', error: error instanceof Error ? error.message : String(error) }));
  autoUpdater.on('update-downloaded', (info: any) => sendUpdateStatus({ type: 'downloaded', version: info.version }));
  autoUpdater.on('download-progress', (info: any) => sendUpdateStatus({
    type: 'downloading',
    progress: { percent: info.percent, transferred: info.transferred, total: info.total },
  }));
};

async function performCleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  isCleaningUp = false;
}

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdates();
  if (store.get('autoUpdate') && !isDev) autoUpdater.checkForUpdatesAndNotify();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (isQuitting) return;
  isQuitting = true;
  await performCleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { isQuitting = true; });
process.on('SIGINT', async () => { await performCleanup(); process.exit(0); });
process.on('SIGTERM', async () => { await performCleanup(); process.exit(0); });
