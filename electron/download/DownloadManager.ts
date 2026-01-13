import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import Store from 'electron-store';
import { download } from 'electron-dl';
import axios from 'axios';
import { BaseNewsreaderClient, SABnzbdClient, NZBGetClient, DirectUsenetClient } from './NewsreaderClient.js';
import { DownloadStatus } from '../types/download.js';
import { NewsreaderSettings, SearchProviderSettings } from '../types/search.js';

interface DownloadItem {
  id: string;
  url?: string;
  filename: string;
  savePath: string;
  status: 'downloading' | 'completed' | 'failed' | 'paused' | 'queued';
  startTime: number;
  endTime?: number;
  totalBytes?: number;
  providerName: string;
  providerId?: string;
  externalId?: string;
}

interface DownloadSettings {
  downloadDirectory: string;
  autoExtract?: boolean;
}

interface StoreSchema {
  history: DownloadItem[];
  searchSettings: SearchProviderSettings[];
  downloadSettings: DownloadSettings;
}

export class DownloadManager {
  private window: BrowserWindow;
  private store: Store<StoreSchema>;
  private newsreaders: Map<string, BaseNewsreaderClient> = new Map();
  private providerNames: Map<string, string> = new Map();
  private localDownloads: Map<string, DownloadStatus> = new Map();
  private externalDownloads: Map<string, { providerId: string, externalId: string, filename: string, savePath: string }> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(window: BrowserWindow, store: Store<StoreSchema>) {
    this.window = window;
    this.store = store;
    this.initializeNewsreaders();
    this.startPolling();
  }

  private initializeNewsreaders() {
    const searchSettings = this.store.get('searchSettings') || [];
    const nzbSettings = searchSettings.find(s => s.type === 'nzb');
    
    this.providerNames.clear();
    if (nzbSettings && nzbSettings.newsreaders) {
      for (const settings of nzbSettings.newsreaders) {
        this.providerNames.set(settings.id, settings.name);
        if (settings.enabled) {
          this.newsreaders.set(settings.id, this.createClient(settings));
        }
      }
    }
  }

