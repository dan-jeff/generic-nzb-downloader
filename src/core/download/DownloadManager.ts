import { EventEmitter } from 'events';
import axios from 'axios';
import { BaseNewsreaderClient, SABnzbdClient, NZBGetClient, DirectUsenetClient } from '../nntp/NewsreaderClient.js';
import { DownloadStatus } from '../types/download.js';
import { NewsreaderSettings, SearchProviderSettings } from '../types/search.js';
import { IFileSystem } from '@/core/interfaces/IFileSystem.js';
import { IStorage } from '@/core/interfaces/IStorage.js';
import { INetwork } from '@/core/interfaces/INetwork.js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

type NetworkFactory = () => INetwork;

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
}

export class DownloadManager extends EventEmitter {
  private store: IStorage;
  private fileSystem: IFileSystem;
  private networkFactory: NetworkFactory;
  private newsreaders: Map<string, BaseNewsreaderClient> = new Map();
  private providerNames: Map<string, string> = new Map();
  private localDownloads: Map<string, DownloadStatus> = new Map();
  private externalDownloads: Map<string, { providerId: string, externalId: string, filename: string, savePath: string }> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private instanceId: string;

  constructor(store: IStorage, fileSystem: IFileSystem, networkFactory: NetworkFactory) {
    super();
    this.instanceId = Math.random().toString(36).substring(7);
    console.log('[DownloadManager] Created new instance:', this.instanceId);
    this.store = store;
    this.fileSystem = fileSystem;
    this.networkFactory = networkFactory;
  }

  async initialize() {
    await this.initializeNewsreaders();
    this.startPolling();
  }

  private async initializeNewsreaders() {
    const searchSettings = (await this.store.get<SearchProviderSettings[]>('searchSettings')) || [];
    const nzbSettings = Array.isArray(searchSettings) ? searchSettings.find((s: SearchProviderSettings) => s.type === 'nzb') : undefined;
    
    this.providerNames.clear();
    if (nzbSettings && (nzbSettings as any).newsreaders) {
      for (const settings of (nzbSettings as any).newsreaders) {
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
      return new DirectUsenetClient(settings, this.networkFactory, this.fileSystem);
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
    const statusMap = new Map<string, DownloadStatus>();

    for (const status of this.localDownloads.values()) {
      statusMap.set(status.id, status);
    }

    const providerGroups = new Map<string, string[]>();
    for (const { providerId, externalId } of this.externalDownloads.values()) {
      if (!providerGroups.has(providerId)) {
        providerGroups.set(providerId, []);
      }
      providerGroups.get(providerId)!.push(externalId);
    }

    for (const providerId of providerGroups.keys()) {
      const client = this.newsreaders.get(providerId);
      if (client) {
        try {
          const statuses = await client.getStatus([]);
          for (const status of statuses) {
            const entries = Array.from(this.externalDownloads.entries())
              .filter(([_, val]) => val.providerId === providerId && val.externalId === status.id);
            
            for (const [localId] of entries) {
              const mergedStatus = { ...status, id: localId };
              statusMap.set(localId, mergedStatus);

              if (status.status.toLowerCase() === 'completed') {
                this.handleDownloadComplete(localId, mergedStatus);
              }
            }
          }
        } catch (error) {
          console.error(`Error polling newsreader ${providerId}:`, error);
        }
      }
    }

    const allStatuses = Array.from(statusMap.values());
    let history = (await this.store.get<DownloadItem[]>('history')) || [];
    if (!Array.isArray(history)) history = [];

    for (const status of allStatuses) {
      if (status.status.toLowerCase() === 'completed') continue;
      
      const external = this.externalDownloads.get(status.id);
      const historyItem = history.find((item: DownloadItem) => item.id === status.id);
      const filePath = external?.savePath || status.outputPath || historyItem?.savePath || '';
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
        path: filePath,
      };
      console.log('[DownloadManager] Emitting download-progress from poll():', progress.id, progress.status);
      this.emit('download-progress', progress);
    }
  }

  private async handleDownloadComplete(id: string, status: DownloadStatus) {
    let history = (await this.store.get<DownloadItem[]>('history')) || [];
    if (!Array.isArray(history)) history = [];
    const itemIndex = history.findIndex((h: DownloadItem) => h.id === id);
    
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
      await this.store.set('history', newHistory);
    } else {
      console.warn(`Download ${id} completed but not found in history. Recreating item.`);
      
      updatedItem = {
        id,
        filename: status.name || 'Unknown',
        savePath: status.outputPath || '',
        status: 'completed',
        startTime: Date.now(),
        endTime: Date.now(),
        totalBytes: status.size,
        providerName: 'Unknown',
      };
    }

    console.log('[DownloadManager] About to emit download-completed event:', id);
    this.emit('download-completed', {
      ...updatedItem,
      path: updatedItem.savePath,
      timestamp: updatedItem.endTime,
      size: updatedItem.totalBytes,
      status: 'completed'
    });
    console.log('[DownloadManager] Emitted download-completed event');
  }

