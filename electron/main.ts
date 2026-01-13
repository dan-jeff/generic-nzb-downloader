import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import electronDl from 'electron-dl';
import { SearchProviderSettings } from './types/search.js';
import { SearchManager } from './search/SearchManager.js';
import { DownloadManager } from './download/DownloadManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize electron-dl
electronDl();

interface DownloadSettings {
  downloadDirectory: string;
  autoExtract?: boolean;
}

interface StoreSchema {
  history: any[];
  searchSettings: SearchProviderSettings[];
  downloadSettings: DownloadSettings;
}

// Initialize electron-store
const store = new Store<StoreSchema>({
  defaults: {
    history: [],
    searchSettings: [
      { type: 'nzb', enabled: false, indexers: [] },
    ],
    downloadSettings: {
      downloadDirectory: '',
      autoExtract: true,
    },
  },
});

// Initialize Search Manager
const searchManager = new SearchManager(store.get('searchSettings'));

let mainWindow: BrowserWindow | null = null;
let downloadManager: DownloadManager | null = null;
let isCleaningUp = false;
let isQuitting = false;

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';
  
  mainWindow = new BrowserWindow({
    title: 'Generic NZB Downloader',
    icon: path.join(__dirname, '../assets/icon.png'),
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
  });

  mainWindow.setMenuBarVisibility(false);

  // Initialize Download Manager
  downloadManager = new DownloadManager(mainWindow, store);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    downloadManager = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC Handlers
ipcMain.handle('start-download', async (_event, url: string | Uint8Array, target?: 'local' | 'newsreader', filename?: string, providerId?: string) => {
  if (!downloadManager) return { success: false, error: 'Download Manager not initialized' };

  try {
    const downloadContent = typeof url === 'string' ? url : Buffer.from(url as any);
    const id = await downloadManager.addDownload(downloadContent, filename || '', providerId, target);
    return { success: true, id };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('pause-download', async (_event, id: string) => {
  if (!downloadManager) return false;
  return await downloadManager.pause(id);
});

ipcMain.handle('delete-download', async (_event, id: string, removeFiles: boolean) => {
  if (!downloadManager) return false;
  return await downloadManager.delete(id, removeFiles);
});

ipcMain.handle('delete-download-files', async (_event, id: string) => {
  if (!downloadManager) return false;
  return await downloadManager.deleteWithFiles(id);
});

ipcMain.handle('open-path', async (_event, targetPath: string) => {
  if (!targetPath) return false;

  try {
    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      if (stats.isFile()) {
        shell.showItemInFolder(targetPath);
        return true;
      }
    }

    const result = await shell.openPath(targetPath);
    return result === '';
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
    status: item.status
  }));
});

ipcMain.handle('clear-history', () => {
  store.set('history', []);
  return true;
});

ipcMain.handle('search', async (_event, query: string) => {
  return await searchManager.search(query);
});

ipcMain.handle('get-search-settings', () => {
  return store.get('searchSettings');
});

ipcMain.handle('update-search-settings', (_event, settings: SearchProviderSettings[]) => {
  store.set('searchSettings', settings);
  searchManager.updateProviders(settings);
  if (downloadManager) {
    downloadManager.updateSettings();
  }
  return true;
});

ipcMain.handle('get-download-settings', () => {
  return store.get('downloadSettings');
});

ipcMain.handle('update-download-settings', (_event, settings: DownloadSettings) => {
  store.set('downloadSettings', settings);
  return true;
});

async function performCleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  console.log('Starting cleanup...');
  
  // Ensure store writes are finished
  // electron-store writes are usually synchronous or handled by the library,
  // but we can ensure we've finished our logic.
  
  console.log('Cleanup complete');
  isCleaningUp = false;
}

app.whenReady().then(() => {
  createWindow();

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

app.on('before-quit', () => {
  isQuitting = true;
});

process.on('SIGINT', async () => {
  await performCleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await performCleanup();
  process.exit(0);
});