  private createClient(settings: NewsreaderSettings): BaseNewsreaderClient {
    if (settings.type === 'sabnzbd') {
      return new SABnzbdClient(settings);
    } else if (settings.type === 'nzbget') {
      return new NZBGetClient(settings);
    } else if (settings.type === 'direct') {
      return new DirectUsenetClient(settings);
    }
    throw new Error(`Unsupported newsreader type: ${settings.type}`);
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => this.poll(), 2000);
  }

  private isUuid(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sabUuidRegex = /^SABnzbd_nzo_[a-z0-9]+$/i;
    return uuidRegex.test(str) || sabUuidRegex.test(str);
  }

  private async poll() {
    const allStatuses: DownloadStatus[] = [];

    // Add local downloads
    for (const status of this.localDownloads.values()) {
      allStatuses.push(status);
    }

    // Add external downloads
    const providerGroups = new Map<string, string[]>();
    for (const { providerId, externalId } of this.externalDownloads.values()) {
      if (!providerGroups.has(providerId)) {
        providerGroups.set(providerId, []);
      }
      providerGroups.get(providerId)!.push(externalId);
    }

    for (const [providerId, externalIds] of providerGroups.entries()) {
      const client = this.newsreaders.get(providerId);
      if (client) {
        try {
          const statuses = await client.getStatus(externalIds);
          for (const status of statuses) {
            // Find our local ID for this external status
            const entry = Array.from(this.externalDownloads.entries())
              .find(([_, val]) => val.providerId === providerId && val.externalId === status.id);
            
            if (entry) {
              const [localId] = entry;
              const mergedStatus = { ...status, id: localId };
              allStatuses.push(mergedStatus);

              // Check if completed
              if (status.status === 'Completed') {
                this.handleDownloadComplete(localId, mergedStatus);
              }
            }
          }
        } catch (error) {
          console.error(`Error polling newsreader ${providerId}:`, error);
        }
      }
    }

    if (this.window && !this.window.isDestroyed()) {
      const history = this.store.get('history') || [];

      for (const status of allStatuses) {
        if (status.status.toLowerCase() === 'completed') continue;
        
        const external = this.externalDownloads.get(status.id);
        const historyItem = history.find((item) => item.id === status.id);
        const path = external?.savePath || status.outputPath || historyItem?.savePath || '';
        const progress = {
          id: status.id,
          filename: (status.name && !this.isUuid(status.name)) ? status.name : (external?.filename || status.name),
          percent: status.progress / 100,
          transferredBytes: status.size - status.remainingSize,
          totalBytes: status.size,
          status: status.status.toLowerCase() as any,
          speed: status.speed,
          providerName: external ? (this.providerNames.get(external.providerId) || external.providerId) : 'Local',
          externalId: external ? external.externalId : undefined,
          path,
        };
        this.window.webContents.send('download-progress', progress);
      }
    }
  }

  private handleDownloadComplete(id: string, status: DownloadStatus) {
    const history = this.store.get('history') || [];
    const itemIndex = history.findIndex(h => h.id === id);
    
    // Always clean up active tracking first to prevent polling loops
    this.externalDownloads.delete(id);
    this.localDownloads.delete(id);

    let updatedItem: DownloadItem;

    if (itemIndex !== -1) {
      if (history[itemIndex].status === 'completed') return;

      updatedItem = {
        ...history[itemIndex],
        filename: (status.name && !this.isUuid(status.name)) ? status.name : history[itemIndex].filename,
        savePath: status.outputPath && status.outputPath !== '' ? status.outputPath : history[itemIndex].savePath,
        status: 'completed',
        endTime: Date.now(),
        totalBytes: status.size,
      };
      
      const newHistory = [...history];
      newHistory[itemIndex] = updatedItem;
      this.store.set('history', newHistory);
    } else {
      // Fallback: Create a new history item if missing (shouldn't happen usually)
      console.warn(`Download ${id} completed but not found in history. Recreating item.`);
      
      // We'll construct a best-effort item
      updatedItem = {
        id,
        filename: status.name || 'Unknown',
        savePath: status.outputPath || '',
        status: 'completed',
        startTime: Date.now(), // Approximate
        endTime: Date.now(),
        totalBytes: status.size,
        providerName: 'Unknown',
      };
    }

    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('download-completed', {
        ...updatedItem,
        path: updatedItem.savePath,
        timestamp: updatedItem.endTime,
        size: updatedItem.totalBytes,
        status: 'completed'
      });
    }
  }

  async addDownload(urlOrBuffer: string | Buffer, filename: string, providerId?: string, target?: 'local' | 'newsreader'): Promise<string> {
    const id = Math.random().toString(36).substring(7);
    const isNzb = Buffer.isBuffer(urlOrBuffer) || (typeof urlOrBuffer === 'string' && urlOrBuffer.endsWith('.nzb'));

    if (target === 'local' || (!target && !isNzb)) {
      return this.addLocalDownload(id, urlOrBuffer as string, filename);
    } else {
      return this.addNewsreaderDownload(id, urlOrBuffer, filename, providerId);
    }
  }

  private async addNewsreaderDownload(id: string, content: string | Buffer, filename: string, providerId?: string): Promise<string> {
    let client: BaseNewsreaderClient | undefined;
    let selectedProviderId = providerId;

    if (selectedProviderId) {
      client = this.newsreaders.get(selectedProviderId);
    } else {
      // Find highest priority enabled newsreader
      const searchSettings = this.store.get('searchSettings') || [];
      const nzbSettings = searchSettings.find(s => s.type === 'nzb');
      if (nzbSettings && nzbSettings.newsreaders) {
        const enabledReaders = nzbSettings.newsreaders
          .filter(r => r.enabled)
          .sort((a, b) => (a.priority || 0) - (b.priority || 0));
        
        if (enabledReaders.length > 0) {
          selectedProviderId = enabledReaders[0].id;
          client = this.newsreaders.get(selectedProviderId);
        }
      }
    }

    if (!client || !selectedProviderId) {
      if (typeof content === 'string') {
        return this.addLocalDownload(id, content, filename);
      }
      throw new Error('No newsreader available to handle NZB buffer');
    }

    const searchSettings = this.store.get('searchSettings') || [];
    const nzbSettings = searchSettings.find(s => s.type === 'nzb');
    const selectedSettings = nzbSettings?.newsreaders?.find(reader => reader.id === selectedProviderId);
    
    // Use provider-specific path, or fall back to global download settings
    const downloadSettings = this.store.get('downloadSettings');
    const downloadPath = selectedSettings?.downloadPath || downloadSettings?.downloadDirectory || '';
    const autoExtract = downloadSettings?.autoExtract ?? true;

    let buffer: Buffer;
    if (typeof content === 'string') {
      const response = await axios.get(content, { responseType: 'arraybuffer' });
      buffer = Buffer.from(response.data);
    } else {
      buffer = content;
    }

    const externalId = await client.addNzb(buffer, filename, 'default', downloadPath, autoExtract);
    const friendlyName = this.providerNames.get(selectedProviderId) || selectedProviderId;
    
    const downloadItem: DownloadItem = {
      id,
      filename,
      savePath: downloadPath,
      status: 'queued',
      startTime: Date.now(),
      providerName: friendlyName,
      providerId: selectedProviderId,
      externalId,
    };

    const history = this.store.get('history') || [];
    this.store.set('history', [downloadItem, ...history]);
    
    this.externalDownloads.set(id, { providerId: selectedProviderId, externalId, filename, savePath: downloadPath });
    
    return id;
  }

  private async addLocalDownload(id: string, url: string, filename: string): Promise<string> {
    const downloadItem: DownloadItem = {
      id,
      url,
      filename,
      savePath: '',
      status: 'downloading',
      startTime: Date.now(),
      providerName: 'Local',
    };

    const history = this.store.get('history') || [];
    this.store.set('history', [downloadItem, ...history]);

    const downloadSettings = this.store.get('downloadSettings');
    const targetDirectory = downloadSettings?.downloadDirectory?.trim();
    const downloadOptions = {
      onStarted: (item: any) => {
        downloadItem.filename = item.getFilename();
        downloadItem.savePath = item.getSavePath();
        downloadItem.totalBytes = item.getTotalBytes();
        
        const currentHistory = this.store.get('history') || [];
        const updatedHistory = currentHistory.map((h: any) => 
          h.id === id ? { ...h, filename: downloadItem.filename, savePath: downloadItem.savePath, totalBytes: downloadItem.totalBytes } : h
        );
        this.store.set('history', updatedHistory);
      },
      onProgress: (progress: any) => {
        const status: DownloadStatus = {
          id,
          name: downloadItem.filename,
          size: downloadItem.totalBytes || 0,
          remainingSize: (downloadItem.totalBytes || 0) * (1 - progress.percent),
          progress: progress.percent * 100,
          status: 'Downloading',
          speed: 0, // electron-dl doesn't easily give speed
          eta: 0,
          outputPath: downloadItem.savePath,
        };
        this.localDownloads.set(id, status);
      },
      onCompleted: (item: any) => {
        const status: DownloadStatus = {
          id,
          name: item.filename,
          size: item.fileSize,
          remainingSize: 0,
          progress: 100,
          status: 'Completed',
          speed: 0,
          eta: 0,
        };
        this.handleDownloadComplete(id, status);
      }
    } as const;

    if (targetDirectory) {
      (downloadOptions as { directory?: string }).directory = targetDirectory;
    }

    // We'll use electron-dl. download() returns a Promise that resolves when finished.
    // We need to track progress.
    download(this.window, url, downloadOptions).catch(error => {
      console.error('Local download error:', error);
      const currentHistory = this.store.get('history') || [];
      const updatedHistory = currentHistory.map((h: any) => 
        h.id === id ? { ...h, status: 'failed' } : h
      );
      this.store.set('history', updatedHistory);
      this.localDownloads.delete(id);
    });

    return id;
  }

  async pause(id: string): Promise<boolean> {
    const external = this.externalDownloads.get(id);
    if (external) {
      const client = this.newsreaders.get(external.providerId);
      if (client) {
        return await client.pause(external.externalId);
      }
    }
    // Local pause not implemented in electron-dl easily
    return false;
  }

  async delete(id: string, removeFiles: boolean = false): Promise<boolean> {
    const external = this.externalDownloads.get(id);
    if (external) {
      const client = this.newsreaders.get(external.providerId);
      if (client) {
        await client.delete(external.externalId, removeFiles);
      }
      this.externalDownloads.delete(id);
    }
    
    this.localDownloads.delete(id);
    
    const history = this.store.get('history') || [];
    
    if (removeFiles) {
      const item = history.find(h => h.id === id);
      if (item && item.savePath) {
        // Safety check: Don't delete if savePath matches the root download directory
        const downloadSettings = this.store.get('downloadSettings');
        const rootDir = downloadSettings?.downloadDirectory ? path.resolve(downloadSettings.downloadDirectory) : null;
        const targetPath = path.resolve(item.savePath);

        if (rootDir && targetPath === rootDir) {
          console.warn(`[Safety] Refusing to delete path because it matches the root download directory: ${targetPath}`);
          // We can still delete the history item, just not the files
        } else {
          try {
            if (fs.existsSync(item.savePath)) {
              const stats = fs.statSync(item.savePath);
              if (stats.isDirectory()) {
                // It's a directory: delete it recursively
                fs.rmSync(item.savePath, { recursive: true, force: true });
              } else {
                // It's a file: delete just the file
                fs.unlinkSync(item.savePath);
              }
            }
          } catch (error) {
            console.error(`Failed to delete files at ${item.savePath}:`, error);
          }
        }
      }
    }

    const newHistory = history.filter(h => h.id !== id);
    this.store.set('history', newHistory);
    
    return true;
  }

  async deleteWithFiles(id: string): Promise<boolean> {
    return this.delete(id, true);
  }

  updateSettings() {
    this.initializeNewsreaders();
  }
}
