import { Capacitor } from '@capacitor/core';
import { IFileSystem } from '@/core/interfaces/IFileSystem.js';
import { IStorage } from '@/core/interfaces/IStorage.js';
import { NodeFSAdapter } from '../../electron/adapters/NodeFSAdapter.js';
import { CapacitorFSAdapter } from '../../src/mobile/adapters/CapacitorFSAdapter.js';
import { NodeStorageAdapter } from '../../electron/adapters/NodeStorageAdapter.js';
import { ElectronRendererStorageAdapter } from './adapters/ElectronRendererStorageAdapter.js';
import { CapacitorStorageAdapter } from '../../src/mobile/adapters/CapacitorStorageAdapter.js';
import { NodeNetworkAdapter } from '../../electron/adapters/NodeNetworkAdapter.js';
import { TlsSocketNetworkAdapter } from '../../src/mobile/adapters/TlsSocketNetworkAdapter.js';
import { INetwork } from '@/core/interfaces/INetwork.js';
import { DownloadManager } from './download/DownloadManager.js';
import { SearchManager } from './search/SearchManager.js';

export enum Platform {
  Electron = 'electron',
  Android = 'android',
  IOS = 'ios',
  Web = 'web'
}

export interface ServiceContainerConfig {
  forcePlatform?: Platform;
  electronWindow?: any;
  electronStore?: any;
}

export class ServiceContainer {
  private _platform: Platform;
  private config: ServiceContainerConfig;

  private _networkAdapter: INetwork | null = null;
  private _fileSystemAdapter: IFileSystem | null = null;
  private _storageAdapter: IStorage | null = null;
  private _downloadManager: DownloadManager | null = null;
  private _downloadManagerPromise: Promise<DownloadManager> | null = null;
  private _searchManager: SearchManager | null = null;

  constructor(config: ServiceContainerConfig = {}) {
    this.config = config;
    this._platform = this.detectPlatform();
  }

  private detectPlatform(): Platform {
    if (this.config.forcePlatform) {
      return this.config.forcePlatform;
    }

    const isCapacitorNative = Capacitor.isNativePlatform();
    
    if (isCapacitorNative) {
      const platform = Capacitor.getPlatform();
      if (platform === 'android') {
        return Platform.Android;
      } else if (platform === 'ios') {
        return Platform.IOS;
      }
    }

    if (typeof window !== 'undefined' && (window as any).electron) {
      return Platform.Electron;
    }

    if (typeof window !== 'undefined' && (window as any).require?.('electron')) {
      return Platform.Electron;
    }

    if (typeof window !== 'undefined' && Capacitor.getPlatform() === 'web') {
      return Platform.Web;
    }

    return Platform.Electron;
  }

  get platform(): Platform {
    return this._platform;
  }

  get isMobile(): boolean {
    return this._platform === Platform.Android || this._platform === Platform.IOS;
  }

  get isDesktop(): boolean {
    return this._platform === Platform.Electron || this._platform === Platform.Web;
  }

  getNetworkAdapter(): INetwork {
    if (!this._networkAdapter) {
      this._networkAdapter = this.createNetworkAdapter();
    }
    return this._networkAdapter;
  }

  private createNetworkAdapter(): INetwork {
    if (this.isMobile) {
      console.log('[ServiceContainer] Creating TlsSocketNetworkAdapter for mobile platform');
      return new TlsSocketNetworkAdapter();
    } else {
      console.log('[ServiceContainer] Creating NodeNetworkAdapter for desktop platform');
      return new NodeNetworkAdapter();
    }
  }

  getFileSystemAdapter(): IFileSystem {
    if (!this._fileSystemAdapter) {
      this._fileSystemAdapter = this.createFileSystemAdapter();
    }
    return this._fileSystemAdapter;
  }

  private createFileSystemAdapter(): IFileSystem {
    if (this.isMobile) {
      return new CapacitorFSAdapter();
    } else {
      return new NodeFSAdapter();
    }
  }

  getStorageAdapter(): IStorage {
    if (!this._storageAdapter) {
      this._storageAdapter = this.createStorageAdapter();
    }
    return this._storageAdapter;
  }

  private createStorageAdapter(): IStorage {
    if (this._platform === Platform.Electron) {
      return new ElectronRendererStorageAdapter();
    }
    if (this.isMobile) {
      return new CapacitorStorageAdapter();
    } else {
      return new NodeStorageAdapter();
    }
  }

  async getDownloadManager(): Promise<DownloadManager> {
    console.log('[ServiceContainer] getDownloadManager called, cached:', !!this._downloadManager, 'instance:', this._downloadManager ? (this._downloadManager as any).instanceId : 'none');
    
    if (this._downloadManager) {
      console.log('[ServiceContainer] Returning cached DownloadManager instance:', (this._downloadManager as any).instanceId);
      return this._downloadManager;
    }
    
    if (this._downloadManagerPromise) {
      console.log('[ServiceContainer] Waiting for in-flight DownloadManager creation');
      return this._downloadManagerPromise;
    }
    
    console.log('[ServiceContainer] Creating new DownloadManager');
    this._downloadManagerPromise = this.createDownloadManager();
    this._downloadManager = await this._downloadManagerPromise;
    this._downloadManagerPromise = null;
    console.log('[ServiceContainer] Created DownloadManager instance:', (this._downloadManager as any).instanceId);
    
    return this._downloadManager;
  }

  private async createDownloadManager(): Promise<DownloadManager> {
    const storage = this.getStorageAdapter();
    const fileSystem = this.getFileSystemAdapter();
    // Create a factory that returns NEW instances each time (important for connection pooling)
    const networkFactory: () => INetwork = () => this.createNetworkAdapter();
    const manager = new DownloadManager(storage, fileSystem, networkFactory);
    await manager.initialize();
    return manager;
  }

  async getSearchManager(): Promise<SearchManager> {
    if (!this._searchManager) {
      this._searchManager = await this.createSearchManager();
    }
    return this._searchManager;
  }

  private async createSearchManager(): Promise<SearchManager> {
    const storage = this.getStorageAdapter();
    const searchSettings = (await storage.get<any[]>('searchSettings')) || [];
    return new SearchManager(searchSettings);
  }

  async refreshServices(): Promise<void> {
    this._searchManager = null;
  }

  reset(): void {
    this._networkAdapter = null;
    this._fileSystemAdapter = null;
    this._storageAdapter = null;
    this._downloadManager = null;
    this._downloadManagerPromise = null;
    this._searchManager = null;
  }
}

export const serviceContainer = new ServiceContainer();

export type ServiceContainerType = ServiceContainer;

export type { INetwork, IFileSystem, IStorage };

export { DownloadManager, SearchManager };