  async addDownload(urlOrBuffer: string | Buffer, filename: string, providerId?: string, target?: 'local' | 'newsreader'): Promise<string> {
    const id = Math.random().toString(36).substring(7);
    const isNzb = Buffer.isBuffer(urlOrBuffer) || (typeof urlOrBuffer === 'string' && urlOrBuffer.endsWith('.nzb'));
    console.log('[DownloadManager] addDownload called:', { id, urlType: typeof urlOrBuffer, isNzb, target });

    if (target === 'local' || (!target && !isNzb)) {
      console.log('[DownloadManager] Routing to addLocalDownload');
      return this.addLocalDownload(id, urlOrBuffer as string, filename);
    } else {
      console.log('[DownloadManager] Routing to addNewsreaderDownload');
      return this.addNewsreaderDownload(id, urlOrBuffer, filename, providerId);
    }
  }

  private async addNewsreaderDownload(id: string, content: string | Buffer, filename: string, providerId?: string): Promise<string> {
    console.log('[DownloadManager] addNewsreaderDownload called:', { id, contentType: typeof content, filename, providerId });
    let client: BaseNewsreaderClient | undefined;
    let selectedProviderId = providerId;

    if (selectedProviderId) {
      client = this.newsreaders.get(selectedProviderId);
    } else {
      const searchSettings = (await this.store.get<SearchProviderSettings[]>('searchSettings')) || [];
      const nzbSettings = Array.isArray(searchSettings) ? searchSettings.find((s: SearchProviderSettings) => s.type === 'nzb') : undefined;
      if (nzbSettings && (nzbSettings as any).newsreaders) {
        const enabledReaders = (nzbSettings as any).newsreaders
          .filter((r: NewsreaderSettings) => r.enabled)
          .sort((a: NewsreaderSettings, b: NewsreaderSettings) => (a.priority || 0) - (b.priority || 0));
        
        if (enabledReaders.length > 0) {
          const providerId = enabledReaders[0].id;
          if (providerId) {
            selectedProviderId = providerId;
            client = this.newsreaders.get(providerId);
          }
        }
      }
    }

    if (!client || !selectedProviderId) {
      if (typeof content === 'string') {
        return this.addLocalDownload(id, content, filename);
      }
      throw new Error('No newsreader available to handle NZB buffer');
    }

    const searchSettings = (await this.store.get<SearchProviderSettings[]>('searchSettings')) || [];
    const nzbSettings = Array.isArray(searchSettings) ? searchSettings.find((s: SearchProviderSettings) => s.type === 'nzb') : undefined;
    const selectedSettings = (nzbSettings as any)?.newsreaders?.find((reader: NewsreaderSettings) => reader.id === selectedProviderId);
    
    const downloadSettings = await this.store.get<DownloadSettings>('downloadSettings');
    const downloadPath = selectedSettings?.downloadPath || downloadSettings?.downloadDirectory || '';

    if (selectedSettings?.type === 'direct' && !downloadPath) {
      const newsreaderName = selectedSettings.name || selectedProviderId;
      throw new Error(`Download path not configured. Please configure a download path in Settings > Newsreaders > ${newsreaderName} before downloading with Direct Usenet.`);
    }

    let buffer: Buffer;
    if (typeof content === 'string') {
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        console.log('[DownloadManager] Fetching NZB via CapacitorHttp:', content);

        const response = await CapacitorHttp.get({
          url: content,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'application/x-nzb'
          },
          responseType: 'arraybuffer' as any
        });

        if (response.status !== 200) {
          const errorData = response.data;
          let errorBody: string;
          try {
            errorBody = typeof errorData === 'string'
              ? errorData
              : errorData instanceof ArrayBuffer
                ? `ArrayBuffer (${errorData.byteLength} bytes)`
                : JSON.stringify(errorData || {});
          } catch {
            errorBody = String(errorData);
          }
          console.error('[DownloadManager] Failed to fetch NZB file:', response.status, errorBody);
          throw new Error(`Failed to fetch NZB file: HTTP ${response.status}`);
        }

        try {
          const responseData = response.data;
          
          if (responseData instanceof ArrayBuffer) {
            console.log('[DownloadManager] Received ArrayBuffer, size:', responseData.byteLength);
            buffer = Buffer.from(new Uint8Array(responseData));
          } else if (typeof responseData === 'string') {
            console.log('[DownloadManager] Received base64 string, length:', responseData.length);
            
            try {
              buffer = Buffer.from(responseData, 'base64');
              console.log('[DownloadManager] Decoded as base64, buffer size:', buffer.length);
              
              const asString = buffer.toString('utf-8').trim().substring(0, Math.min(100, buffer.length));
              
              if (asString.startsWith('<?xml')) {
                console.log('[DownloadManager] Buffer appears to be valid NZB XML');
              } else {
                console.log('[DownloadManager] Buffer does not start with XML, treating as UTF-8 string instead');
                buffer = Buffer.from(responseData, 'utf-8');
                console.log('[DownloadManager] Created buffer from UTF-8, size:', buffer.length);
              }
            } catch (decodeError) {
              console.log('[DownloadManager] Base64 decode failed, treating as UTF-8:', decodeError);
              buffer = Buffer.from(responseData, 'utf-8');
            }
          } else {
            console.log('[DownloadManager] Response data type:', typeof responseData);
            buffer = Buffer.from(responseData as any);
          }

          console.log('[DownloadManager] Final buffer size:', buffer.length);
        } catch (bufferError) {
          console.error('[DownloadManager] Failed to create buffer from response:', bufferError);
          throw new Error(`Failed to process NZB data: ${bufferError instanceof Error ? bufferError.message : String(bufferError)}`);
        }
      } else {
        const response = await axios.get(content, { responseType: 'arraybuffer' });
        buffer = Buffer.from(response.data);
      }
    } else {
      buffer = content;
    }

    console.log('[DownloadManager] About to call client.addNzb():', { filename, downloadPath, clientType: selectedSettings?.type });
    console.log('[DownloadManager] Buffer size:', buffer.length, 'First 100 chars:', buffer.toString('utf-8', 0, 100));

    const externalId = await client.addNzb(buffer, filename, 'default', downloadPath);
    console.log('[DownloadManager] client.addNzb() returned:', externalId);

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

    let history = (await this.store.get<DownloadItem[]>('history')) || [];
    if (!Array.isArray(history)) history = [];
    await this.store.set('history', [downloadItem, ...history]);
    
    this.externalDownloads.set(id, { providerId: selectedProviderId!, externalId, filename, savePath: downloadPath });
    
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

    let history = (await this.store.get<DownloadItem[]>('history')) || [];
    if (!Array.isArray(history)) history = [];
    await this.store.set('history', [downloadItem, ...history]);

    const downloadSettings = await this.store.get<DownloadSettings>('downloadSettings');
    const targetDirectory = downloadSettings?.downloadDirectory?.trim();

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      try {
        const response = await CapacitorHttp.get({
          url,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'application/x-nzb'
          }
        });

        if (response.status !== 200) {
          throw new Error(`Failed to download NZB: HTTP ${response.status}`);
        }

        const downloadPath = targetDirectory || 'Downloads';
        const normalizedPath = downloadPath.replace(/\/+$/, '');
        const sanitizedFilename = filename.endsWith('.nzb') ? filename : `${filename}.nzb`;
        const savePath = normalizedPath ? `${normalizedPath}/${sanitizedFilename}` : sanitizedFilename;

        console.log(`[DownloadManager] Downloading to path: ${savePath}, base directory: ${normalizedPath}`);

        const dirExists = await this.fileSystem.exists(normalizedPath);
        if (!dirExists) {
          await this.fileSystem.mkdir(normalizedPath);
        }

        const buffer = Buffer.from(response.data);
        await this.fileSystem.writeFile(savePath, buffer);

        downloadItem.savePath = savePath;
        downloadItem.totalBytes = buffer.length;

        const progress: DownloadStatus = {
          id,
          name: sanitizedFilename,
          size: buffer.length,
          remainingSize: 0,
          progress: 100,
          status: 'Completed',
          speed: 0,
          eta: 0,
          outputPath: savePath,
        };

        this.localDownloads.set(id, progress);
        console.log('[DownloadManager] Instance:', this.instanceId, 'About to emit download-progress event for local download:', id);
        console.log('[DownloadManager] Instance:', this.instanceId, 'Listener count:', this.listenerCount('download-progress'));
        this.emit('download-progress', {
          id,
          filename: sanitizedFilename,
          percent: 1,
          transferredBytes: buffer.length,
          totalBytes: buffer.length,
          status: 'completed',
          speed: 0,
          providerName: 'Local',
          path: savePath,
        });
        console.log('[DownloadManager] Instance:', this.instanceId, 'Emitted download-progress event');

        console.log('[DownloadManager] Instance:', this.instanceId, 'About to call handleDownloadComplete');
        await this.handleDownloadComplete(id, progress);
        console.log('[DownloadManager] Instance:', this.instanceId, 'handleDownloadComplete returned');

        let currentHistory = (await this.store.get<DownloadItem[]>('history')) || [];
        if (!Array.isArray(currentHistory)) currentHistory = [];
        const updatedHistory = currentHistory.map((h: DownloadItem) => 
          h.id === id ? { ...downloadItem, status: 'completed', endTime: Date.now() } : h
        );
        await this.store.set('history', updatedHistory);
      } catch (error) {
        console.error(`Failed to download NZB: ${error}`);
        throw new Error(`Failed to download NZB: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      const downloadOptions = {
        onStarted: async (item: any) => {
          downloadItem.filename = item.getFilename();
          downloadItem.savePath = item.getSavePath();
          downloadItem.totalBytes = item.getTotalBytes();
          
          let currentHistory = (await this.store.get<DownloadItem[]>('history')) || [];
          if (!Array.isArray(currentHistory)) currentHistory = [];
          const updatedHistory = currentHistory.map((h: DownloadItem) => 
            h.id === id ? { ...h, filename: downloadItem.filename, savePath: downloadItem.savePath, totalBytes: downloadItem.totalBytes } : h
          );
          await this.store.set('history', updatedHistory);
        },
        onProgress: (progress: any) => {
          const status: DownloadStatus = {
            id,
            name: downloadItem.filename,
            size: downloadItem.totalBytes || 0,
            remainingSize: (downloadItem.totalBytes || 0) * (1 - progress.percent),
            progress: progress.percent * 100,
            status: 'Downloading',
            speed: 0,
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
    }

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
    
    let history = (await this.store.get<DownloadItem[]>('history')) || [];
    if (!Array.isArray(history)) history = [];
    
    if (removeFiles) {
      const item = history.find((h: DownloadItem) => h.id === id);
      if (item && item.savePath) {
        try {
          const exists = await this.fileSystem.exists(item.savePath);
          if (exists) {
            await this.fileSystem.unlink(item.savePath);
          }
        } catch (error) {
          console.error(`Failed to delete files at ${item.savePath}:`, error);
        }
      }
    }

    const newHistory = history.filter((h: DownloadItem) => h.id !== id);
    await this.store.set('history', newHistory);
    
    return true;
  }

  async deleteWithFiles(id: string): Promise<boolean> {
    return this.delete(id, true);
  }

  async updateSettings() {
    this.newsreaders.clear();
    await this.initializeNewsreaders();
  }
}
